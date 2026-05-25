'use client';

// Create / edit drawer for a trailer.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateTrailerSchema,
  UpdateTrailerObjectSchema,
  trailerCountsRefine,
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
import { EntityAlreadyExistsNotice } from '@/components/carrier-onboarding/EntityAlreadyExistsNotice';
import { TemporaryPasswordRow } from '@/components/carrier-onboarding/TemporaryPasswordRow';
import { WizardStepper } from '@/components/carrier-onboarding/WizardStepper';
import { FormField, FormSection } from '@/components/forms/Form';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useCreateTrailer, useUpdateTrailer } from '@/lib/hooks/useTrailers';

const DRAFT_KEY = 'draft:trailers:new';

interface Props {
  open: boolean;
  trailer: TrailerDto | null;
  onClose: () => void;
  /** Phase 3.2 — wizard mode. See CarrierSheet/VehicleSheet for semantics. */
  mode?: 'standalone' | 'wizard';
  wizardCarrierId?: string;
  /** Wizard mode only — display label for the locked carrier. See VehicleSheet. */
  wizardCarrierLabel?: string;
  wizardTempPassword?: string | null;
  onCompleted?: (created: TrailerDto) => void;
  onSkip?: () => void;
  onExit?: () => void;
  wizardCurrentStep?: 1 | 2 | 3 | 4;
  wizardCompletedSteps?: number[];
  wizardSkippedSteps?: number[];
  /** Wizard mode only — see VehicleSheet for semantics. */
  wizardEntityAlreadyExists?: boolean;
}

type FormValues = CreateTrailerDto;

const NUMERIC_FIELDS = [
  'year',
  'innerLength',
  'innerWidth',
  'innerHeight',
  'capacity',
  'beltsCount',
  'matsCount',
] as const;

