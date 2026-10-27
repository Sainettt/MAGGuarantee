'use client';

// Phase 4.4 — create / edit drawer for admin user management.
//
// Mirrors the shape of CarrierSheet / DriverSheet (RHF + zodResolver +
// onSubmit handler that picks the create vs update slice). Create allows an
// optional `password`; edit drops password + login (immutable). The temporary
// password (when the API returns one) is surfaced in a long-lived toast so
// the admin can copy it before it disappears.
//
// Leaders (docs/28): the «Lider» checkbox under the role select. Who may change
// it follows who owns `role` — see lib/users/liderCheckboxState.ts for the
// rules. Two invariants live here, in the event handlers:
//   - any change of the `role` / `roleOverride` select resets the flag to
//     `false` (also between two leader roles) — on the select's onChange, NOT
//     in an effect on `watch`, which would also fire on `form.reset` and wipe
//     the value loaded from the user;
//   - on edit the flag is sent only when it differs from `user.lider`, so an
//     unrelated edit of a mapping-owned leader never trips a 422.
//
// «Przełożony (lider)» (docs/29 R8/U9/U10, docs/14 §17.7) replaces the free
// «E-mail lidera (CC)» field: a select of active planista leaders, shown only
// when the EFFECTIVE role (`roleOverride || role`) is `planista`, reset when
// the effective role stops being planista, editable on MAGSpace accounts too
// (the directory never sets it), sent on PATCH only when changed. A stale
// stored link (the target lost the flag / is inactive — U10) stays an option,
// marked, with a warning — see lib/users/liderSelect.ts.
//
// Per-user permissions (docs/25 §3 B6, docs/14 A.1–A.15): edit mode ends with
// <UserPermissionsBlock>. The form keeps the FULL `extraPermissions` /
// `deniedPermissions` lists; the PATCH carries the part the final `(role,
// lider)` admits, and each list only when it differs from the stored one. The
// four B6 refusals (422) are shown under their group / the role field, never
// as a toast. `role` here is the role COLUMN (the select, locked to the stored
// role on MAGSpace accounts) — never `roleOverride`: the column is what the api
// computes and validates with; a pending override only gets a hint.
//
// Carrier rows (A.8): the role is bound to the Carrier row — the access
// fields render as a read-only <dl> under one <LockNotice>, and the PATCH
// never carries `role` / `lider` / `liderId` / `managedBy` / `roleOverride`
// (the form used to coerce `przewoznik` to `pracownik` and send it; the api
// now answers that with 422 USER_CARRIER_ROLE_LOCKED).

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  AssignableRole,
  CreateUserSchema,
  LIDER_ROLES,
  RoleSchema,
  UpdateUserSchema,
  refineLiderPair,
  type CreateUserDto,
  type Role,
  type UpdateUserDto,
  type UserDtoFull,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { LockNotice } from '@/components/ui/LockNotice';
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
import { FormField, FormMessage } from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { permissionLabelKey } from '@/lib/auth/permissionGroups';
import type { Permission } from '@/lib/auth/permissions';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { usePlannerLiders } from '@/lib/hooks/useLookups';
import { useCreateUser, useUpdateUser } from '@/lib/hooks/useUsers';
import { isCarrierAccount, omitCarrierLockedFields } from '@/lib/users/carrierAccount';
import {
  liderAfterRoleOverrideChange,
  liderCheckboxState,
  liderCreateValue,
  liderPatchValue,
} from '@/lib/users/liderCheckboxState';
import { liderErrorKind } from '@/lib/users/liderErrors';
import {
  permissionErrorField,
  permissionErrorMessageKey,
  permissionOverrideError,
  type PermissionOverrideError,
} from '@/lib/users/permissionErrors';
import {
  droppedOnRoleChange,
  overridesPatch,
  pendingRoleOverride,
  type OverridesState,
} from '@/lib/users/permissionOverrides';
import {
  liderIdCreateValue,
  liderIdPatchValue,
  liderSelectModel,
  showsLiderField,
} from '@/lib/users/liderSelect';

