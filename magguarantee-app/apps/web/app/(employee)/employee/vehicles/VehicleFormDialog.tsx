'use client';

// Create / edit dialog for a vehicle — centered <FormDialog> (docs/14 §13.1,
// §13.3). Replaces the legacy right-side VehicleSheet. Sections top-to-bottom:
// Dane podstawowe · Kraje specjalne · Stawki · GPS · Karta paliwowa ·
// Porozumienie · Odpady · Kabotaż · ADR.
//
// EURO is a static <Badge> «EURO VI» (the single-value select was removed).
// Conditional sub-blocks use the shared <RevealInset>; every upload is the
// compact <FileUpload variant="compact">. The fuel-card status badge is live-
// computed client-side; the porozumienie «Brak skanu» warning is amber + non-
// blocking.
//
// FILE STATE NOTE: attachment files are deliberately NOT part of the RHF form
// (CreateVehicleSchema is `.strict()` and `File` isn't JSON-serialisable, so it
// would break `useFormDraft`). They live in component `useState`; the submit
// handler hands them to the mutation as a separate `files` payload.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateVehicleSchema,
  WasteCountrySchema,
  AdrClassSchema,
  type CreateVehicleDto,
  type UpdateVehicleDto,
  type VehicleAttachmentCategory,
  type VehicleAttachmentDto,
  type VehicleDto,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  FileUpload,
  type FileUploadItem,
  type FileUploadLabels,
} from '@/components/ui/FileUpload';
import { Input } from '@/components/ui/Input';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { TeamMembers } from '@/components/teams/TeamMembers';
import { EntityAlreadyExistsNotice } from '@/components/carrier-onboarding/EntityAlreadyExistsNotice';
import { TemporaryPasswordRow } from '@/components/carrier-onboarding/TemporaryPasswordRow';
import { WizardStepper } from '@/components/carrier-onboarding/WizardStepper';
import {
  FormField,
  FormGrid,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
} from '@/components/forms/Form';
import {
  FormDialog,
  FormDialogBody,
  FormDialogDescription,
  FormDialogFooter,
  FormDialogHeader,
  FormDialogTitle,
} from '@/components/forms/FormDialog';
import { RevealInset } from '@/components/forms/RevealInset';
import { ActiveStatusRow } from '@/components/forms/ActiveStatusRow';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { usePlanisci, useTeamLookups } from '@/lib/hooks/useLookups';
import { useCreateVehicle, useUpdateVehicle } from '@/lib/hooks/useVehicles';
import type { VehicleAttachmentUploads } from '@/lib/api/vehicles';

const DRAFT_KEY = 'draft:vehicles:new';

interface Props {
  open: boolean;
  vehicle: VehicleDto | null;
  onClose: () => void;
  /** `standalone` (default) — success toast + close. `wizard` — step 2 of the
   *  carrier-onboarding flow (see the wizard docs on VehicleSheet's ancestor). */
  mode?: 'standalone' | 'wizard';
  wizardCarrierId?: string;
  wizardCarrierLabel?: string;
  wizardTempPassword?: string | null;
  onCompleted?: (created: VehicleDto) => void;
  onSkip?: () => void;
  onExit?: () => void;
  wizardCurrentStep?: 1 | 2 | 3 | 4;
  wizardCompletedSteps?: number[];
  wizardSkippedSteps?: number[];
  wizardEntityAlreadyExists?: boolean;
}

type FormValues = CreateVehicleDto;

const NUMERIC_FIELDS = [
  'rateDe',
  'rateUe',
  'rateExport',
  'rateImport',
] as const;

/** The gps / porozumienie / cabotage upload slots, keyed by bucket. */
type FileBucketKey =
  | 'gps'
  | 'agreement'
  | 'cabotageDeInsurance';

const BUCKET_KEYS: FileBucketKey[] = [
  'gps',
  'agreement',
  'cabotageDeInsurance',
];

