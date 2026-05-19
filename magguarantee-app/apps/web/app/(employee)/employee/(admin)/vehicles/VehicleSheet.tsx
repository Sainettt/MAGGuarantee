'use client';

// Create / edit drawer for a vehicle. ~36 fields total — uses the wide sheet
// (640px) and section dividers per docs/14-design-system.md § Form patterns.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, type ChangeEvent } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateVehicleSchema,
  type CreateVehicleDto,
  type UpdateVehicleDto,
  type VehicleDto,
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
import { useDyspozytorzy, usePlanisci } from '@/lib/hooks/useLookups';
import { useCreateVehicle, useUpdateVehicle } from '@/lib/hooks/useVehicles';

const DRAFT_KEY = 'draft:vehicles:new';

interface Props {
  open: boolean;
  vehicle: VehicleDto | null;
  onClose: () => void;
  /**
   * `standalone` (default) — unchanged behaviour: success toast + close.
   *
   * `wizard` — sheet is rendered as step 2 of the carrier-onboarding flow.
   * The carrier picker is locked (controlled by `wizardCarrierId`), the
   * header shows a <WizardStepper>, the temporary-password banner is shown
   * iff `wizardTempPassword` is set, and the footer swaps to «Save and
   * continue» / «Skip» / «Exit».
   *
   * Phase 3.2 — see docs/14-design-system.md § Phase 3.2.
   */
  mode?: 'standalone' | 'wizard';
  /** Wizard mode only — pre-fills + locks the carrier picker. */
  wizardCarrierId?: string;
  /**
   * Wizard mode only — display label for the locked carrier (e.g.
   * `login — name`). Rendered as a read-only <Input> instead of the <Select>
   * to dodge the race where step 1's CARRIERS invalidation leaves
   * `useCarriers` mid-refetch when this sheet first mounts.
   */
  wizardCarrierLabel?: string;
  /** Wizard mode only — when set, render the sticky temp-password banner. */
  wizardTempPassword?: string | null;
  /** Wizard mode only — called on successful create. */
  onCompleted?: (created: VehicleDto) => void;
  /** Wizard mode only — skip the step without creating a vehicle. */
  onSkip?: () => void;
  /** Wizard mode only — close/cancel the entire wizard. */
  onExit?: () => void;
  /** Wizard mode only — current step (1..4) for the header stepper. */
  wizardCurrentStep?: 1 | 2 | 3 | 4;
  wizardCompletedSteps?: number[];
  wizardSkippedSteps?: number[];
  /**
   * Wizard mode only — set to true when the resumed carrier already owns at
   * least one vehicle (or one was created during the current wizard session).
   * Renders an info banner explaining the operator can add another or skip.
   */
  wizardEntityAlreadyExists?: boolean;
}

type FormValues = CreateVehicleDto;

const NUMERIC_FIELDS = [
  'year',
  'rateDe',
  'rateUe',
  'rateExport',
  'rateImport',
] as const;

