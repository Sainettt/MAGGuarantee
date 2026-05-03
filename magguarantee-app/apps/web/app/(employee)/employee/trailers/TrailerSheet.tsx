'use client';

// Create / edit drawer for a trailer.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateTrailerSchema,
  UpdateTrailerSchema,
  type CreateTrailerDto,
  type TrailerDto,
  type UpdateTrailerDto,
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
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FormSection } from '@/components/forms/Form';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useCreateTrailer, useUpdateTrailer } from '@/lib/hooks/useTrailers';

interface Props {
  open: boolean;
  trailer: TrailerDto | null;
  onClose: () => void;
}

type FormValues = CreateTrailerDto;

const NUMERIC_FIELDS = [
  'year',
  'innerLength',
  'innerWidth',
  'innerHeight',
  'capacity',
] as const;

export function TrailerSheet({ open, trailer, onClose }: Props) {
  const t = useTranslations('trailers');
  const tCommon = useTranslations('common');
  const isEdit = trailer !== null;

  // Edit mode keeps carrierId in form state for display; passthrough so the
  // strict UpdateSchema doesn't reject it.
  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? UpdateTrailerSchema.passthrough() : CreateTrailerSchema,
    ),
    defaultValues: getDefaults(),
  });

  const carriersQ = useCarriers({ limit: 200 });
  const typesQ = useTrailerTypes({ active: true });

  useEffect(() => {
    if (!open) return;
    if (isEdit && trailer) {
      form.reset({
        carrierId: trailer.carrierId,
        plateNumber: trailer.plateNumber,
        active: trailer.active,
        trailerTypeId: trailer.trailerTypeId ?? undefined,
        brand: trailer.brand ?? '',
        model: trailer.model ?? '',
        year: trailer.year ?? undefined,
        equipment: trailer.equipment ?? '',
        nextInspectionDate: trailer.nextInspectionDate ?? undefined,
        belts: trailer.belts ?? false,
        mats: trailer.mats ?? false,
        innerLength: trailer.innerLength ?? undefined,
        innerWidth: trailer.innerWidth ?? undefined,
        innerHeight: trailer.innerHeight ?? undefined,
        capacity: trailer.capacity ?? undefined,
        airSuspension: trailer.airSuspension ?? false,
        loadFromBack: trailer.loadFromBack ?? false,
        loadFromSide: trailer.loadFromSide ?? false,
        loadFromTop: trailer.loadFromTop ?? false,
        slidingRoof: trailer.slidingRoof ?? false,
        edschaSlidingRoof: trailer.edschaSlidingRoof ?? false,
        notes: trailer.notes ?? '',
      });
    } else {
      form.reset(getDefaults());
    }
  }, [open, isEdit, trailer, form]);

  const createM = useCreateTrailer({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const updateM = useUpdateTrailer({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onSubmit = form.handleSubmit((values) => {
    const cleaned = cleanForm(values);
    if (isEdit && trailer) {
      const { carrierId: _carrierId, ...rest } = cleaned;
      void _carrierId;
      updateM.mutate({ id: trailer.id, body: rest as UpdateTrailerDto });
    } else {
      createM.mutate(cleaned as CreateTrailerDto);
    }
  });

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent size="wide">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? t('editTrailer') : t('newTrailer')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && trailer ? trailer.plateNumber : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-6">
              <FormSection title={t('sections.identification')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {!isEdit && (
                    <FormField
                      label={t('fields.carrier')}
                      required
                      error={errs.carrierId?.message}
                      htmlFor="trailer-carrierId"
                    >
                      <Select
                        id="trailer-carrierId"
                        {...form.register('carrierId')}
                      >
                        <option value="">—</option>
                        {(carriersQ.data?.items ?? []).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.login}
                            {c.name ? ` — ${c.name}` : ''}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                  )}
                  <FormField
                    label={t('fields.plateNumber')}
                    required
                    error={errs.plateNumber?.message}
                    htmlFor="trailer-plateNumber"
                  >
                    <Input
                      id="trailer-plateNumber"
                      className="h-10"
                      {...form.register('plateNumber')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.trailerType')}
                    error={errs.trailerTypeId?.message}
                    htmlFor="trailer-typeId"
                  >
                    <Select
                      id="trailer-typeId"
                      {...form.register('trailerTypeId')}
                    >
                      <option value="">—</option>
                      {(typesQ.data ?? []).map((tt) => (
                        <option key={tt.id} value={tt.id}>
                          {tt.shortCode ? `[${tt.shortCode}] ` : ''}
                          {tt.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField
                    label={t('fields.brand')}
                    error={errs.brand?.message}
                    htmlFor="trailer-brand"
                  >
                    <Input
                      id="trailer-brand"
                      className="h-10"
                      {...form.register('brand')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.model')}
                    error={errs.model?.message}
                    htmlFor="trailer-model"
                  >
                    <Input
                      id="trailer-model"
                      className="h-10"
                      {...form.register('model')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.year')}
                    error={errs.year?.message}
                    htmlFor="trailer-year"
                  >
                    <Input
                      id="trailer-year"
                      type="number"
                      className="h-10"
                      {...form.register('year', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.nextInspectionDate')}
                    error={errs.nextInspectionDate?.message}
                    htmlFor="trailer-nextInspectionDate"
                  >
                    <Input
                      id="trailer-nextInspectionDate"
                      type="date"
                      className="h-10"
                      {...form.register('nextInspectionDate')}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={t('sections.dimensions')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    label={t('fields.innerLength')}
                    error={errs.innerLength?.message}
                    htmlFor="trailer-innerLength"
                  >
                    <Input
                      id="trailer-innerLength"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('innerLength', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.innerWidth')}
                    error={errs.innerWidth?.message}
                    htmlFor="trailer-innerWidth"
                  >
                    <Input
                      id="trailer-innerWidth"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('innerWidth', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.innerHeight')}
                    error={errs.innerHeight?.message}
                    htmlFor="trailer-innerHeight"
                  >
                    <Input
                      id="trailer-innerHeight"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('innerHeight', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.capacity')}
                    error={errs.capacity?.message}
                    htmlFor="trailer-capacity"
                  >
                    <Input
                      id="trailer-capacity"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('capacity', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={t('sections.equipment')}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  {(
                    [
                      'belts',
                      'mats',
                      'airSuspension',
                      'loadFromBack',
                      'loadFromSide',
                      'loadFromTop',
                      'slidingRoof',
                      'edschaSlidingRoof',
                    ] as const
                  ).map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-text"
                    >
                      <Checkbox {...form.register(key)} />
                      {t(`fields.${key}`)}
                    </label>
                  ))}
                </div>
                <FormField
                  label={t('fields.equipment')}
                  error={errs.equipment?.message}
                  htmlFor="trailer-equipment"
                >
                  <Textarea
                    id="trailer-equipment"
                    rows={2}
                    {...form.register('equipment')}
                  />
                </FormField>
                <FormField
                  label={t('fields.notes')}
                  error={errs.notes?.message}
                  htmlFor="trailer-notes"
                >
                  <Textarea
                    id="trailer-notes"
                    rows={2}
                    {...form.register('notes')}
                  />
                </FormField>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('active')} />
                  {t('fields.active')}
                </label>
              </FormSection>
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

function getDefaults(): FormValues {
  return {
    carrierId: undefined as unknown as string,
    plateNumber: '',
    active: true,
    trailerTypeId: undefined,
    brand: '',
    model: '',
    year: undefined,
    equipment: '',
    nextInspectionDate: undefined,
    belts: false,
    mats: false,
    innerLength: undefined,
    innerWidth: undefined,
    innerHeight: undefined,
    capacity: undefined,
    airSuspension: false,
    loadFromBack: false,
    loadFromSide: false,
    loadFromTop: false,
    slidingRoof: false,
    edschaSlidingRoof: false,
    notes: '',
  };
}

function cleanForm(values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    // Drop empty strings — Zod `.optional()` accepts undefined, not "".
    if (v === '' || v === undefined || v === null) continue;
    if ((NUMERIC_FIELDS as readonly string[]).includes(k)) {
      // Already coerced via setValueAs, but defend against stray strings.
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      out[k] = n;
    } else {
      out[k] = v;
    }
  }
  return out;
}