import { UserPermissionsBlock, type PermissionGroupField } from './UserPermissionsBlock';

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

// Form-state shape carries every possible field; we slice into the right
// CreateUserDto / UpdateUserDto in onSubmit. `password` and `login` only
// appear on create.
interface UserFormValues {
  login: string;
  name: string;
  email: string;
  /**
   * One of `SELECTABLE_ROLES` — or `przewoznik` on a carrier row, which keeps
   * its stored role (A.8): the select is not rendered there and the PATCH
   * never carries it.
   */
  role: Role;
  password?: string;
  /**
   * The planista's leader (docs/29 U9) — `''` = none («brak», an admin
   * decides his transfers). Not the `lider` flag below: that says whether
   * THIS user is a leader, `liderId` says WHOSE planista he is.
   */
  liderId: string;
  active: boolean;
  /** Leader flag over `role` (docs/28). */
  lider: boolean;
  // ── MAGSpace directory (docs/24) — edit only ───────────
  managedBy: 'local' | 'magspace';
  /** `''` = no override, i.e. the stanowisko mapping decides the role. */
  roleOverride: '' | AssignableRole;
  // ── Per-user permissions (docs/25 §3 B6) — edit only ───
  /** FULL lists, incl. entries the current role does not admit (A.7). */
  extraPermissions: Permission[];
  deniedPermissions: Permission[];
}

const EMPTY_DEFAULTS: UserFormValues = {
  login: '',
  name: '',
  email: '',
  role: 'pracownik',
  password: '',
  liderId: '',
  active: true,
  lider: false,
  // A hand-created account is always locally managed; an admin can hand it to
  // the directory afterwards.
  managedBy: 'local',
  roleOverride: '',
  extraPermissions: [],
  deniedPermissions: [],
};

/**
 * Edit-form resolver. The form keeps "no hand-granted role" as `''` (a <select>
 * cannot hold `null`), but `UpdateUserSchema.roleOverride` only accepts a role
 * or `null` — validating the raw form values against it rejected `''` and
 * blocked EVERY edit of a user without an override. The API contract stays
 * strict; only the form accepts `''`, and `onSubmit` maps it to `null`.
 *
 * `role` accepts every role for the same reason: a carrier row keeps
 * `przewoznik` in the form (A.8), and `onSubmit` never sends it.
 */
const EditFormSchema = UpdateUserSchema.extend({
  role: RoleSchema.optional(),
  roleOverride: AssignableRole.or(z.literal('')).nullable().optional(),
}).passthrough();

/**
 * Create-form resolver: `.passthrough()` for the extra form-only fields (see
 * the resolver comment below) plus the same `(role, lider)` check the api
 * runs on `POST /users`. `CreateUserSchema` itself stays a plain object —
 * that is what keeps `.passthrough()` available.
 */
const CreateFormSchema = CreateUserSchema.passthrough().superRefine(refineLiderPair);

/**
 * The `roleOverride` that counts for the effective role: only a MAGSpace
 * account carries one (a local account's override is cleared by the api on
 * the magspace → local switch, and create has none).
 */
function effectiveOverride(
  isEdit: boolean,
  managedBy: 'local' | 'magspace',
  roleOverride: Role | '',
): Role | '' {
  return isEdit && managedBy === 'magspace' ? roleOverride : '';
}

interface Props {
  open: boolean;
  user: UserDtoFull | null;
  onClose: () => void;
}

