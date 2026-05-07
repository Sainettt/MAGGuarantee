'use client';

// Create / edit drawer for a vehicle. ~36 fields total — uses the wide sheet
// (640px) and section dividers per docs/14-design-system.md § Form patterns.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateVehicleSchema,
  UpdateVehicleSchema,
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
import { FormField, FormSection } from '@/components/forms/Form';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useDyspozytorzy, usePlanisci } from '@/lib/hooks/useLookups';
import { useCreateVehicle, useUpdateVehicle } from '@/lib/hooks/useVehicles';

const DRAFT_KEY = 'draft:vehicles:new';

interface Props {
  open: boolean;
  vehicle: VehicleDto | null;
  onClose: () => void;
}

type FormValues = CreateVehicleDto;

const NUMERIC_FIELDS = [
  'year',
  'rateDe',
  'rateUe',
  'rateExport',
  'rateImport',
] as const;

export function VehicleSheet({ open, vehicle, onClose }: Props) {
  const t = useTranslations('vehicles');
  const tCommon = useTranslations('common');
  const isEdit = vehicle !== null;

  // Edit mode keeps carrierId in form state for display; passthrough so the
  // strict UpdateSchema doesn't reject it.
  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit ? UpdateVehicleSchema.passthrough() : CreateVehicleSchema,
    ),
    defaultValues: getDefaults(),
  });

  const carriersQ = useCarriers({ limit: 200 });
  const planisciQ = usePlanisci();
  const dyspozytorzyQ = useDyspozytorzy();

  // Persist create-mode drafts; closing the sheet keeps user input intact.
  const draft = useFormDraft(form, DRAFT_KEY, { enabled: !isEdit });

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
        certificateL: vehicle.certificateL ?? undefined,
        euro: vehicle.euro ?? undefined,
        gps: vehicle.gps,
        fuelCard: vehicle.fuelCard,
        type: vehicle.type ?? undefined,
        gb: vehicle.gb ?? false,
        it: vehicle.it ?? false,
        fr: vehicle.fr ?? false,
        agreement: vehicle.agreement ?? false,
        contract: vehicle.contract ?? false,
        rateDe: vehicle.rateDe ?? undefined,
        rateUe: vehicle.rateUe ?? undefined,
        rateExport: vehicle.rateExport ?? undefined,
        rateImport: vehicle.rateImport ?? undefined,
        wasteAllowed: vehicle.wasteAllowed,
        cabotageDe: vehicle.cabotageDe,
        cabotageFr: vehicle.cabotageFr,
        gpsMobilePhone: vehicle.gpsMobilePhone ?? '',
        nextInspectionDate: vehicle.nextInspectionDate ?? undefined,
        sideNumber: vehicle.sideNumber ?? '',
      });
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top.
      form.reset(getDefaults());
      draft.hydrate();
    }
  }, [open, isEdit, vehicle, form, draft]);

  const createM = useCreateVehicle({
    onSuccess: () => {
      // Successful create — wipe the draft and reset to empty defaults.
      draft.clear();
      form.reset(getDefaults());
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

  const onSubmit = form.handleSubmit((values) => {
    const cleaned = cleanForm(values);
    if (isEdit && vehicle) {
      const { carrierId: _carrierId, ...rest } = cleaned;
      void _carrierId;
      updateM.mutate({ id: vehicle.id, body: rest as UpdateVehicleDto });
    } else {
      createM.mutate(cleaned as CreateVehicleDto);
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
              {isEdit ? t('editVehicle') : t('newVehicle')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && vehicle ? vehicle.plateNumber : null}
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
                      htmlFor="vehicle-carrierId"
                    >
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
                    error={errs.certificateL?.message}
                    htmlFor="vehicle-certificateL"
                  >
                    <Select
                      id="vehicle-certificateL"
                      {...form.register('certificateL')}
                    >
                      <option value="">—</option>
                      <option value="L1">L1</option>
                      <option value="L2">L2</option>
                      <option value="L3">L3</option>
                    </Select>
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
                    <Checkbox {...form.register('gps')} />
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
                <FormField
                  label={t('fields.gpsMobilePhone')}
                  error={errs.gpsMobilePhone?.message}
                  htmlFor="vehicle-gpsMobilePhone"
                >
                  <Input
                    id="vehicle-gpsMobilePhone"
                    className="h-10"
                    {...form.register('gpsMobilePhone')}
                  />
                </FormField>
              </FormSection>

              <FormSection title={t('sections.rates')}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    label={t('fields.rateDe')}
                    error={errs.rateDe?.message}
                    htmlFor="vehicle-rateDe"
                  >
                    <Input
                      id="vehicle-rateDe"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('rateDe', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.rateUe')}
                    error={errs.rateUe?.message}
                    htmlFor="vehicle-rateUe"
                  >
                    <Input
                      id="vehicle-rateUe"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('rateUe', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.rateExport')}
                    error={errs.rateExport?.message}
                    htmlFor="vehicle-rateExport"
                  >
                    <Input
                      id="vehicle-rateExport"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('rateExport', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.rateImport')}
                    error={errs.rateImport?.message}
                    htmlFor="vehicle-rateImport"
                  >
                    <Input
                      id="vehicle-rateImport"
                      type="number"
                      step="0.01"
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

function getDefaults(): FormValues {
  return {
    carrierId: undefined as unknown as string,
    plateNumber: '',
    active: true,
    plannerId: undefined,
    dispatcherId: undefined,
    brand: '',
    model: '',
    year: undefined,
    notes: '',
    certificateL: undefined,
    euro: undefined,
    gps: false,
    fuelCard: false,
    type: undefined,
    gb: false,
    it: false,
    fr: false,
    agreement: false,
    contract: false,
    rateDe: undefined,
    rateUe: undefined,
    rateExport: undefined,
    rateImport: undefined,
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