/** Maps a UI bucket key to the server `VehicleAttachmentCategory`. */
const BUCKET_CATEGORY: Record<FileBucketKey, VehicleAttachmentCategory> = {
  gps: 'gps',
  agreement: 'agreement',
  cabotageDeInsurance: 'cabotage_de_insurance',
};

type FileBuckets = Record<FileBucketKey, FileUploadItem[]>;

const EMPTY_BUCKETS: FileBuckets = {
  gps: [],
  agreement: [],
  cabotageDeInsurance: [],
};

export function VehicleFormDialog({
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
  const tFile = useTranslations('fileUpload');
  const tMulti = useTranslations('multiSelect');
  const isEdit = vehicle !== null;
  const isWizard = mode === 'wizard';

  const form = useForm<FormValues>({
    resolver: zodResolver(CreateVehicleSchema) as never,
    defaultValues: getDefaults(),
  });

  const [fileBuckets, setFileBuckets] = useState<FileBuckets>(EMPTY_BUCKETS);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  // Field-level required-file signalling (§13.2.2) — set on submit, cleared on
  // any file change.
  const [fileFieldErrors, setFileFieldErrors] = useState<
    Partial<Record<FileBucketKey, boolean>>
  >({});

  const carriersQ = useCarriers({ limit: 200 });
  const planisciQ = usePlanisci();
  const teamsQ = useTeamLookups();

  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit && !isWizard,
    sanitize: (raw) => {
      const allowed = new Set(Object.keys(getDefaults()));
      return Object.fromEntries(
        Object.entries(raw).filter(([k]) => allowed.has(k)),
      ) as Partial<FormValues>;
    },
  });

  useEffect(() => {
    if (!open) return;
    setAttachmentError(null);
    setFileFieldErrors({});
    if (isEdit && vehicle) {
      form.reset({
        carrierId: vehicle.carrierId,
        plateNumber: vehicle.plateNumber,
        active: vehicle.active,
        plannerId: vehicle.plannerId ?? undefined,
        dispatchTeamId: vehicle.dispatchTeamId ?? undefined,
        notes: vehicle.notes ?? '',
        certificateL: vehicle.certificateL,
        euro: vehicle.euro,
        fuelCard: vehicle.fuelCard,
        fuelCardNumber: vehicle.fuelCardNumber ?? '',
        fuelCardExpiry: vehicle.fuelCardExpiry ?? '',
        fuelCardPin: vehicle.fuelCardPin ?? '',
        type: vehicle.type,
        gb: vehicle.gb ?? false,
        it: vehicle.it ?? false,
        fr: vehicle.fr ?? false,
        agreement: vehicle.agreement ?? false,
        rateDe: vehicle.rateDe ?? (undefined as unknown as number),
        rateUe: vehicle.rateUe ?? (undefined as unknown as number),
        rateExport: vehicle.rateExport ?? (undefined as unknown as number),
        rateImport: vehicle.rateImport ?? (undefined as unknown as number),
        wasteAllowed: vehicle.wasteAllowed,
        wasteCountries: vehicle.wasteCountries ?? [],
        cabotageDe: vehicle.cabotageDe,
        cabotageFr: vehicle.cabotageFr,
        adr: vehicle.adr,
        adrClasses: vehicle.adrClasses ?? [],
        gpsMobilePhone: vehicle.gpsMobilePhone ?? '',
        sideNumber: vehicle.sideNumber ?? '',
      });
      setFileBuckets(attachmentsToBuckets(vehicle.attachments ?? []));
    } else {
      form.reset({
        ...getDefaults(),
        ...(isWizard && wizardCarrierId ? { carrierId: wizardCarrierId } : {}),
      });
      setFileBuckets(EMPTY_BUCKETS);
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, vehicle, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateVehicle({
    onSuccess: (created) => {
      draft.clear();
      form.reset(getDefaults());
      setFileBuckets(EMPTY_BUCKETS);
      if (isWizard) {
        onCompleted?.(created);
        return;
      }
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (err) => handleSubmitError(err),
  });
  const updateM = useUpdateVehicle({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (err) => handleSubmitError(err),
  });

  function handleSubmitError(err: unknown) {
    const violations = extractViolations(err);
    if (violations.length > 0) {
      setAttachmentError(violations.join(' · '));
      return;
    }
    toast.error(tCommon('errorGeneric'));
  }

  const setBucket = useCallback((key: FileBucketKey, items: FileUploadItem[]) => {
    setFileBuckets((prev) => ({ ...prev, [key]: items }));
    setAttachmentError(null);
    setFileFieldErrors((prev) => ({ ...prev, [key]: false }));
  }, []);

  const onSubmit = form.handleSubmit(
    (values) => {
      const missing = missingRequiredAttachments(values, fileBuckets);
      if (missing.length > 0) {
        setFileFieldErrors(
          Object.fromEntries(missing.map((k) => [k, true])) as Record<
            FileBucketKey,
            boolean
          >,
        );
        setAttachmentError(
          missing
            .map((k) => tFile(`required.${BUCKET_CATEGORY[k]}`))
            .join(' · '),
        );
        return;
      }
      setAttachmentError(null);
      setFileFieldErrors({});

      const cleaned = cleanForm(values);
      const newFiles = collectNewFiles(fileBuckets);

      if (isEdit && vehicle) {
        const { carrierId: _carrierId, ...rest } = cleaned;
        void _carrierId;
        const removeAttachmentIds = collectRemovedIds(
          vehicle.attachments ?? [],
          fileBuckets,
        );
        const body: Record<string, unknown> = { ...rest };
        if (removeAttachmentIds.length > 0) {
          body.removeAttachmentIds = removeAttachmentIds;
        }
        updateM.mutate({
          id: vehicle.id,
          body: body as UpdateVehicleDto,
          files: newFiles,
        });
      } else {
        createM.mutate({ body: cleaned as CreateVehicleDto, files: newFiles });
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  // Conditional reveals.
  const gpsNumber = (form.watch('gpsMobilePhone') ?? '').trim();
  const gpsFilled = gpsNumber.length > 0;
  const fuelCardOn = form.watch('fuelCard') === true;
  const agreementOn = form.watch('agreement') === true;
  const wasteOn = form.watch('wasteAllowed') === true;
  const cabotageDeOn = form.watch('cabotageDe') === true;
  const adrOn = form.watch('adr') === true;
  const activeOn = form.watch('active') === true;

  // Clear checkbox-gated multi-selects when their flag turns off so an orphan
  // value never leaks into the payload / trips the refine.
  useEffect(() => {
    if (!wasteOn) form.setValue('wasteCountries', []);
  }, [wasteOn, form]);
  useEffect(() => {
    if (!adrOn) form.setValue('adrClasses', []);
  }, [adrOn, form]);

  // Fuel-card live status (§13.2.3) — blocked until agreement=true AND ≥1
  // porozumienie scan (existing or new).
  const agreementScanPresent = bucketHasFiles(fileBuckets.agreement);
  const fuelCardActive = agreementOn && agreementScanPresent;

  // HARD server rule: fuelCard=true ⇒ agreement=true (422 «Karta paliwowa
  // wymaga zaznaczenia porozumienia», mirrored in the shared Zod refine, which
  // the zodResolver surfaces on the `fuelCard` field). UX enforcement on top:
  // when porozumienie is off the checkbox is disabled so a valid form can't tick
  // it. But we NEVER silently clear an already-on fuelCard when the operator
  // turns porozumienie off — we keep the section visible + show a blocking hint
  // so they know why Zapisz will fail (their data stays intact).
  //
  // NOTE: this HARD gate keys off the porozumienie FLAG (`agreement`); it is
  // distinct from the SOFT `fuelCardActive` badge below, which additionally
  // requires the porozumienie SCAN. When the flag is off we show the hard-gate
  // hint; the RevealInset (and its soft badge) don't render because the checkbox
  // can't be ticked in that state — so the two hints never visually duplicate.
  const fuelCardAgreementConflict = fuelCardOn && !agreementOn;

  const dispatchTeamId = form.watch('dispatchTeamId');
  const selectedTeam = useMemo(
    () => (teamsQ.data ?? []).find((team) => team.id === dispatchTeamId) ?? null,
    [teamsQ.data, dispatchTeamId],
  );

  const fileLabels = useMemo<FileUploadLabels>(
    () => ({
      prompt: tFile('prompt'),
      promptCompact: tFile('promptCompact'),
      constraints: tFile('constraints'),
      errTooLarge: tFile('errTooLarge'),
      errWrongType: tFile('errWrongType'),
      errUploadFailed: tFile('errUploadFailed'),
      retry: tFile('retry'),
      dropzoneAria: tFile('dropzoneAria'),
      removeAria: (name: string) => tFile('removeAria', { name }),
      change: tFile('change'),
    }),
    [tFile],
  );

  const wasteOptions = useMemo(
    () =>
      WasteCountrySchema.options.map((c) => ({
        value: c,
        label: t(`wasteCountryOptions.${c}`),
      })),
    [t],
  );
  const adrOptions = useMemo(
    () =>
      AdrClassSchema.options.map((c) => ({
        value: c,
        label: tCommon('adrClassOption', { n: c }),
      })),
    [tCommon],
  );

  const handleClose = () => {
    if (isWizard) onExit?.();
    else onClose();
  };

  return (
    <FormDialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <FormDialogHeader>
          <FormDialogTitle>
            {isWizard
              ? tWizard('wizard.header.title', { n: wizardCurrentStep ?? 2 })
              : isEdit
                ? t('editVehicle')
                : t('newVehicle')}
          </FormDialogTitle>
          <FormDialogDescription>
            {isEdit && vehicle ? (
              <span className="font-mono">{vehicle.plateNumber}</span>
            ) : null}
          </FormDialogDescription>
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
        </FormDialogHeader>

        <FormDialogBody>
          {isWizard && wizardEntityAlreadyExists && (
            <EntityAlreadyExistsNotice
              message={tWizard('wizard.entityAlreadyExists.vehicle')}
              dismissLabel={tCommon('clear')}
            />
          )}
          <div className="space-y-6">
            {/* ── Dane podstawowe ── */}
            <FormSection title={t('sections.basic')}>
              {!isEdit && (
                <FormField
                  label={t('fields.carrier')}
                  required
                  error={errs.carrierId?.message}
                  htmlFor="vehicle-carrierId"
                  className="md:col-span-2"
                >
                  {isWizard ? (
                    <Input
                      id="vehicle-carrierId"
                      value={wizardCarrierLabel ?? ''}
                      readOnly
                      disabled
                      aria-readonly="true"
                    />
                  ) : (
                    <Select id="vehicle-carrierId" {...form.register('carrierId')}>
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
              <FormGrid cols={2}>
                <FormField
                  label={t('fields.plateNumber')}
                  required
                  error={errs.plateNumber?.message}
                  htmlFor="vehicle-plateNumber"
                >
                  <Input id="vehicle-plateNumber" {...form.register('plateNumber')} />
                </FormField>
                <FormField
                  label={t('fields.sideNumber')}
                  error={errs.sideNumber?.message}
                  htmlFor="vehicle-sideNumber"
                >
                  <Input id="vehicle-sideNumber" {...form.register('sideNumber')} />
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
                {/* EURO — static badge; the single-value select was removed. */}
                <FormItem>
                  <FormLabel>{t('fields.euro')}</FormLabel>
                  <div>
                    <Badge variant="muted">{t('euroBadge')}</Badge>
                  </div>
                </FormItem>
                <FormField
                  label={t('fields.planner')}
                  required
                  error={errs.plannerId?.message}
                  htmlFor="vehicle-plannerId"
                >
                  <Select id="vehicle-plannerId" {...form.register('plannerId')}>
                    <option value="">—</option>
                    {(planisciQ.data ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.login}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label={t('fields.dispatchTeam')}
                  required
                  error={errs.dispatchTeamId?.message}
                  htmlFor="vehicle-dispatchTeamId"
                >
                  <Select
                    id="vehicle-dispatchTeamId"
                    {...form.register('dispatchTeamId')}
                  >
                    <option value="">—</option>
                    {(teamsQ.data ?? []).map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.code}
                        {team.name ? ` — ${team.name}` : ''}
                        {team.active ? '' : ` (${tCommon('inactive')})`}
                      </option>
                    ))}
                  </Select>
                  {selectedTeam && (
                    <div className="mt-2">
                      <TeamMembers team={selectedTeam} variant="chips" size="sm" />
                    </div>
                  )}
                </FormField>
                <FormField
                  label={t('fields.notes')}
                  error={errs.notes?.message}
                  htmlFor="vehicle-notes"
                  className="md:col-span-2"
                >
                  <Textarea id="vehicle-notes" rows={3} {...form.register('notes')} />
                </FormField>
              </FormGrid>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <label className="flex items-center gap-2 text-text">
                  <Checkbox {...form.register('certificateL')} />
                  {t('fields.certificateL')}
                </label>
              </div>
            </FormSection>

            {/* ── Kraje specjalne — min. 2 z 3 ── */}
            <FormSection title={t('sections.specialCountries')}>
              <p className="text-xs text-text-sub">
                {t('sections.specialCountriesHint')}
              </p>
              <FormGrid cols={3}>
                {(['gb', 'it', 'fr'] as const).map((key) => (
                  <label key={key} className="flex flex-col gap-0.5 text-sm text-text">
                    <span className="flex items-center gap-2">
                      <Checkbox {...form.register(key)} />
                      {t(`fields.${key}`)}
                    </span>
                    <span className="text-xs text-text-sub">
                      {t(`sections.${key}Hint`)}
                    </span>
                  </label>
                ))}
              </FormGrid>
              {errs.gb?.message && <FormMessage>{errs.gb.message}</FormMessage>}
            </FormSection>

            {/* ── Stawki ── */}
            <FormSection title={t('sections.rates')}>
              <FormGrid cols={4}>
                {(['rateDe', 'rateUe', 'rateExport', 'rateImport'] as const).map(
                  (key) => (
                    <FormField
                      key={key}
                      label={t(`fields.${key}`)}
                      required
                      error={errs[key]?.message}
                      htmlFor={`vehicle-${key}`}
                    >
                      <Input
                        id={`vehicle-${key}`}
                        type="number"
                        step="0.01"
                        min={0}
                        {...form.register(key, {
                          setValueAs: (v) =>
                            v === '' || v === null ? undefined : Number(v),
                        })}
                      />
                    </FormField>
                  ),
                )}
              </FormGrid>
            </FormSection>

            {/* ── GPS ── */}
            <FormSection title={t('sections.gps')}>
              <FormField
                label={t('fields.gpsMobilePhone')}
                error={errs.gpsMobilePhone?.message}
                htmlFor="vehicle-gpsMobilePhone"
              >
                <Input
                  id="vehicle-gpsMobilePhone"
                  {...form.register('gpsMobilePhone')}
                />
              </FormField>
              {gpsFilled && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="vehicle-file-gps" required>
                      {tFile('fields.gps')}
                    </FormLabel>
                    <FileUpload
                      id="vehicle-file-gps"
                      variant="compact"
                      multiple={false}
                      value={fileBuckets.gps}
                      onChange={(items) => setBucket('gps', items)}
                      labels={fileLabels}
                      invalid={fileFieldErrors.gps}
                    />
                    {fileFieldErrors.gps && (
                      <FormMessage>{tFile('required.gps')}</FormMessage>
                    )}
                  </FormItem>
                </RevealInset>
              )}
            </FormSection>

            {/* ── Karta paliwowa ── (HARD: fuelCard ⇒ porozumienie, §13.9) */}
            <FormSection title={t('sections.fuelCard')}>
              <label
                className={`flex items-center gap-2 text-sm ${
                  !agreementOn ? 'text-text-sub' : 'text-text'
                }`}
              >
                <Checkbox
                  {...form.register('fuelCard')}
                  disabled={!agreementOn}
                  aria-describedby={
                    !agreementOn ? 'vehicle-fuelCard-agreement-hint' : undefined
                  }
                />
                {t('fields.fuelCard')}
              </label>
              {!agreementOn && (
                <p
                  id="vehicle-fuelCard-agreement-hint"
                  className={`flex items-center gap-1.5 text-xs ${
                    fuelCardAgreementConflict
                      ? 'text-danger'
                      : 'text-text-sub'
                  }`}
                  role={fuelCardAgreementConflict ? 'alert' : undefined}
                >
                  <AlertTriangle size={14} aria-hidden />
                  {t('fuelCardAgreementRequired')}
                </p>
              )}
              {fuelCardOn && (
                <RevealInset>
                  <FormGrid cols={2}>
                    <FormField
                      label={t('fields.fuelCardNumber')}
                      required
                      error={errs.fuelCardNumber?.message}
                      htmlFor="vehicle-fuelCardNumber"
                    >
                      <Input
                        id="vehicle-fuelCardNumber"
                        inputMode="numeric"
                        maxLength={16}
                        {...form.register('fuelCardNumber')}
                      />
                    </FormField>
                    <FormField
                      label={t('fields.fuelCardExpiry')}
                      required
                      error={errs.fuelCardExpiry?.message}
                      htmlFor="vehicle-fuelCardExpiry"
                    >
                      <Input
                        id="vehicle-fuelCardExpiry"
                        type="date"
                        {...form.register('fuelCardExpiry')}
                      />
                    </FormField>
                    <FormField
                      label={t('fields.fuelCardPin')}
                      required
                      error={errs.fuelCardPin?.message}
                      htmlFor="vehicle-fuelCardPin"
                    >
                      <Input
                        id="vehicle-fuelCardPin"
                        inputMode="numeric"
                        maxLength={6}
                        {...form.register('fuelCardPin')}
                      />
                    </FormField>
                    <FormItem>
                      <FormLabel>{t('fuelCardStatus.label')}</FormLabel>
                      <div className="flex flex-col gap-1">
                        {fuelCardActive ? (
                          <Badge variant="success">
                            {t('fuelCardStatus.active')}
                          </Badge>
                        ) : (
                          <Badge variant="danger">
                            {t('fuelCardStatus.blocked')}
                          </Badge>
                        )}
                        {!fuelCardActive && (
                          <span className="text-xs text-text-sub">
                            {t('fuelCardStatus.blockedReason')}
                          </span>
                        )}
                      </div>
                    </FormItem>
                  </FormGrid>
                </RevealInset>
              )}
            </FormSection>

            {/* ── Porozumienie ── (soft: no scan → amber warning, never blocks) */}
            <FormSection title={t('sections.agreement')}>
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('agreement')} />
                {t('fields.agreement')}
              </label>
              {agreementOn && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="vehicle-file-agreement">
                      {tFile('fields.agreement')}
                    </FormLabel>
                    <FileUpload
                      id="vehicle-file-agreement"
                      variant="compact"
                      multiple={false}
                      value={fileBuckets.agreement}
                      onChange={(items) => setBucket('agreement', items)}
                      labels={fileLabels}
                    />
                    {!agreementScanPresent && (
                      <p className="flex items-center gap-1.5 text-xs text-warning-dark dark:text-warning">
                        <AlertTriangle size={14} aria-hidden />
                        {t('agreementScanMissing')}
                      </p>
                    )}
                  </FormItem>
                </RevealInset>
              )}
            </FormSection>

            {/* ── Odpady — min. 1 kraj ── */}
            <FormSection title={t('sections.waste')}>
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('wasteAllowed')} />
                {t('fields.wasteAllowed')}
              </label>
              {wasteOn && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="vehicle-wasteCountries" required>
                      {t('fields.wasteCountries')}
                    </FormLabel>
                    <Controller
                      control={form.control}
                      name="wasteCountries"
                      render={({ field }) => (
                        <MultiSelect
                          id="vehicle-wasteCountries"
                          options={wasteOptions}
                          value={field.value ?? []}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          sort={false}
                          placeholder={tMulti('wastePlaceholder')}
                          searchPlaceholder={tMulti('searchPlaceholder')}
                          emptyText={tMulti('noResults')}
                          removeAriaLabel={(l) => tMulti('removeAria', { name: l })}
                        />
                      )}
                    />
                    {errs.wasteCountries?.message && (
                      <FormMessage>{errs.wasteCountries.message}</FormMessage>
                    )}
                  </FormItem>
                </RevealInset>
              )}
            </FormSection>

            {/* ── Kabotaż ── */}
            <FormSection title={t('sections.cabotage')}>
              <FormGrid cols={2}>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('cabotageDe')} />
                  {t('fields.cabotageDe')}
                </label>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('cabotageFr')} />
                  {t('fields.cabotageFr')}
                </label>
              </FormGrid>
              {cabotageDeOn && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="vehicle-file-cabotageDeInsurance" required>
                      {tFile('fields.cabotageDeInsurance')}
                    </FormLabel>
                    <FileUpload
                      id="vehicle-file-cabotageDeInsurance"
                      variant="compact"
                      multiple={false}
                      value={fileBuckets.cabotageDeInsurance}
                      onChange={(items) => setBucket('cabotageDeInsurance', items)}
                      labels={fileLabels}
                      invalid={fileFieldErrors.cabotageDeInsurance}
                    />
                    {fileFieldErrors.cabotageDeInsurance && (
                      <FormMessage>
                        {tFile('required.cabotage_de_insurance')}
                      </FormMessage>
                    )}
                  </FormItem>
                </RevealInset>
              )}
            </FormSection>

            {/* ── ADR — min. 1 klasa ── */}
            <FormSection title={t('sections.adr')}>
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('adr')} />
                {t('fields.adr')}
              </label>
              {adrOn && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="vehicle-adrClasses" required>
                      {t('fields.adrClasses')}
                    </FormLabel>
                    <Controller
                      control={form.control}
                      name="adrClasses"
                      render={({ field }) => (
                        <MultiSelect
                          id="vehicle-adrClasses"
                          options={adrOptions}
                          value={field.value ?? []}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          sort={false}
                          placeholder={tMulti('adrPlaceholder')}
                          searchPlaceholder={tMulti('searchPlaceholder')}
                          emptyText={tMulti('noResults')}
                          removeAriaLabel={(l) => tMulti('removeAria', { name: l })}
                        />
                      )}
                    />
                    {errs.adrClasses?.message && (
                      <FormMessage>{errs.adrClasses.message}</FormMessage>
                    )}
                  </FormItem>
                </RevealInset>
              )}
            </FormSection>

            {/* ── Aktywny — distinguished status row, body bottom (§13.2.4) ── */}
            <ActiveStatusRow
              label={t('fields.active')}
              consequence={tWizard('formActive.vehicleConsequence')}
              activeBadgeLabel={tCommon('active')}
              inactiveBadgeLabel={tCommon('inactive')}
              checked={activeOn}
              checkboxProps={form.register('active')}
            />
          </div>
        </FormDialogBody>

        <FormDialogFooter>
          {attachmentError && (
            <p className="mr-auto text-sm text-danger" role="alert">
              {attachmentError}
            </p>
          )}
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
                    setFileBuckets(EMPTY_BUCKETS);
                    setAttachmentError(null);
                    setFileFieldErrors({});
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
        </FormDialogFooter>
      </form>
    </FormDialog>
  );
}