export function UserSheet({ open, user, onClose }: Props) {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');
  const tPerm = useTranslations('permissions');
  const locale = useLocale();
  const isEdit = user !== null;
  const isCarrierRow = isEdit && isCarrierAccount(user);

  // Create schema includes login + optional password; update drops both and
  // requires nothing (PATCH). Both are .strict() — we slice the form values
  // before calling mutate so the API never sees the password on edit etc.
  const form = useForm<UserFormValues>({
    resolver: zodResolver(
      // RHF needs a single resolver — we map the slice ourselves in onSubmit,
      // so just use CreateUserSchema.passthrough() to cover all fields the
      // form carries (Zod will yell about login on edit otherwise).
      isEdit ? EditFormSchema : CreateFormSchema,
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
        // The stored role as is — a carrier keeps `przewoznik` (A.8).
        role: user.role,
        password: '',
        liderId: user.liderId ?? '',
        active: user.active,
        // From the user, not `false`: otherwise the submit would "change" a
        // mapping-owned leader flag on every edit and get a 422.
        lider: user.lider,
        managedBy: user.managedBy,
        roleOverride: user.roleOverride ?? '',
        // `?? []`: an api that predates B6 does not send the lists.
        extraPermissions: [...(user.extraPermissions ?? [])],
        deniedPermissions: [...(user.deniedPermissions ?? [])],
      });
    } else {
      form.reset(EMPTY_DEFAULTS);
    }
  }, [open, isEdit, user, form]);

  // «Planista, Dyspozytor, …» for the leader-rule error — built from
  // LIDER_ROLES so the message cannot drift from the rule.
  const liderRoles = LIDER_ROLES.map((r) => tRoles(r)).join(', ');

  const apiErrorMessage = (err: unknown): string => {
    switch (liderErrorKind(err)) {
      case 'requiresLiderRole':
        return t('errors.liderRequiresLiderRole', { roles: liderRoles });
      case 'managedByMagspace':
        return t('errors.liderManagedByMagspace');
      case 'liderIdInvalid':
        return t('errors.liderIdInvalid');
      default:
        return formatApiError(err, tCommon('errorGeneric'));
    }
  };

  // `{list}` of a B6 refusal: the labels of the refused ids (A.9, A.13).
  const listFormat = useMemo(
    () => new Intl.ListFormat(locale, { type: 'conjunction' }),
    [locale],
  );
  const permissionErrorMessage = (error: PermissionOverrideError): string =>
    t(permissionErrorMessageKey(error), {
      // The role the api judged the lists against — the role column.
      role: tRoles(form.getValues('role')),
      list: listFormat.format(error.permissions.map((p) => tPerm(permissionLabelKey(p)))),
    });

  /**
   * 422 USER_LIDER_ID_INVALID goes under its field (§17.7), the B6 refusals
   * under their permission group / the role (A.9); the rest toast.
   */
  const onMutationError = (err: unknown): void => {
    const permissionError = permissionOverrideError(err);
    if (permissionError) {
      form.setError(permissionErrorField(permissionError.kind), {
        message: permissionErrorMessage(permissionError),
      });
      return;
    }
    if (liderErrorKind(err) === 'liderIdInvalid') {
      form.setError('liderId', { message: t('errors.liderIdInvalid') });
      return;
    }
    toast.error(apiErrorMessage(err));
  };

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
    onError: onMutationError,
  });

  const updateM = useUpdateUser({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: onMutationError,
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      // Clean empty strings → undefined so optional fields (password) don't
      // trip Zod with "" against passwordRegex. `liderId` is re-added below
      // by its own rule (its `''` means «none», which PATCH must send as null).
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (k === 'liderId') continue;
        // Edit-only and sent by their own rule below (only when changed);
        // `POST /users` is `.strict()` and would 400 on them.
        if (k === 'extraPermissions' || k === 'deniedPermissions') continue;
        if (v === '' || v === undefined || v === null) continue;
        cleaned[k] = v;
      }

      // Resolved from the submitted values, not from the render-time watch.
      const liderState = liderCheckboxState({
        isEdit,
        managedBy: values.managedBy,
        role: values.role,
        roleOverride: values.roleOverride,
      });
      const isPlanista = showsLiderField(
        values.role,
        effectiveOverride(isEdit, values.managedBy, values.roleOverride),
      );

      if (isEdit && user) {
        // Update slice — drop login + password (immutable through PATCH).
        // `lider` is re-added below only when it actually changes.
        const { login: _l, password: _p, lider: _li, ...rest } = cleaned;
        void _l;
        void _p;
        void _li;
        const lider = liderPatchValue(liderState, values.lider, user.lider);
        if (lider !== undefined) rest.lider = lider;
        // Like the flag: only a change, and never next to a non-planista
        // effective role (the api clears the link itself there).
        const liderId = liderIdPatchValue({
          formValue: values.liderId,
          storedValue: user.liderId,
          isPlanista,
        });
        if (liderId !== undefined) rest.liderId = liderId;
        if (values.managedBy === 'local') {
          // A hand-granted role only means something to the directory. When
          // the account is (or goes back to being) locally managed it is not
          // sent at all — the api clears it on the magspace → local switch, so
          // a stale override cannot resurface on a later hand-back.
          delete rest.roleOverride;
        } else if (values.roleOverride === '' && user.roleOverride !== null) {
          // `roleOverride` is the one field where the empty string is
          // MEANINGFUL: "clear the hand-granted role and let the stanowisko
          // mapping decide again". The generic cleaner above drops empty
          // strings, so it has to be restored explicitly — otherwise an
          // override could be set but never removed.
          rest.roleOverride = null;
        }
        // Per-user permissions (A.7): the part of the form's lists that the
        // FINAL `(role, lider)` admits — the role column (`roleOverride` is
        // not consulted, the api validates against `role`) and `lider` as the
        // api merges it — and each list only when it differs from the stored one.
        const { kept } = droppedOnRoleChange(
          values.role,
          lider ?? user.lider,
          {
            extra: values.extraPermissions ?? [],
            denied: values.deniedPermissions ?? [],
          },
        );
        Object.assign(
          rest,
          overridesPatch(kept, {
            extraPermissions: user.extraPermissions ?? [],
            deniedPermissions: user.deniedPermissions ?? [],
          }),
        );
        // A carrier row never sends its access fields (A.8, 422
        // USER_CARRIER_ROLE_LOCKED otherwise).
        const body = isCarrierRow ? omitCarrierLockedFields(rest) : rest;
        updateM.mutate({ id: user.id, body: body as UpdateUserDto });
      } else {
        // Create slice — drop the edit-only directory fields. They live in
        // EMPTY_DEFAULTS (so `reset` has a value for them) even though their
        // inputs are not rendered on create, and `managedBy: 'local'` is not
        // empty, so the cleaner above keeps it. `CreateUserSchema` is
        // `.strict()` and would 400 on it. A hand-created account is `local`
        // by the column default anyway.
        const { managedBy: _m, roleOverride: _r, ...createBody } = cleaned;
        void _m;
        void _r;
        createBody.lider = liderCreateValue(liderState, values.lider);
        const liderId = liderIdCreateValue({
          formValue: values.liderId,
          isPlanista,
        });
        if (liderId !== undefined) createBody.liderId = liderId;
        createM.mutate(createBody as CreateUserDto);
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

  const watchedRole = form.watch('role');

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

  const watchedRoleOverride = form.watch('roleOverride');
  const liderState = liderCheckboxState({
    isEdit,
    managedBy: watchedManagedBy,
    role: watchedRole,
    roleOverride: watchedRoleOverride,
  });
  const liderHint =
    liderState.mode === 'enabled'
      ? t('fields.liderHint')
      : liderState.mode === 'disabled' && liderState.reason === 'managed'
        ? t('fields.managedHint')
        : t('fields.liderPendingSyncHint');
  // The only issue Zod can raise on `lider` is the pair refine, whose built-in
  // message is Polish-only — show the localised text instead.
  const liderError = errMsg('lider')
    ? t('errors.liderRequiresLiderRole', { roles: liderRoles })
    : undefined;

  // ── «Przełożony (lider)» (§17.7) ─────────────────────────────────────
  // Shown only for an EFFECTIVE planista — the hand-granted role wins on a
  // MAGSpace account (the old e-mail field looked at `role` alone).
  const showLiderId = showsLiderField(
    watchedRole,
    effectiveOverride(isEdit, watchedManagedBy, watchedRoleOverride),
  );
  const lidersQ = usePlannerLiders({ enabled: open && showLiderId });
  const liderModel = useMemo(
    () =>
      liderSelectModel({
        liders: lidersQ.data ?? [],
        selfId: user?.id,
        stored: user?.liderUser ?? null,
      }),
    [lidersQ.data, user],
  );
  // ── «Uprawnienia indywidualne» (A.1–A.15) ────────────────────────────
  // Computed for the role and leader flag the api will END with: the role
  // COLUMN (the select — locked to the stored role on a MAGSpace account; a
  // hand-granted `roleOverride` reaches it only at the next sign-in sync,
  // which then prunes the lists, so it only gets a hint), and `lider` as
  // merged by `liderPatchValue` (an unchanged / mapping-owned flag keeps the
  // stored one). Corrected 2026-10-27 — was `roleOverride || role`.
  const watchedLider = form.watch('lider');
  const watchedExtra = form.watch('extraPermissions');
  const watchedDenied = form.watch('deniedPermissions');
  const overridesBlockRole = watchedRole;
  const overridesPendingRole = isEdit
    ? pendingRoleOverride({
        role: watchedRole,
        managedBy: watchedManagedBy,
        roleOverride: watchedRoleOverride,
      })
    : null;
  const overridesBlockLider =
    isEdit && user
      ? (liderPatchValue(liderState, watchedLider, user.lider) ?? user.lider)
      : watchedLider;
  const onOverridesChange = (next: OverridesState, group: PermissionGroupField) => {
    form.setValue('extraPermissions', next.extra, { shouldDirty: true });
    form.setValue('deniedPermissions', next.denied, { shouldDirty: true });
    form.clearErrors(group === 'extra' ? 'extraPermissions' : 'deniedPermissions');
  };

  const watchedLiderId = form.watch('liderId');
  const selectedLider = liderModel.options.find((o) => o.id === watchedLiderId);
  const selectedIsStale = Boolean(selectedLider?.stale);
  const noLiderOptions = lidersQ.isSuccess && liderModel.options.length === 0;
  const liderIdError = errMsg('liderId');

  // A role change that ends the planista role drops the link (like the flag,
  // docs/28 §9.2 #13) — in the change handler, not an effect on `watch`
  // (which would also fire on `form.reset` and wipe the loaded value).
  const clearLiderIdUnlessPlanista = (nextRole: Role, nextOverride: Role | '') => {
    const stillPlanista = showsLiderField(
      nextRole,
      effectiveOverride(isEdit, form.getValues('managedBy'), nextOverride),
    );
    if (!stillPlanista) form.setValue('liderId', '');
  };

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

              {isCarrierRow && user ? (
                // A.8 — one block-level lock (§6.5.13 tier B) instead of the
                // role / lider / supervisor / management / hand-granted role
                // fields: static values, no disabled selects.
                <div className="space-y-2">
                  <LockNotice id="user-carrier-locked">
                    {t('fields.carrierLocked')}
                  </LockNotice>
                  <dl
                    aria-describedby="user-carrier-locked"
                    className="grid grid-cols-2 gap-x-4 gap-y-1"
                  >
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-text-sub">
                        {t('fields.role')}
                      </dt>
                      <dd className="text-sm font-semibold text-text">
                        {tRoles('przewoznik')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] uppercase tracking-wider text-text-sub">
                        {t('fields.managedBy')}
                      </dt>
                      <dd className="text-sm font-semibold text-text">
                        {t(`fields.${user.managedBy}`)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
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
                    {...form.register('role', {
                      // Any role change drops the leader flag (see header), and
                      // the planista's leader when he stops being a planista.
                      onChange: (e: { target: { value: string } }) => {
                        form.setValue('lider', false);
                        clearLiderIdUnlessPlanista(
                          e.target.value as Role,
                          form.getValues('roleOverride'),
                        );
                      },
                    })}
                  >
                    {SELECTABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tRoles(r)}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}

              {!isCarrierRow && liderState.mode !== 'hidden' && (
                // A single <label> wraps the checkbox (FormField's own label
                // would name it twice); the hint is linked by id.
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-text">
                    <Checkbox
                      id="user-lider"
                      aria-describedby="user-lider-hint"
                      aria-invalid={liderError ? true : undefined}
                      disabled={liderState.mode === 'disabled'}
                      {...form.register('lider')}
                    />
                    {t('fields.lider')}
                  </label>
                  <p id="user-lider-hint" className="text-xs text-text-sub">
                    {liderHint}
                  </p>
                  <FormMessage>{liderError}</FormMessage>
                </div>
              )}

              {!isCarrierRow && showLiderId && (
                // §17.7 — right after the «Lider» flag block (where the old
                // e-mail field was). Active on MAGSpace accounts too (U9).
                <FormField
                  label={t('fields.liderId')}
                  description={
                    noLiderOptions
                      ? t('fields.liderIdNoOptions')
                      : t('fields.liderIdHint')
                  }
                  error={liderIdError}
                  htmlFor="user-liderId"
                >
                  <Select
                    id="user-liderId"
                    disabled={noLiderOptions}
                    aria-invalid={liderIdError ? true : undefined}
                    {...form.register('liderId')}
                  >
                    <option value="">{t('fields.liderIdNone')}</option>
                    {liderModel.options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.stale === 'inactive'
                          ? t('fields.liderIdStaleInactive', { name: o.name })
                          : o.stale === 'notLider'
                            ? t('fields.liderIdStaleNotLider', { name: o.name })
                            : o.name}
                      </option>
                    ))}
                  </Select>
                  {selectedIsStale && (
                    <p className="flex items-center gap-1.5 text-xs text-warning-dark dark:text-warning">
                      <AlertTriangle size={14} aria-hidden />
                      {t('fields.liderIdStaleHint')}
                    </p>
                  )}
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

              {isEdit && !isCarrierRow && (
                <>
                  <FormField
                    label={t('fields.managedBy')}
                    description={t('fields.managedByHint')}
                    error={errMsg('managedBy')}
                    htmlFor="user-managedBy"
                  >
                    <Select
                      id="user-managedBy"
                      {...form.register('managedBy', {
                        // magspace → local drops the override, which may end
                        // the effective planista role (and its leader link).
                        onChange: () =>
                          clearLiderIdUnlessPlanista(
                            form.getValues('role'),
                            form.getValues('roleOverride'),
                          ),
                      })}
                    >
                      <option value="local">{t('fields.local')}</option>
                      <option value="magspace">{t('fields.magspace')}</option>
                    </Select>
                  </FormField>

                  {/* The only access field editable on a managed account — and
                      the way an admin approves someone whose stanowisko is
                      deliberately unmapped (docs/24 §4). Meaningless on a
                      local account, so it is shown only for `magspace`. */}
                  {isDirectoryManaged && (
                    <FormField
                      label={t('fields.roleOverride')}
                      description={t('fields.roleOverrideHint')}
                      error={errMsg('roleOverride')}
                      htmlFor="user-roleOverride"
                    >
                      <Select
                        id="user-roleOverride"
                        {...form.register('roleOverride', {
                          // A new override resets the leader flag; clearing it
                          // hands the flag back to the mapping (stored value).
                          // A non-planista effective role drops `liderId`.
                          onChange: (e: { target: { value: string } }) => {
                            form.setValue(
                              'lider',
                              liderAfterRoleOverrideChange(
                                e.target.value,
                                user?.lider ?? false,
                              ),
                            );
                            clearLiderIdUnlessPlanista(
                              form.getValues('role'),
                              e.target.value as Role | '',
                            );
                          },
                        })}
                      >
                        <option value="">{t('fields.roleOverrideNone')}</option>
                        {AssignableRole.options.map((r) => (
                          <option key={r} value={r}>
                            {tRoles(r)}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}
                </>
              )}

              {isEdit && user && (
                <UserPermissionsBlock
                  key={user.id}
                  role={overridesBlockRole}
                  pendingRole={overridesPendingRole}
                  lider={overridesBlockLider}
                  managedBy={watchedManagedBy}
                  value={{ extra: watchedExtra ?? [], denied: watchedDenied ?? [] }}
                  onChange={onOverridesChange}
                  initiallyExpanded={(user.deniedPermissions ?? []).length > 0}
                  extraError={errMsg('extraPermissions')}
                  deniedError={errMsg('deniedPermissions')}
                />
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