export function TrailerSheet({
  open,
  trailer,
  onClose,
  mode = 'standalone',
  wizardCarrierId,
  wizardCarrierLabel,
  wizardTempPassword,
  onCompleted,
  onSkip,
  onExit,
  wizardCurrentStep,
  wizardCompletedSteps,
  wizardSkippedSteps,
  wizardEntityAlreadyExists,
}: Props) {
  const t = useTranslations('trailers');
  const tCommon = useTranslations('common');
  const tWizard = useTranslations();
  const isEdit = trailer !== null;
  const isWizard = mode === 'wizard';

  // Edit mode keeps carrierId in form state for display; passthrough so the
  // strict UpdateSchema doesn't reject it. We compose the cross-field
  // belts/mats refine onto the object form because `.superRefine` would
  // otherwise return a ZodEffects, which doesn't expose `.passthrough()`.
  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit
        ? UpdateTrailerObjectSchema.passthrough().superRefine(trailerCountsRefine)
        : CreateTrailerSchema,
    ),
    defaultValues: getDefaults(),
  });

  const carriersQ = useCarriers({ limit: 200 });
  const typesQ = useTrailerTypes({ active: true });

  // Persist create-mode drafts; wizard mode opts out (see VehicleSheet).
  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit && !isWizard,
  });

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
        nextInspectionDate: trailer.nextInspectionDate ?? undefined,
        belts: trailer.belts ?? false,
        beltsCount: trailer.beltsCount ?? undefined,
        mats: trailer.mats ?? false,
        matsCount: trailer.matsCount ?? undefined,
        innerLength: trailer.innerLength ?? undefined,
        innerWidth: trailer.innerWidth ?? undefined,
        innerHeight: trailer.innerHeight ?? undefined,
        capacity: trailer.capacity ?? undefined,
        airSuspension: trailer.airSuspension ?? false,
        certXl: trailer.certXl ?? false,
        multilock: trailer.multilock ?? false,
        notes: trailer.notes ?? '',
      });
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top
      // (skipped in wizard mode — see VehicleSheet for the same rationale).
      form.reset({
        ...getDefaults(),
        ...(isWizard && wizardCarrierId
          ? { carrierId: wizardCarrierId }
          : {}),
      });
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, trailer, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateTrailer({
    onSuccess: (created) => {
      // Successful create — wipe the draft and reset to empty defaults.
      draft.clear();
      form.reset(getDefaults());
      if (isWizard) {
        onCompleted?.(created);
        return;
      }
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

  const onSubmit = form.handleSubmit(
    (values) => {
      const cleaned = cleanForm(values);
      if (isEdit && trailer) {
        const { carrierId: _carrierId, ...rest } = cleaned;
        void _carrierId;
        updateM.mutate({ id: trailer.id, body: rest as UpdateTrailerDto });
      } else {
        createM.mutate(cleaned as CreateTrailerDto);
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  // Conditional count inputs — mirror the VehicleSheet cabotage/ADR pattern
  // (form.watch + boolean compare). The count input is only rendered when its
  // companion checkbox is on; flipping the checkbox off clears the count so it
  // never leaks an orphaned value into the create/update payload.
  const beltsOn = form.watch('belts') === true;
  const matsOn = form.watch('mats') === true;
  useEffect(() => {
    if (!beltsOn) form.setValue('beltsCount', null as unknown as undefined);
  }, [beltsOn, form]);
  useEffect(() => {
    if (!matsOn) form.setValue('matsCount', null as unknown as undefined);
  }, [matsOn, form]);

  const handleClose = () => {
    if (isWizard) onExit?.();
    else onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent size="wide">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader className={isWizard && wizardTempPassword ? 'pb-0' : undefined}>
            <SheetTitle>
              {isWizard
                ? tWizard('wizard.header.title', { n: wizardCurrentStep ?? 3 })
                : isEdit
                  ? t('editTrailer')
                  : t('newTrailer')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && trailer ? trailer.plateNumber : null}
            </SheetDescription>
            {isWizard && (
              <WizardStepper
                currentStep={wizardCurrentStep ?? 3}
                completedSteps={wizardCompletedSteps ?? []}
                skippedSteps={wizardSkippedSteps ?? []}
              />
            )}
            {isWizard && wizardTempPassword && (
              <TemporaryPasswordRow
                password={wizardTempPassword}
                className="-mx-6 mt-3"
              />
            )}
          </SheetHeader>

          <SheetBody>
            {isWizard && wizardEntityAlreadyExists && (
              <EntityAlreadyExistsNotice
                message={tWizard('wizard.entityAlreadyExists.trailer')}
                dismissLabel={tCommon('clear')}
              />
            )}
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
                      {isWizard ? (
                        // Wizard mode — read-only display fed by orchestrator.
                        // See VehicleSheet for the race rationale.
                        <Input
                          id="trailer-carrierId"
                          className="h-10 bg-input"
                          value={wizardCarrierLabel ?? ''}
                          readOnly
                          disabled
                          aria-readonly="true"
                        />
                      ) : (
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
                      )}
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
                    required
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
                  {/* belts + matching count input — count is revealed only
                      when the checkbox is on (cabotage-pattern parity). */}
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-text">
                      <Checkbox {...form.register('belts')} />
                      {t('fields.belts')}
                    </label>
                    {beltsOn && (
                      <div className="ml-6 animate-slide-in">
                        <Input
                          id="trailer-beltsCount"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={t('fields.beltsCount')}
                          aria-invalid={!!errs.beltsCount}
                          placeholder={t('fields.beltsCount')}
                          className="h-9 max-w-[140px]"
                          {...form.register('beltsCount', {
                            setValueAs: (v) =>
                              v === '' || v === null ? undefined : Number(v),
                          })}
                        />
                        {errs.beltsCount?.message && (
                          <p className="mt-1 text-xs text-danger">
                            {errs.beltsCount.message as string}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 text-text">
                      <Checkbox {...form.register('mats')} />
                      {t('fields.mats')}
                    </label>
                    {matsOn && (
                      <div className="ml-6 animate-slide-in">
                        <Input
                          id="trailer-matsCount"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          aria-label={t('fields.matsCount')}
                          aria-invalid={!!errs.matsCount}
                          placeholder={t('fields.matsCount')}
                          className="h-9 max-w-[140px]"
                          {...form.register('matsCount', {
                            setValueAs: (v) =>
                              v === '' || v === null ? undefined : Number(v),
                          })}
                        />
                        {errs.matsCount?.message && (
                          <p className="mt-1 text-xs text-danger">
                            {errs.matsCount.message as string}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  {(['airSuspension', 'certXl', 'multilock'] as const).map(
                    (key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 text-text"
                      >
                        <Checkbox {...form.register(key)} />
                        {t(`fields.${key}`)}
                      </label>
                    ),
                  )}
                </div>
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
            {isWizard ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onExit?.()}
                  disabled={submitting}
                >
                  {tWizard('wizard.action.exit')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onSkip?.()}
                  disabled={submitting}
                >
                  {tWizard('wizard.action.skip')}
                </Button>
                <Button type="submit" size="sm" disabled={submitting}>
                  {submitting
                    ? tCommon('saving')
                    : tWizard('wizard.action.saveAndContinue')}
                </Button>
              </>
            ) : (
              <>
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
              </>
            )}
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
    // trailerTypeId is required by CreateTrailerSchema (NOT NULL since the
    // phase-2 migration). Coerce empty defaults to a string-shaped sentinel
    // so RHF stays controlled; the empty `<option value="">` triggers a Zod
    // "required" error on submit when the user hasn't picked a type yet.
    trailerTypeId: '' as unknown as string,
    brand: '',
    model: '',
    year: undefined,
    nextInspectionDate: undefined,
    belts: false,
    beltsCount: undefined,
    mats: false,
    matsCount: undefined,
    innerLength: undefined,
    innerWidth: undefined,
    innerHeight: undefined,
    capacity: undefined,
    airSuspension: false,
    certXl: false,
    multilock: false,
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
