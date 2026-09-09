'use client';

// Phase 4.4 — create / edit drawer for admin user management.
//
// Mirrors the shape of CarrierSheet / DriverSheet (RHF + zodResolver +
// onSubmit handler that picks the create vs update slice). Create allows an
// optional `password`; edit drops password + login (immutable). The temporary
// password (when the API returns one) is surfaced in a long-lived toast so
// the admin can copy it before it disappears.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  AssignableRole,
  CreateUserSchema,
  UpdateUserSchema,
  type CreateUserDto,
  type UpdateUserDto,
  type UserDtoFull,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { FormField } from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useCreateUser, useUpdateUser } from '@/lib/hooks/useUsers';

// Roles the UI offers in the dropdown — przewoznik is excluded because
// carrier users are provisioned via POST /carriers (the API would reject it
// anyway, but the dropdown shouldn't even tempt the admin).
const SELECTABLE_ROLES = [
  'admin',
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'eksport',
  'weryfikator',
] as const;
type SelectableRole = (typeof SELECTABLE_ROLES)[number];

// Form-state shape carries every possible field; we slice into the right
// CreateUserDto / UpdateUserDto in onSubmit. `password` and `login` only
// appear on create.
interface UserFormValues {
  login: string;
  name: string;
  email: string;
  role: SelectableRole;
  password?: string;
  liderEmail?: string;
  active: boolean;
  // ── MAGSpace directory (docs/24) — edit only ───────────
  managedBy: 'local' | 'magspace';
  /** `''` = no override, i.e. the stanowisko mapping decides the role. */
  roleOverride: '' | AssignableRole;
}

const EMPTY_DEFAULTS: UserFormValues = {
  login: '',
  name: '',
  email: '',
  role: 'pracownik',
  password: '',
  liderEmail: '',
  active: true,
  // A hand-created account is always locally managed; an admin can hand it to
  // the directory afterwards.
  managedBy: 'local',
  roleOverride: '',
};

interface Props {
  open: boolean;
  user: UserDtoFull | null;
  onClose: () => void;
}

