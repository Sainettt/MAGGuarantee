'use client';

// Create / edit drawer for a trailer type. Mode is implicit:
//   - `trailerType === null` → create
//   - `trailerType` set      → edit (PATCH only the diff in this UAT impl is
//                              skipped for simplicity — we PATCH every field).

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateTrailerTypeSchema,
  UpdateTrailerTypeSchema,
  type CreateTrailerTypeDto,
  type TrailerTypeDto,
  type UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/forms/Form';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import {
  useCreateTrailerType,
  useUpdateTrailerType,
} from '@/lib/hooks/useTrailerTypes';

const DRAFT_KEY = 'draft:trailer-types:new';

const EMPTY_DEFAULTS: CreateTrailerTypeDto = {
  name: '',
  shortCode: '',
  description: '',
  active: true,
};

interface Props {
  open: boolean;
  trailerType: TrailerTypeDto | null;
  onClose: () => void;
}

type FormValues = CreateTrailerTypeDto;

export function TrailerTypeSheet({ open, trailerType, onClose }: Props) {
  const t = useTranslations('trailerTypes');
  const tCommon = useTranslations('common');
  const isEdit = trailerType !== null;

  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? UpdateTrailerTypeSchema : CreateTrailerTypeSchema,
    ),
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  // Persist create-mode drafts so the user doesn't lose data when they
  // accidentally close the sheet (Esc, click-outside, X). Edit mode is
  // skipped: we never want a stale draft to override fresh server values.
  const draft = useFormDraft(form, DRAFT_KEY, { enabled: !isEdit });

  // Reset whenever the target row changes (or sheet opens). In create mode
  // we reset to empty defaults first, then ask useFormDraft to overlay any
  // saved draft on top — so the draft wins, but the form falls back to a
  // clean state when there is no draft (e.g. after edit→close→create).
  useEffect(() => {
    if (!open) return;
    if (isEdit && trailerType) {
      form.reset({
        name: trailerType.name,
        shortCode: trailerType.shortCode ?? '',
        description: trailerType.description ?? '',
        active: trailerType.active,
      });
    } else {
      form.reset({ ...EMPTY_DEFAULTS });
      draft.hydrate();
    }
  }, [open, isEdit, trailerType, form, draft]);

  const createM = useCreateTrailerType({
    onSuccess: () => {
      // Successful create wipes the saved draft and resets the form to
      // empty defaults so the next "+ New" opens a clean slate.
      draft.clear();
      form.reset({ ...EMPTY_DEFAULTS });
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const updateM = useUpdateTrailerType({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onSubmit = form.handleSubmit((values) => {
    // Strip empty optionals; the API accepts `null` for unset on UPDATE
    // but on CREATE it expects undefined for "not provided".
    const cleaned: Record<string, unknown> = { ...values };
    if (!cleaned.shortCode) cleaned.shortCode = undefined;
    if (!cleaned.description) cleaned.description = undefined;

    if (isEdit && trailerType) {
      updateM.mutate({
        id: trailerType.id,
        body: cleaned as UpdateTrailerTypeDto,
      });
    } else {
      createM.mutate(cleaned as CreateTrailerTypeDto);
    }
  });

  const submitting = createM.isPending || updateM.isPending;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? t('editType') : t('newType')}
            </SheetTitle>
            <SheetDescription>
              {isEdit ? trailerType?.name : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-4">
              <FormField
                label={t('fields.name')}
                required
                error={form.formState.errors.name?.message}
                htmlFor="trailer-type-name"
              >
                <Input
                  id="trailer-type-name"
                  {...form.register('name')}
                />
              </FormField>

              <FormField
                label={t('fields.shortCode')}
                error={form.formState.errors.shortCode?.message}
                htmlFor="trailer-type-shortCode"
              >
                <Input
                  id="trailer-type-shortCode"
                  {...form.register('shortCode')}
                />
              </FormField>

              <FormField
                label={t('fields.description')}
                error={form.formState.errors.description?.message}
                htmlFor="trailer-type-description"
              >
                <Textarea
                  id="trailer-type-description"
                  rows={3}
                  {...form.register('description')}
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
                  form.reset({ ...EMPTY_DEFAULTS });
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
