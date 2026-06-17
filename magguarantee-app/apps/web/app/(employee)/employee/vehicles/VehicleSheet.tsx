'use client';

// Create / edit drawer for a vehicle. ~36 fields total — uses the wide sheet
// (640px) and section dividers per docs/14-design-system.md § Form patterns.
//
// Phase 5 (docs/14 § Phase 5):
//  - EURO norm restricted to V / VI (DB enum dropped III / IV).
//  - The legacy `contract` boolean is gone — the umowa is now a scanned file.
//  - POST/PATCH are multipart/form-data — see lib/api/vehicles.ts.
//
// 2026-06-17 (migration `drop_vehicle_gps_toggle_require_gps_device`):
//  - The `gps` boolean toggle is GONE. Every vehicle in the km-guarantee
//    program is GPS-tracked, so `gpsMobilePhone` (the tracker device id) is now
//    REQUIRED, non-empty, unconditionally — no longer revealed by a checkbox.
//  - The umowa screenshot (<FileUpload> category=contract) is now
//    UNCONDITIONALLY REQUIRED on create — it used to be gated on gps=true. On
//    edit we don't impose a new hard block (matches the server). Cabotage
//    permit scans keep their per-checkbox conditional-required rule.
//
// FILE STATE NOTE: attachment files are deliberately NOT part of the RHF form.
// `CreateVehicleSchema` is `.strict()` so any extra key fails validation, and
// `File` objects are not JSON-serialisable (they'd break `useFormDraft`).
// They live in component `useState` instead; the submit handler hands them to
// the mutation as a separate `files` payload.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateVehicleSchema,
  type CreateVehicleDto,
  type UpdateVehicleDto,
  type VehicleAttachmentCategory,
  type VehicleAttachmentDto,
  type VehicleDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  FileUpload,
  type FileUploadItem,
  type FileUploadLabels,
} from '@/components/ui/FileUpload';
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
import { TeamMembers } from '@/components/teams/TeamMembers';
import { EntityAlreadyExistsNotice } from '@/components/carrier-onboarding/EntityAlreadyExistsNotice';
import { TemporaryPasswordRow } from '@/components/carrier-onboarding/TemporaryPasswordRow';
import { WizardStepper } from '@/components/carrier-onboarding/WizardStepper';
import { FormField, FormGrid, FormSection } from '@/components/forms/Form';
import { FormDescription, FormItem, FormLabel } from '@/components/forms/Form';
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
  'rateDe',
  'rateUe',
  'rateExport',
  'rateImport',
] as const;

/** The umowa / cabotage <FileUpload> slots, keyed by attachment category. */
type FileBucketKey = 'contract' | 'cabotageDe' | 'cabotageFr';

/** Maps a UI bucket key to the server `VehicleAttachmentCategory`. */
const BUCKET_CATEGORY: Record<FileBucketKey, VehicleAttachmentCategory> = {
  contract: 'contract',
  cabotageDe: 'cabotage_de',
  cabotageFr: 'cabotage_fr',
};

type FileBuckets = Record<FileBucketKey, FileUploadItem[]>;