export function UserSheet({ open, user, onClose }: Props) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');
  const isEdit = user !== null;

  // Create schema includes login + optional password; update drops both and
  // requires nothing (PATCH). Both are .strict() — we slice the form values
  // before calling mutate so the API never sees the password on edit etc.
  const form = useForm<UserFormValues>({
    resolver: zodResolver(
      // RHF needs a single resolver — we map the slice ourselves in onSubmit,
      // so just use CreateUserSchema.passthrough() to cover all fields the
      // form carries (Zod will yell about login on edit otherwise).
      isEdit
        ? UpdateUserSchema.passthrough()
        : CreateUserSchema.passthrough(),
    ) as never,
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && user) {
      form.reset({
        login: user.login,
        name: user.name ?? '',
        email: user.email,
        role: (user.role === 'przewoznik'
          ? 'pracownik'
          : user.role) as SelectableRole,
        password: '',
        liderEmail: user.liderEmail ?? '',
        active: user.active,
        managedBy: user.managedBy,
        roleOverride: user.roleOverride ?? '',
      });
    } else {
      form.reset(EMPTY_DEFAULTS);
    }
  }, [open, isEdit, user, form]);

  const createM = useCreateUser({
    onSuccess: (created) => {
      // Phase 2 dev-only — the API returns the temp password in the body.
      // Long-lived toast (30s) so the admin can copy it.
      if (created.temporaryPassword) {
        toast.success(
          t('tempPasswordToast', { password: created.temporaryPassword }),
          { duration: 30_000 },
        );
      } else {
        toast.success(tCommon('saved'));
      }
      onClose();
    },
    onError: (err) => toast.error(formatApiError(err, tCommon('errorGeneric'))),
  });

  const updateM = useUpdateUser({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (err) => toast.error(formatApiError(err, tCommon('errorGeneric'))),
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      // Clean empty strings → undefined so optional fields (password,
      // liderEmail) don't trip Zod with "" against `.email()` / passwordRegex.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined || v === null) continue;
        cleaned[k] = v;
      }

      if (isEdit && user) {
        // Update slice — drop login + password (immutable through PATCH).
        const { login: _l, password: _p, ...rest } = cleaned;
        void _l;
        void _p;
        // `roleOverride` is the one field where the empty string is MEANINGFUL:
        // it means "clear the hand-granted role and let the stanowisko mapping
        // decide again". The generic cleaner above drops empty strings, so it
        // has to be restored explicitly — otherwise an override could be set
        // but never removed.
        if (values.roleOverride === '' && user.roleOverride !== null) {
          rest.roleOverride = null;
        }
        updateM.mutate({ id: user.id, body: rest as UpdateUserDto });
      } else {
        // Create slice — drop the form-only `active` if absent; the API
        // defaults to true on create anyway.
        createM.mutate(cleaned as CreateUserDto);
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  // Only show the lider-email row when the active role is `planista` —
  // the field is meaningless for the others (per docs/03-roles.md#planista).
  const watchedRole = form.watch('role');
  const showLiderEmail = watchedRole === 'planista';

  // A directory-managed account has `role` and `active` re-synced on every
  // sign-in and every reconcile run, so the api refuses to change them here
  // (422 USER_MANAGED_BY_MAGSPACE). Disabling the inputs makes that visible
  // BEFORE the admin types into a field whose value would be reverted.
  //
  // `watch` rather than `user.managedBy`: flipping the toggle to `local`
  // unlocks both fields in the same edit, which is the documented way to take
  // an account back (docs/24 §A2).
  const watchedManagedBy = form.watch('managedBy');
  const isDirectoryManaged = isEdit && watchedManagedBy === 'magspace';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? t('editUser') : t('newUser')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && user ? user.login : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-4">
              <FormField
                label={t('fields.login')}
                required={!isEdit}
                error={errMsg('login')}
                htmlFor="user-login"
              >
                <Input
                  id="user-login"
                  disabled={isEdit}
                  autoComplete="off"
                  {...form.register('login')}
                />
              </FormField>

              <FormField
                label={t('fields.name')}
                required
                error={errMsg('name')}
                htmlFor="user-name"
              >
                <Input id="user-name" {...form.register('name')} />
              </FormField>

              <FormField
                label={t('fields.email')}
                required
                error={errMsg('email')}
                htmlFor="user-email"
              >
                <Input
                  id="user-email"
                  type="email"
                  autoComplete="off"
                  {...form.register('email')}
                />
              </FormField>

              <FormField
                label={t('fields.role')}
                required
                description={
                  isDirectoryManaged ? t('fields.managedHint') : undefined
                }
                error={errMsg('role')}
                htmlFor="user-role"
              >
                <Select
                  id="user-role"
                  disabled={isDirectoryManaged}
                  {...form.register('role')}
                >
                  {SELECTABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {tRoles(r)}
                    </option>
                  ))}
                </Select>
              </FormField>

              {showLiderEmail && (
                <FormField
                  label={t('fields.liderEmail')}
                  description={t('fields.liderEmailHint')}
                  error={errMsg('liderEmail')}
                  htmlFor="user-liderEmail"
                >
                  <Input
                    id="user-liderEmail"
                    type="email"
                    autoComplete="off"
                    {...form.register('liderEmail')}
                  />
                </FormField>
              )}

              {!isEdit && (
                <FormField
                  label={t('fields.password')}
                  description={t('fields.passwordHint')}
                  error={errMsg('password')}
                  htmlFor="user-password"
                >
                  <Input
                    id="user-password"
                    type="text"
                    autoComplete="new-password"
                    {...form.register('password')}
                  />
                </FormField>
              )}

              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox
                  disabled={isDirectoryManaged}
                  {...form.register('active')}
                />
                {t('fields.active')}
              </label>

              {isEdit && (
                <>
                  <FormField
                    label={t('fields.managedBy')}
                    description={t('fields.managedByHint')}
                    htmlFor="user-managedBy"
                  >
                    <Select id="user-managedBy" {...form.register('managedBy')}>
                      <option value="local">{t('fields.local')}</option>
                      <option value="magspace">{t('fields.magspace')}</option>
                    </Select>
                  </FormField>

                  {/* The only access field editable on a managed account — and
                      the way an admin approves someone whose stanowisko is
                      deliberately unmapped (docs/24 §4). */}
                  <FormField
                    label={t('fields.roleOverride')}
                    description={t('fields.roleOverrideHint')}
                    htmlFor="user-roleOverride"
                  >
                    <Select
                      id="user-roleOverride"
                      {...form.register('roleOverride')}
                    >
                      <option value="">{t('fields.roleOverrideNone')}</option>
                      {AssignableRole.options.map((r) => (
                        <option key={r} value={r}>
                          {tRoles(r)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </>
              )}
            </div>
          </SheetBody>

          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? tCommon('saving') : tCommon('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Surface RFC 7807 4xx detail / message from the API (`Login lub email są
 * już zajęte` etc.). 5xx falls through to the generic fallback.
 */
function formatApiError(err: unknown, fallback: string): string {
  if (
    err instanceof ApiResponseError &&
    err.status >= 400 &&
    err.status < 500
  ) {
    return err.message || fallback;
  }
  return fallback;
}
