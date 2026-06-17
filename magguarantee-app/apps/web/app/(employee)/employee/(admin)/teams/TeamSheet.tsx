'use client';

// Phase 11 — Create / edit drawer for a dispatch team. Mode is implicit:
//   - `team === null` → create (POST /teams)
//   - `team` set      → edit  (PATCH /teams/:id)
//
// Fields: `code` (format `N.N.N`, e.g. `1.1.13` — validated by the shared
// `CreateTeamSchema` via the same regex the API uses), optional `name`,
// `active`, and the dispatcher membership (`dispatcherIds`, a <MultiSelect> of
// the `dyspozytor`-role users). On edit, `dispatcherIds` is a FULL replacement
// of the team's roster — dispatchers removed here are detached server-side.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateTeamSchema,
  UpdateTeamSchema,
  type CreateTeamDto,
  type TeamDto,
  type UpdateTeamDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { MultiSelect, type MultiSelectOption } from '@/components/ui/MultiSelect';
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
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useDyspozytorzy } from '@/lib/hooks/useLookups';
import { useCreateTeam, useUpdateTeam } from '@/lib/hooks/useTeams';

const DRAFT_KEY = 'draft:teams:new';

interface Props {
  open: boolean;
  team: TeamDto | null;
  onClose: () => void;
}

type FormValues = {
  code: string;
  name: string;
  active: boolean;
  dispatcherIds: string[];
};

function getDefaults(): FormValues {
  return { code: '', name: '', active: true, dispatcherIds: [] };
}

export function TeamSheet({ open, team, onClose }: Props) {
  const t = useTranslations('teams');
  const tCommon = useTranslations('common');
  const tMs = useTranslations('multiSelect');
  const isEdit = team !== null;

  const dyspozytorzyQ = useDyspozytorzy();

  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? UpdateTeamSchema : CreateTeamSchema,
    ) as never,
    defaultValues: getDefaults(),
  });

  // Persist create-mode drafts. `sanitize` drops any stale key no longer in the
  // form shape so a strict-schema reject can't be triggered by an old draft.
  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit,
    sanitize: (raw) => {
      const allowed = new Set(Object.keys(getDefaults()));
      return Object.fromEntries(
        Object.entries(raw).filter(([k]) => allowed.has(k)),
      ) as Partial<FormValues>;
    },
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && team) {
      form.reset({
        code: team.code,
        name: team.name ?? '',
        active: team.active,
        dispatcherIds: team.dispatchers.map((d) => d.id),
      });
    } else {
      form.reset(getDefaults());
      draft.hydrate();
    }
  }, [open, isEdit, team, form, draft]);

  const createM = useCreateTeam({
    onSuccess: () => {
      draft.clear();
      form.reset(getDefaults());
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const updateM = useUpdateTeam({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onSubmit = form.handleSubmit((values) => {
    const body = {
      code: values.code.trim(),
      // Empty name → omit on create, explicit null on edit (clear it).
      name: values.name.trim() || (isEdit ? null : undefined),
      active: values.active,
      dispatcherIds: values.dispatcherIds,
    };

    if (isEdit && team) {
      updateM.mutate({ id: team.id, body: body as UpdateTeamDto });
    } else {
      const { name, ...rest } = body;
      const createBody = {
        ...rest,
        ...(name == null ? {} : { name }),
      } as CreateTeamDto;
      createM.mutate(createBody);
    }
  });

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  // Dispatcher options for the <MultiSelect> — label is `name ?? login`.
  const dispatcherOptions = useMemo<MultiSelectOption[]>(
    () =>
      (dyspozytorzyQ.data ?? []).map((u) => ({
        value: u.id,
        label: u.name ?? u.login,
      })),
    [dyspozytorzyQ.data],
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{isEdit ? t('editTeam') : t('newTeam')}</SheetTitle>
            <SheetDescription>
              {isEdit ? team?.code : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-4">
              <FormField
                label={t('fields.code')}
                required
                error={errs.code?.message}
                htmlFor="team-code"
                description={t('fields.codeHint')}
              >
                <Input
                  id="team-code"
                  placeholder="1.1.13"
                  className="font-mono tabular-nums"
                  {...form.register('code')}
                />
              </FormField>

              <FormField
                label={t('fields.name')}
                error={errs.name?.message}
                htmlFor="team-name"
              >
                <Input id="team-name" {...form.register('name')} />
              </FormField>

              <FormField
                label={t('fields.dispatchers')}
                error={errs.dispatcherIds?.message}
                htmlFor="team-dispatchers"
                description={t('fields.dispatchersHint')}
              >
                <Controller
                  name="dispatcherIds"
                  control={form.control}
                  render={({ field }) => (
                    <MultiSelect
                      id="team-dispatchers"
                      options={dispatcherOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={t('fields.dispatchersPlaceholder')}
                      searchPlaceholder={tCommon('search')}
                      emptyText={t('fields.dispatchersEmpty')}
                      removeAriaLabel={(label) =>
                        tMs('removeAria', { name: label })
                      }
                      selectionSummary={(count) =>
                        t('fields.dispatchersSelected', { count })
                      }
                    />
                  )}
                />
              </FormField>

              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('active')} />
                {t('fields.active')}
              </label>
            </div>
          </SheetBody>

          <SheetFooter>
            {!isEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  draft.clear();
                  form.reset(getDefaults());
                }}
                disabled={submitting}
              >
                {tCommon('clear')}
              </Button>
            )}
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