function getDefaults(): FormValues {
  return {
    carrierId: '' as unknown as string,
    plateNumber: '',
    active: true,
    plannerId: '' as unknown as string,
    dispatchTeamId: '' as unknown as string,
    notes: '',
    certificateL: false,
    // EURO is fixed to VI (static badge — no field); default it so the strict
    // schema is satisfied without an input.
    euro: 'VI',
    fuelCard: false,
    fuelCardNumber: '',
    fuelCardExpiry: '',
    fuelCardPin: '',
    type: '' as unknown as 'MEGA' | 'STD' | 'COIL',
    gb: false,
    it: false,
    fr: false,
    agreement: false,
    rateDe: undefined as unknown as number,
    rateUe: undefined as unknown as number,
    rateExport: undefined as unknown as number,
    rateImport: undefined as unknown as number,
    wasteAllowed: false,
    wasteCountries: [],
    cabotageDe: false,
    cabotageFr: false,
    adr: false,
    adrClasses: [],
    gpsMobilePhone: '',
    sideNumber: '',
  };
}

function cleanForm(values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v)) {
      out[k] = v;
      continue;
    }
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

// ─── Attachment helpers ──────────────────────────────────

function attachmentsToBuckets(attachments: VehicleAttachmentDto[]): FileBuckets {
  const buckets: FileBuckets = {
    gps: [],
    agreement: [],
    cabotageDeInsurance: [],
  };
  for (const att of attachments) {
    const item: FileUploadItem = {
      kind: 'existing',
      id: att.id,
      fileName: att.fileName,
      size: att.size,
      mimeType: att.mimeType,
    };
    if (att.category === 'gps') buckets.gps.push(item);
    else if (att.category === 'agreement') buckets.agreement.push(item);
    else if (att.category === 'cabotage_de_insurance')
      buckets.cabotageDeInsurance.push(item);
  }
  return buckets;
}