export function VehicleSheet({
  open,
  vehicle,
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
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const tWizard = useTranslations();
  const isEdit = vehicle !== null;
  const isWizard = mode === 'wizard';

  // Form state matches CreateVehicleDto in both modes — edit mode keeps
  // `carrierId` in state for display only and the submit handler strips it
  // before calling PATCH. We always validate against CreateVehicleSchema so
  // its `.refine()` (gps→gpsMobilePhone) fires on edit too; the schema is
  // ZodEffects after refine and doesn't expose `.passthrough()`, but since
  // every form-registered field is part of CreateVehicleDto, .strict() is
  // satisfied.
  const form = useForm<FormValues>({
    resolver: zodResolver(CreateVehicleSchema) as never,
    defaultValues: getDefaults(),
  });

  const carriersQ = useCarriers({ limit: 200 });
  const planisciQ = usePlanisci();
  const dyspozytorzyQ = useDyspozytorzy();

  // Persist create-mode drafts; closing the sheet keeps user input intact.
  // Wizard mode opts out — the wizard owns its lifecycle, and per-step
  // drafts across multiple wizard sessions would be more confusing than
  // helpful.
  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit && !isWizard,
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && vehicle) {
      form.reset({
        carrierId: vehicle.carrierId,
        plateNumber: vehicle.plateNumber,
        active: vehicle.active,
        plannerId: vehicle.plannerId ?? undefined,
        dispatcherId: vehicle.dispatcherId ?? undefined,
        brand: vehicle.brand ?? '',
        model: vehicle.model ?? '',
        year: vehicle.year ?? undefined,
        notes: vehicle.notes ?? '',
        certificateL: vehicle.certificateL,
        euro: vehicle.euro,
        gps: vehicle.gps,
        fuelCard: vehicle.fuelCard,
        type: vehicle.type,
        gb: vehicle.gb ?? false,
        it: vehicle.it ?? false,
        fr: vehicle.fr ?? false,
        agreement: vehicle.agreement ?? false,
        contract: vehicle.contract ?? false,
        // Existing rows from before rates were required may still hold null
        // — surface as empty input so the user is forced to re-enter on edit.
        rateDe: vehicle.rateDe ?? (undefined as unknown as number),
        rateUe: vehicle.rateUe ?? (undefined as unknown as number),
        rateExport: vehicle.rateExport ?? (undefined as unknown as number),
        rateImport: vehicle.rateImport ?? (undefined as unknown as number),
        wasteAllowed: vehicle.wasteAllowed,
        cabotageDe: vehicle.cabotageDe,
        cabotageFr: vehicle.cabotageFr,
        gpsMobilePhone: vehicle.gpsMobilePhone ?? '',
        nextInspectionDate: vehicle.nextInspectionDate ?? undefined,
        sideNumber: vehicle.sideNumber ?? '',
      });
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top.
      // In wizard mode the draft is disabled (per-form drafts would persist
      // across unrelated wizard openings); we seed `carrierId` from the
      // orchestrator so the locked picker shows the right carrier.
      form.reset({
        ...getDefaults(),
        ...(isWizard && wizardCarrierId
          ? { carrierId: wizardCarrierId }
          : {}),
      });
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, vehicle, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateVehicle({
    onSuccess: (created) => {
      // Successful create — wipe the draft and reset to empty defaults.
      draft.clear();
      form.reset(getDefaults());
      if (isWizard) {
        // Hand off to the orchestrator; no toast, the next step opens.
        onCompleted?.(created);
        return;
      }
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const updateM = useUpdateVehicle({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      const cleaned = cleanForm(values);
      if (isEdit && vehicle) {
        const { carrierId: _carrierId, ...rest } = cleaned;
        void _carrierId;
        updateM.mutate({ id: vehicle.id, body: rest as UpdateVehicleDto });
      } else {
        createM.mutate(cleaned as CreateVehicleDto);
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;
  // Watch the GPS toggle so the phone field shows/hides reactively.
  const gpsOn = form.watch('gps') === true;

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
                ? tWizard('wizard.header.title', { n: wizardCurrentStep ?? 2 })
                : isEdit
                  ? t('editVehicle')
                  : t('newVehicle')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && vehicle ? vehicle.plateNumber : null}
            </SheetDescription>
            {isWizard && (
              <WizardStepper
                currentStep={wizardCurrentStep ?? 2}
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
                message={tWizard('wizard.entityAlreadyExists.vehicle')}
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
                      htmlFor="vehicle-carrierId"
                    >
                      {isWizard ? (
                        // In wizard mode the carrier is fixed by step 1; render
                        // a read-only <Input> showing the label the
                        // orchestrator passed in. Form state still holds the
                        // real `carrierId` (seeded via form.reset above) — this
                        // input is purely cosmetic so we don't depend on the
                        // useCarriers list query (which is mid-refetch right
                        // after step 1's invalidation).
                        <Input
                          id="vehicle-carrierId"
                          className="h-10 bg-input"
                          value={wizardCarrierLabel ?? ''}
                          readOnly
                          disabled
                          aria-readonly="true"
                        />
                      ) : (
                        <Select
                          id="vehicle-carrierId"
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
                    htmlFor="vehicle-plateNumber"
                  >
                    <Input
                      id="vehicle-plateNumber"
                      className="h-10"
                      {...form.register('plateNumber')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.sideNumber')}
                    error={errs.sideNumber?.message}
                    htmlFor="vehicle-sideNumber"
                  >
                    <Input
                      id="vehicle-sideNumber"
                      className="h-10"
                      {...form.register('sideNumber')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.brand')}
                    error={errs.brand?.message}
                    htmlFor="vehicle-brand"
                  >
                    <Input
                      id="vehicle-brand"
                      className="h-10"
                      {...form.register('brand')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.model')}
                    error={errs.model?.message}
                    htmlFor="vehicle-model"
                  >
                    <Input
                      id="vehicle-model"
                      className="h-10"
                      {...form.register('model')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.year')}
                    error={errs.year?.message}
                    htmlFor="vehicle-year"
                  >
                    <Input
                      id="vehicle-year"
                      type="number"
                      className="h-10"
                      {...form.register('year', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.type')}
                    required
                    error={errs.type?.message}
                    htmlFor="vehicle-type"
                  >
                    <Select id="vehicle-type" {...form.register('type')}>
                      <option value="">—</option>
                      <option value="MEGA">MEGA</option>
                      <option value="STD">STD</option>
                      <option value="COIL">COIL</option>
                    </Select>
                  </FormField>
                  <FormField
                    label={t('fields.euro')}
                    required
                    error={errs.euro?.message}
                    htmlFor="vehicle-euro"
                  >
                    <Select id="vehicle-euro" {...form.register('euro')}>
                      <option value="">—</option>
                      <option value="III">III</option>
                      <option value="IV">IV</option>
                      <option value="V">V</option>
                      <option value="VI">VI</option>
                    </Select>
                  </FormField>
                  <FormField
                    label={t('fields.certificateL')}
                    required
                    error={errs.certificateL?.message}
                    htmlFor="vehicle-certificateL"
                  >
                    {/*
                      Native <select> only speaks strings, but the field is
                      a boolean in the DTO. Controller maps both ways so Zod
                      sees a real boolean and the option stays in sync on
                      edit-mode reset.
                    */}
                    <Controller
                      name="certificateL"
                      control={form.control}
                      render={({ field }) => (
                        <Select
                          id="vehicle-certificateL"
                          value={field.value ? 'true' : 'false'}
                          onChange={(e) =>
                            field.onChange(e.target.value === 'true')
                          }
                          onBlur={field.onBlur}
                          ref={field.ref}
                        >
                          <option value="true">{tCommon('yes')}</option>
                          <option value="false">{tCommon('no')}</option>
                        </Select>
                      )}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.nextInspectionDate')}
                    error={errs.nextInspectionDate?.message}
                    htmlFor="vehicle-nextInspectionDate"
                  >
                    <Input
                      id="vehicle-nextInspectionDate"
                      type="date"
                      className="h-10"
                      {...form.register('nextInspectionDate')}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={t('sections.people')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={t('fields.planner')}
                    required
                    error={errs.plannerId?.message}
                    htmlFor="vehicle-plannerId"
                  >
                    <Select
                      id="vehicle-plannerId"
                      {...form.register('plannerId')}
                    >
                      <option value="">—</option>
                      {(planisciQ.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.login}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField
                    label={t('fields.dispatcher')}
                    required
                    error={errs.dispatcherId?.message}
                    htmlFor="vehicle-dispatcherId"
                  >
                    <Select
                      id="vehicle-dispatcherId"
                      {...form.register('dispatcherId')}
                    >
                      <option value="">—</option>
                      {(dyspozytorzyQ.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ?? u.login}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={t('sections.equipment')}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox
                      {...form.register('gps', {
                        // When toggling GPS off, clear any phone value so a
                        // stale entry isn't sent. Mirrors the legacy
                        // _vdToggleGPSMob behavior at index.html:9625-9631.
                        onChange: (e: ChangeEvent<HTMLInputElement>) => {
                          if (!e.target.checked) {
                            form.setValue('gpsMobilePhone', '', {
                              shouldValidate: true,
                            });
                          }
                        },
                      })}
                    />
                    {t('fields.gps')}
                  </label>
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('fuelCard')} />
                    {t('fields.fuelCard')}
                  </label>
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('agreement')} />
                    {t('fields.agreement')}
                  </label>
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('contract')} />
                    {t('fields.contract')}
                  </label>
                </div>
                {gpsOn && (
                  <FormField
                    label={t('fields.gpsMobilePhone')}
                    required
                    error={errs.gpsMobilePhone?.message}
                    htmlFor="vehicle-gpsMobilePhone"
                  >
                    <Input
                      id="vehicle-gpsMobilePhone"
                      className="h-10"
                      {...form.register('gpsMobilePhone')}
                    />
                  </FormField>
                )}
              </FormSection>

              <FormSection title={t('sections.rates')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    label={t('fields.rateDe')}
                    required
                    error={errs.rateDe?.message}
                    htmlFor="vehicle-rateDe"
                  >
                    <Input
                      id="vehicle-rateDe"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('rateDe', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.rateUe')}
                    required
                    error={errs.rateUe?.message}
                    htmlFor="vehicle-rateUe"
                  >
                    <Input
                      id="vehicle-rateUe"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('rateUe', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.rateExport')}
                    required
                    error={errs.rateExport?.message}
                    htmlFor="vehicle-rateExport"
                  >
                    <Input
                      id="vehicle-rateExport"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('rateExport', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.rateImport')}
                    required
                    error={errs.rateImport?.message}
                    htmlFor="vehicle-rateImport"
                  >
                    <Input
                      id="vehicle-rateImport"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('rateImport', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={t('sections.permissions')}>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('wasteAllowed')} />
                    {t('fields.wasteAllowed')}
                  </label>
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('cabotageDe')} />
                    {t('fields.cabotageDe')}
                  </label>
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('cabotageFr')} />
                    {t('fields.cabotageFr')}
                  </label>
                </div>
                <FormField
                  label={t('fields.notes')}
                  error={errs.notes?.message}
                  htmlFor="vehicle-notes"
                >
                  <Textarea
                    id="vehicle-notes"
                    rows={3}
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
    // RHF needs string-shaped controlled values. Empty string parks the
    // Select on its placeholder option; Zod surfaces "required" errors on
    // submit when the user hasn't picked one.
    carrierId: '' as unknown as string,
    plateNumber: '',
    active: true,
    // plannerId / dispatcherId are required UUIDs in the schema; empty string
    // parks the <Select> on its placeholder so Zod surfaces "required" on
    // submit instead of crashing the input as uncontrolled.
    plannerId: '' as unknown as string,
    dispatcherId: '' as unknown as string,
    brand: '',
    model: '',
    year: undefined,
    notes: '',
    // Compliance default — admin must explicitly opt in to TAK.
    certificateL: false,
    euro: '' as unknown as 'III' | 'IV' | 'V' | 'VI',
    gps: false,
    fuelCard: false,
    type: '' as unknown as 'MEGA' | 'STD' | 'COIL',
    gb: false,
    it: false,
    fr: false,
    agreement: false,
    contract: false,
    // Empty by default → Zod surfaces "required" on submit; admin must
    // explicitly type a value (0 is allowed as "free haulage").
    rateDe: undefined as unknown as number,
    rateUe: undefined as unknown as number,
    rateExport: undefined as unknown as number,
    rateImport: undefined as unknown as number,
    wasteAllowed: false,
    cabotageDe: false,
    cabotageFr: false,
    gpsMobilePhone: '',
    nextInspectionDate: undefined,
    sideNumber: '',
  };
}

function cleanForm(values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === '' || v === undefined || v === null) continue;
    if ((NUMERIC_FIELDS as readonly string[]).includes(k)) {
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n)) continue;
      out[k] = n;
    } else {
      out[k] = v;
    }
  }
  return out;
}