const EMPTY_BUCKETS: FileBuckets = {
  contract: [],
  cabotageDe: [],
  cabotageFr: [],
};

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
  const tFile = useTranslations('fileUpload');
  const isEdit = vehicle !== null;
  const isWizard = mode === 'wizard';

  // Form state matches CreateVehicleDto in both modes — edit mode keeps
  // `carrierId` in state for display only and the submit handler strips it
  // before calling PATCH. We always validate against CreateVehicleSchema so
  // `gpsMobilePhone`'s required, non-empty rule fires on edit too.
  const form = useForm<FormValues>({
    resolver: zodResolver(CreateVehicleSchema) as never,
    defaultValues: getDefaults(),
  });

  // ── Attachment file state ──────────────────────────────
  // Kept OUTSIDE the RHF form (see file-header note). One bucket per
  // attachment category. In edit mode buckets are seeded from the vehicle's
  // existing server attachments.
  const [fileBuckets, setFileBuckets] = useState<FileBuckets>(EMPTY_BUCKETS);
  // Cross-field attachment error (mirror of the server's required-attachment
  // 422). Surfaced inline above the footer; cleared on any file change.
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const carriersQ = useCarriers({ limit: 200 });
  const planisciQ = usePlanisci();
  // Phase 11 — dispatch TEAMS (replaces the single-dispatcher picker). Carries
  // each team's dispatcher roster so the live <TeamMembers> preview renders
  // without a second fetch.
  const teamsQ = useTeamLookups();

  // Persist create-mode drafts; closing the sheet keeps user input intact.
  // Wizard mode opts out. NOTE: file buckets are NOT persisted — `File`
  // objects can't be JSON-serialised, and `useFormDraft` only ever sees the
  // RHF form (which holds scalar fields only), so files are naturally
  // excluded from the draft. The user re-attaches files after a draft
  // restore; this is the documented, intentional behaviour.
  // `sanitize` drops any persisted key no longer in the form shape (e.g. the
  // brand/model/year fields removed 2026-06, and the `gps` toggle removed
  // 2026-06-17) — otherwise the strict CreateVehicleSchema rejects the whole
  // form the instant a stale draft hydrates, even though nothing the user can
  // see is wrong. The allowed-set is derived from `getDefaults()`, so removing
  // a field from defaults is enough to evict it from any lingering draft.
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
        type: vehicle.type,
        gb: vehicle.gb ?? false,
        it: vehicle.it ?? false,
        fr: vehicle.fr ?? false,
        agreement: vehicle.agreement ?? false,
        // `contract` boolean removed — the umowa is a VehicleAttachment now.
        // Existing rows from before rates were required may still hold null
        // — surface as empty input so the user is forced to re-enter on edit.
        rateDe: vehicle.rateDe ?? (undefined as unknown as number),
        rateUe: vehicle.rateUe ?? (undefined as unknown as number),
        rateExport: vehicle.rateExport ?? (undefined as unknown as number),
        rateImport: vehicle.rateImport ?? (undefined as unknown as number),
        wasteAllowed: vehicle.wasteAllowed,
        cabotageDe: vehicle.cabotageDe,
        cabotageFr: vehicle.cabotageFr,
        adr: vehicle.adr,
        gpsMobilePhone: vehicle.gpsMobilePhone ?? '',
        sideNumber: vehicle.sideNumber ?? '',
      });
      // Seed the file buckets from the vehicle's existing attachments.
      setFileBuckets(attachmentsToBuckets(vehicle.attachments ?? []));
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top.
      form.reset({
        ...getDefaults(),
        ...(isWizard && wizardCarrierId
          ? { carrierId: wizardCarrierId }
          : {}),
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
      // Create-with-ADR reminder: a vehicle marked ADR implies the carrier
      // must hold an ADR document, managed separately in the carrier's
      // Documents tab. Nudge the operator (informational, not blocking). Only
      // on create — editing an existing vehicle doesn't change this obligation.
      if (created.adr) {
        toast.info(t('adrDocReminderToast'));
      }
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

  /**
   * Surfaces a mutation error. The server's required-attachment rule returns
   * 422 `{ violations: string[] }`; we render those inline rather than a
   * generic toast so the operator sees exactly which scan is missing.
   */
  function handleSubmitError(err: unknown) {
    const violations = extractViolations(err);
    if (violations.length > 0) {
      setAttachmentError(violations.join(' · '));
      return;
    }
    toast.error(tCommon('errorGeneric'));
  }

  /** Updates one file bucket and clears the cross-field attachment error. */
  const setBucket = useCallback(
    (key: FileBucketKey, items: FileUploadItem[]) => {
      setFileBuckets((prev) => ({ ...prev, [key]: items }));
      setAttachmentError(null);
    },
    [],
  );

  const onSubmit = form.handleSubmit(
    (values) => {
      // Client-side mirror of the server's required-attachment rule. Block
      // the submit and surface a clear inline error if violated. The umowa
      // (contract) scan is required only on CREATE — edit doesn't re-block it.
      const missing = missingRequiredAttachments(values, fileBuckets, isEdit);
      if (missing.length > 0) {
        setAttachmentError(
          missing.map((cat) => tFile(`required.${cat}`)).join(' · '),
        );
        return;
      }
      setAttachmentError(null);

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
        createM.mutate({
          body: cleaned as CreateVehicleDto,
          files: newFiles,
        });
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;
  // Watch the toggles that reveal conditional <FileUpload> blocks. The umowa
  // (contract) upload is no longer toggle-gated — it is always shown and is
  // required on create — so only the cabotage flags are watched here.
  const cabotageDeOn = form.watch('cabotageDe') === true;
  const cabotageFrOn = form.watch('cabotageFr') === true;
  // Phase 11 — live <TeamMembers> preview of the picked dispatch team. Resolved
  // from the lookup roster the form already holds (no second fetch).
  const dispatchTeamId = form.watch('dispatchTeamId');
  const selectedTeam = useMemo(
    () => (teamsQ.data ?? []).find((team) => team.id === dispatchTeamId) ?? null,
    [teamsQ.data, dispatchTeamId],
  );

  // i18n label bundle for <FileUpload>, memoised so the primitive doesn't
  // re-render on every keystroke elsewhere in the form.
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
    }),
    [tFile],
  );

  const handleClose = () => {
    if (isWizard) onExit?.();
    else onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent size="wide">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
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
                <FormGrid cols={2}>
                  {!isEdit && (
                    <FormField
                      label={t('fields.carrier')}
                      required
                      error={errs.carrierId?.message}
                      htmlFor="vehicle-carrierId"
                    >
                      {isWizard ? (
                        // Read-only carrier in wizard mode — primitive Input
                        // already supplies `bg-input` + `h-10`; the
                        // `disabled readOnly` pair stays so screen readers
                        // and form serialisation behave correctly.
                        <Input
                          id="vehicle-carrierId"
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
                      {...form.register('sideNumber')}
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
                    {/*
                      EURO norm restricted to V / VI — the DB `enum EuroNorm`
                      dropped III / IV (MAGTRANS no longer onboards trucks
                      below EURO V). Matches `EuroNormSchema` in @shared.
                    */}
                    <Select id="vehicle-euro" {...form.register('euro')}>
                      <option value="">—</option>
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
                </FormGrid>
              </FormSection>

              <FormSection title={t('sections.people')}>
                <FormGrid cols={2}>
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
                    label={t('fields.dispatchTeam')}
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
                    {/* Live preview of the picked team's composition — warns
                        (amber box) when the chosen team has no dispatchers
                        BEFORE saving (docs/14 §7.9.6). */}
                    {selectedTeam && (
                      <div className="mt-2">
                        <TeamMembers
                          team={selectedTeam}
                          variant="chips"
                          size="sm"
                        />
                      </div>
                    )}
                  </FormField>
                </FormGrid>
              </FormSection>

              <FormSection title={t('sections.equipment')}>
                {/* GPS-tracker device id — REQUIRED, unconditional. The legacy
                    «GPS» on/off checkbox is gone: every vehicle is tracked, so
                    the device id is always entered (no reveal toggle). */}
                <FormField
                  label={t('fields.gpsMobilePhone')}
                  required
                  error={errs.gpsMobilePhone?.message}
                  htmlFor="vehicle-gpsMobilePhone"
                >
                  <Input
                    id="vehicle-gpsMobilePhone"
                    {...form.register('gpsMobilePhone')}
                  />
                </FormField>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('fuelCard')} />
                    {t('fields.fuelCard')}
                  </label>
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('agreement')} />
                    {t('fields.agreement')}
                  </label>
                </div>
                {/* Umowa screenshot — UNCONDITIONALLY required on create
                    (server-enforced); shown for edit too so an operator can
                    replace the scan, but not newly blocked there. */}
                <FormItem className="mt-2">
                  <FormLabel htmlFor="vehicle-file-contract" required>
                    {tFile('fields.contract')}
                  </FormLabel>
                  <FileUpload
                    id="vehicle-file-contract"
                    value={fileBuckets.contract}
                    onChange={(items) => setBucket('contract', items)}
                    labels={fileLabels}
                  />
                  <FormDescription>
                    {tFile('fields.contractHint')}
                  </FormDescription>
                </FormItem>
              </FormSection>

              <FormSection title={t('sections.rates')}>
                <FormGrid cols={4}>
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
                      {...form.register('rateImport', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                </FormGrid>
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
                  <label className="flex items-center gap-2 text-text">
                    <Checkbox {...form.register('adr')} />
                    {t('fields.adr')}
                  </label>
                </div>
                {/* Per-kabotaż umowa screenshot — revealed under the matching
                    checkbox, required by the server when that flag is on. */}
                {cabotageDeOn && (
                  <FormItem className="ml-6 mt-2 animate-slide-in">
                    <FormLabel htmlFor="vehicle-file-cabotageDe" required>
                      {tFile('fields.cabotageDe')}
                    </FormLabel>
                    <FileUpload
                      id="vehicle-file-cabotageDe"
                      value={fileBuckets.cabotageDe}
                      onChange={(items) => setBucket('cabotageDe', items)}
                      labels={fileLabels}
                    />
                    <FormDescription>
                      {tFile('fields.cabotageHint')}
                    </FormDescription>
                  </FormItem>
                )}
                {cabotageFrOn && (
                  <FormItem className="ml-6 mt-2 animate-slide-in">
                    <FormLabel htmlFor="vehicle-file-cabotageFr" required>
                      {tFile('fields.cabotageFr')}
                    </FormLabel>
                    <FileUpload
                      id="vehicle-file-cabotageFr"
                      value={fileBuckets.cabotageFr}
                      onChange={(items) => setBucket('cabotageFr', items)}
                      labels={fileLabels}
                    />
                    <FormDescription>
                      {tFile('fields.cabotageHint')}
                    </FormDescription>
                  </FormItem>
                )}
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

              {/* Country access permits — see docs/19-known-quirks.md #3. These
                  are NOT ISO language codes; each flag means the vehicle holds
                  all the permits/paperwork needed to drive into that country
                  (GB = post-Brexit ECMT, IT = transit/weekend restrictions,
                  FR = Loi Macron / SIPSI). Plain boolean flags — no attachment
                  category, so no <FileUpload> reveal here (unlike kabotaż). */}
              <FormSection title={t('sections.specialCountries')}>
                <p className="text-xs text-text-sub">
                  {t('sections.specialCountriesHint')}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                  <label className="flex flex-col gap-0.5 text-text">
                    <span className="flex items-center gap-2">
                      <Checkbox {...form.register('gb')} />
                      {t('fields.gb')}
                    </span>
                    <span className="text-xs text-text-sub">
                      {t('sections.gbHint')}
                    </span>
                  </label>
                  <label className="flex flex-col gap-0.5 text-text">
                    <span className="flex items-center gap-2">
                      <Checkbox {...form.register('it')} />
                      {t('fields.it')}
                    </span>
                    <span className="text-xs text-text-sub">
                      {t('sections.itHint')}
                    </span>
                  </label>
                  <label className="flex flex-col gap-0.5 text-text">
                    <span className="flex items-center gap-2">
                      <Checkbox {...form.register('fr')} />
                      {t('fields.fr')}
                    </span>
                    <span className="text-xs text-text-sub">
                      {t('sections.frHint')}
                    </span>
                  </label>
                </div>
              </FormSection>
            </div>
          </SheetBody>

          <SheetFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
            {attachmentError && (
              <p
                className="mr-auto text-sm text-danger"
                role="alert"
              >
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
    carrierId: '' as unknown as string,
    plateNumber: '',
    active: true,
    plannerId: '' as unknown as string,
    // Phase 11 — dispatch TEAM (optional). Empty string is stripped by
    // `cleanForm`, so an unpicked team is omitted from the POST/PATCH body.
    dispatchTeamId: '' as unknown as string,
    notes: '',
    certificateL: false,
    // EURO norm — V / VI only since the DB enum dropped III / IV.
    euro: '' as unknown as 'V' | 'VI',
    fuelCard: false,
    type: '' as unknown as 'MEGA' | 'STD' | 'COIL',
    gb: false,
    it: false,
    fr: false,
    agreement: false,
    // `contract` boolean removed — the umowa is a VehicleAttachment now.
    rateDe: undefined as unknown as number,
    rateUe: undefined as unknown as number,
    rateExport: undefined as unknown as number,
    rateImport: undefined as unknown as number,
    wasteAllowed: false,
    cabotageDe: false,
    cabotageFr: false,
    adr: false,
    gpsMobilePhone: '',
    sideNumber: '',
  };
}

function cleanForm(values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    // Arrays are kept even when empty — the API treats `[]` as "clear" on
    // PATCH, and as an explicit empty set on POST.
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

/** Buckets a vehicle's server attachments into the three <FileUpload> slots. */
function attachmentsToBuckets(
  attachments: VehicleAttachmentDto[],
): FileBuckets {
  const buckets: FileBuckets = {
    contract: [],
    cabotageDe: [],
    cabotageFr: [],
  };
  for (const att of attachments) {
    const item: FileUploadItem = {
      kind: 'existing',
      id: att.id,
      fileName: att.fileName,
      size: att.size,
      mimeType: att.mimeType,
    };
    if (att.category === 'contract') buckets.contract.push(item);
    else if (att.category === 'cabotage_de') buckets.cabotageDe.push(item);
    else if (att.category === 'cabotage_fr') buckets.cabotageFr.push(item);
  }
  return buckets;
}

/** Extracts the freshly-picked `File` objects from each bucket. */
function collectNewFiles(buckets: FileBuckets): VehicleAttachmentUploads {
  const pick = (items: FileUploadItem[]): File[] =>
    items
      .filter(
        (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
          it.kind === 'new' && it.error === undefined,
      )
      .map((it) => it.file);
  return {
    contract: pick(buckets.contract),
    cabotageDe: pick(buckets.cabotageDe),
    cabotageFr: pick(buckets.cabotageFr),
  };
}

/**
 * Diffs the vehicle's original server attachments against the current
 * buckets — any existing attachment id no longer present was removed by the
 * operator and must be soft-deleted on PATCH.
 */
function collectRemovedIds(
  original: VehicleAttachmentDto[],
  buckets: FileBuckets,
): string[] {
  const stillPresent = new Set<string>();
  for (const key of ['contract', 'cabotageDe', 'cabotageFr'] as const) {
    for (const item of buckets[key]) {
      if (item.kind === 'existing') stillPresent.add(item.id);
    }
  }
  return original
    .map((a) => a.id)
    .filter((id) => !stillPresent.has(id));
}

/**
 * Client-side mirror of the server's required-attachment rule:
 *   create          ⇒ ≥1 contract (umowa) file — UNCONDITIONAL on create
 *   cabotageDe=true ⇒ ≥1 cabotage_de file
 *   cabotageFr=true ⇒ ≥1 cabotage_fr file
 * Counting existing (non-removed) + newly-added valid files. Returns the
 * categories that are still missing.
 *
 * The umowa scan is required ONLY on create (`isEdit === false`). On edit we
 * never newly-block the operator — they may keep the existing scan, replace
 * it, or (for legacy rows that predate the rule) save without one — mirroring
 * the server, which enforces the contract requirement at creation time only.
 */
function missingRequiredAttachments(
  values: FormValues,
  buckets: FileBuckets,
  isEdit: boolean,
): VehicleAttachmentCategory[] {
  const hasFiles = (items: FileUploadItem[]): boolean =>
    items.some(
      (it) => it.kind === 'existing' || it.error === undefined,
    );
  const missing: VehicleAttachmentCategory[] = [];
  if (!isEdit && !hasFiles(buckets.contract)) {
    missing.push(BUCKET_CATEGORY.contract);
  }
  if (values.cabotageDe === true && !hasFiles(buckets.cabotageDe)) {
    missing.push(BUCKET_CATEGORY.cabotageDe);
  }
  if (values.cabotageFr === true && !hasFiles(buckets.cabotageFr)) {
    missing.push(BUCKET_CATEGORY.cabotageFr);
  }
  return missing;
}

/**
 * Pulls the `violations` array from a 422 error. The API returns the
 * required-attachment failure as `{ violations: string[] }` (wrapped by the
 * RFC 7807 filter, so it may surface under `data` or `data.violations`).
 */
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