function pickNew(items: FileUploadItem[]): File[] {
  return items
    .filter(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    )
    .map((it) => it.file);
}

function collectNewFiles(buckets: FileBuckets): VehicleAttachmentUploads {
  return {
    gps: pickNew(buckets.gps),
    agreement: pickNew(buckets.agreement),
    cabotageDeInsurance: pickNew(buckets.cabotageDeInsurance),
  };
}

function collectRemovedIds(
  original: VehicleAttachmentDto[],
  buckets: FileBuckets,
): string[] {
  const stillPresent = new Set<string>();
  for (const key of BUCKET_KEYS) {
    for (const item of buckets[key]) {
      if (item.kind === 'existing') stillPresent.add(item.id);
    }
  }
  return original.map((a) => a.id).filter((id) => !stillPresent.has(id));
}

/** ≥1 existing (non-removed) OR newly-added valid file in the bucket. */
function bucketHasFiles(items: FileUploadItem[]): boolean {
  return items.some((it) => it.kind === 'existing' || it.error === undefined);
}

/**
 * Client-side mirror of the server's required-attachment rule (§13.3):
 *   gpsMobilePhone set  ⇒ gps (umowa GPS)
 *   cabotageDe=true     ⇒ cabotageDeInsurance (ubezpieczenie kabotażowe)
 * Porozumienie (agreement) is SOFT — never required. Returns the missing
 * bucket keys.
 */
function missingRequiredAttachments(
  values: FormValues,
  buckets: FileBuckets,
): FileBucketKey[] {
  const missing: FileBucketKey[] = [];
  if ((values.gpsMobilePhone ?? '').trim() && !bucketHasFiles(buckets.gps)) {
    missing.push('gps');
  }
  if (values.cabotageDe === true) {
    if (!bucketHasFiles(buckets.cabotageDeInsurance)) {
      missing.push('cabotageDeInsurance');
    }
  }
  return missing;
}

function extractViolations(err: unknown): string[] {
  if (err && typeof err === 'object' && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === 'object' && 'violations' in data) {
      const v = (data as { violations?: unknown }).violations;
      if (Array.isArray(v)) {
        return v.filter((x): x is string => typeof x === 'string');
      }
    }
  }
  return [];
}
