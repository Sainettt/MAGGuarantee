'use client';

// Create / edit drawer for a driver.
//
// 2026-05-29 — the ADR certificate (świadectwo ADR) moved here from the
// vehicle. A boolean `adr` checkbox reveals a single <FileUpload> for the
// certificate scan; when `adr=true` the server requires ≥1 ADR attachment and
// we mirror that rule client-side. POST/PATCH are multipart/form-data — see
// lib/api/drivers.ts.
//
// FILE STATE NOTE: attachment files are deliberately NOT part of the RHF form
// (mirrors VehicleSheet). `CreateDriverSchema` is `.strict()`, and `File`
// objects are not JSON-serialisable (they'd break `useFormDraft`). They live in
// component `useState` instead; the submit handler hands them to the mutation
// as a separate `files` payload.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateDriverSchema,
  type CreateDriverDto,
  type DriverAttachmentDto,
  type DriverDto,
  type UpdateDriverDto,
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
import { EntityAlreadyExistsNotice } from '@/components/carrier-onboarding/EntityAlreadyExistsNotice';
import { TemporaryPasswordRow } from '@/components/carrier-onboarding/TemporaryPasswordRow';
import { WizardStepper } from '@/components/carrier-onboarding/WizardStepper';
import { FormDescription, FormField, FormItem, FormLabel } from '@/components/forms/Form';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useCreateDriver, useUpdateDriver } from '@/lib/hooks/useDrivers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';

const DRAFT_KEY = 'draft:drivers:new';

const EMPTY_DEFAULTS: CreateDriverDto = {
  // Empty string parks the carrier <Select> on its placeholder; Zod's
  // UuidSchema fails clearly on submit when the user hasn't picked one.
  carrierId: '' as unknown as string,
  firstName: '',
  lastName: '',
  phone: '',
  phone2: '',
  email: '',
  idDocumentNumber: '',
  // licenseExpiry is now NOT NULL (phase3_blocks). Empty string keeps the
  // <input type="date"> controlled; Zod's IsoDateSchema rejects "" on submit.
  licenseExpiry: '',
  notes: '',
  active: true,
  // ADR permit flag. When true an ADR certificate attachment is required —
  // enforced server-side and mirrored here (see missingAdrAttachment).
  adr: false,
};

interface Props {
  open: boolean;
  driver: DriverDto | null;
  onClose: () => void;
  /** Phase 3.2 — wizard mode. See CarrierSheet/VehicleSheet for semantics. */
  mode?: 'standalone' | 'wizard';
  wizardCarrierId?: string;
  /** Wizard mode only — display label for the locked carrier. See VehicleSheet. */
  wizardCarrierLabel?: string;
  wizardTempPassword?: string | null;
  onCompleted?: (created: DriverDto) => void;
  onSkip?: () => void;
  onExit?: () => void;
  wizardCurrentStep?: 1 | 2 | 3 | 4;
  wizardCompletedSteps?: number[];
  wizardSkippedSteps?: number[];
  /** Wizard mode only — see VehicleSheet for semantics. */
  wizardEntityAlreadyExists?: boolean;
}

type FormValues = CreateDriverDto;

export function DriverSheet({
  open,
  driver,
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
  const t = useTranslations('drivers');
  const tCommon = useTranslations('common');
  const tWizard = useTranslations();
  const tFile = useTranslations('fileUpload');
  const isEdit = driver !== null;
  const isWizard = mode === 'wizard';

  // Form state matches CreateDriverDto in both modes — edit mode keeps
  // `carrierId` in state for display only; the submit handler strips it
  // before calling PATCH. We always validate with CreateDriverSchema so the
  // now-required fields (email/licenseExpiry) are enforced on edit too.
  const form = useForm<FormValues>({
    resolver: zodResolver(CreateDriverSchema),
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  // ── ADR attachment file state ──────────────────────────────
  // Kept OUTSIDE the RHF form (see file-header note). One bucket for the ADR
  // certificate; in edit mode seeded from the driver's existing attachments.
  const [adrFiles, setAdrFiles] = useState<FileUploadItem[]>([]);
  // Cross-field attachment error (mirror of the server's required-attachment
  // 422). Surfaced inline above the footer; cleared on any file change.
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  // Up to 200 carriers in the picker — Phase 2 UAT-grade.
  const carriersQ = useCarriers({ limit: 200 });

  // Persist create-mode drafts to sessionStorage; wizard mode opts out (see
  // VehicleSheet for the same rationale). File buckets are NOT persisted —
  // `File` objects can't be JSON-serialised; the user re-attaches after a
  // draft restore.
  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit && !isWizard,
  });

  useEffect(() => {
    if (!open) return;
    setAttachmentError(null);
    if (isEdit && driver) {
      form.reset({
        carrierId: driver.carrierId,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone ?? '',
        phone2: driver.phone2 ?? '',
        email: driver.email ?? '',
        idDocumentNumber: driver.idDocumentNumber ?? '',
        licenseExpiry: driver.licenseExpiry ?? '',
        notes: driver.notes ?? '',
        active: driver.active,
        adr: driver.adr ?? false,
      });
      // Seed the ADR bucket from the driver's existing attachments.
      setAdrFiles(attachmentsToItems(driver.attachments ?? []));
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top
      // (skipped in wizard mode — see VehicleSheet).
      form.reset({
        ...EMPTY_DEFAULTS,
        ...(isWizard && wizardCarrierId
          ? { carrierId: wizardCarrierId }
          : {}),
      });
      setAdrFiles([]);
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, driver, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateDriver({
    onSuccess: (created) => {
      // Successful create — wipe the draft and reset to empty defaults.
      draft.clear();
      form.reset({ ...EMPTY_DEFAULTS });
      setAdrFiles([]);
      if (isWizard) {
        onCompleted?.(created);
        return;
      }
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (err) => handleSubmitError(err),
  });
  const updateM = useUpdateDriver({
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

  /** Updates the ADR bucket and clears the cross-field attachment error. */
  const setAdrBucket = useCallback((items: FileUploadItem[]) => {
    setAdrFiles(items);
    setAttachmentError(null);
  }, []);

  const onSubmit = form.handleSubmit(
    (values) => {
      // Client-side mirror of the server's required-attachment rule: when
      // adr=true there must be ≥1 ADR file (existing kept OR newly added).
      if (values.adr === true && !hasAdrFiles(adrFiles)) {
        setAttachmentError(tFile('required.adr'));
        return;
      }
      setAttachmentError(null);

      // Strip empty strings → undefined so optional fields don't trip Zod.
      // The `adr` boolean is kept even when false (the API needs the explicit
      // value, and `false` is not stripped by the empty-string rule).
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
      // Ensure the boolean is always present (false is a meaningful value).
      cleaned.adr = values.adr === true;

      const newFiles = collectNewFiles(adrFiles);

      if (isEdit && driver) {
        const { carrierId: _carrierId, ...rest } = cleaned;
        void _carrierId;
        const removeAttachmentIds = collectRemovedIds(
          driver.attachments ?? [],
          adrFiles,
        );
        const body: Record<string, unknown> = { ...rest };
        if (removeAttachmentIds.length > 0) {
          body.removeAttachmentIds = removeAttachmentIds;
        }
        updateM.mutate({
          id: driver.id,
          body: body as UpdateDriverDto,
          files: { adr: newFiles },
        });
      } else {
        createM.mutate({
          body: cleaned as CreateDriverDto,
          files: { adr: newFiles },
        });
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;
  // Watch the ADR toggle that reveals the conditional <FileUpload> block.
  const adrOn = form.watch('adr') === true;

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
      <SheetContent size={isWizard ? 'wide' : 'default'}>
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader className={isWizard && wizardTempPassword ? 'pb-0' : undefined}>
            <SheetTitle>
              {isWizard
                ? tWizard('wizard.header.title', { n: wizardCurrentStep ?? 4 })
                : isEdit
                  ? t('editDriver')
                  : t('newDriver')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && driver
                ? `${driver.firstName} ${driver.lastName}`
                : null}
            </SheetDescription>
            {isWizard && (
              <WizardStepper
                currentStep={wizardCurrentStep ?? 4}
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
                message={tWizard('wizard.entityAlreadyExists.driver')}
                dismissLabel={tCommon('clear')}
              />
            )}
            <div className="space-y-4">
              {!isEdit && (
                <FormField
                  label={t('fields.carrier')}
                  required
                  error={errs.carrierId?.message}
                  htmlFor="driver-carrierId"
                >
                  {isWizard ? (
                    // Wizard mode — read-only display fed by orchestrator.
                    // See VehicleSheet for the race rationale. Primitive Input
                    // already supplies `bg-input` + `h-10`.
                    <Input
                      id="driver-carrierId"
                      value={wizardCarrierLabel ?? ''}
                      readOnly
                      disabled
                      aria-readonly="true"
                    />
                  ) : (
                    <Select
                      id="driver-carrierId"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label={t('fields.firstName')}
                  required
                  error={errs.firstName?.message}
                  htmlFor="driver-firstName"
                >
                  <Input
                    id="driver-firstName"
                    {...form.register('firstName')}
                  />
                </FormField>
                <FormField
                  label={t('fields.lastName')}
                  required
                  error={errs.lastName?.message}
                  htmlFor="driver-lastName"
                >
                  <Input
                    id="driver-lastName"
                    {...form.register('lastName')}
                  />
                </FormField>
                <FormField
                  label={t('fields.phone')}
                  required
                  error={errs.phone?.message}
                  htmlFor="driver-phone"
                >
                  <Input
                    id="driver-phone"
                    {...form.register('phone')}
                  />
                </FormField>
                <FormField
                  label={t('fields.phone2')}
                  error={errs.phone2?.message}
                  htmlFor="driver-phone2"
                >
                  <Input
                    id="driver-phone2"
                    {...form.register('phone2')}
                  />
                </FormField>
                <FormField
                  label={t('fields.email')}
                  error={errs.email?.message}
                  htmlFor="driver-email"
                >
                  <Input
                    id="driver-email"
                    type="email"
                    {...form.register('email')}
                  />
                </FormField>
                <FormField
                  label={t('fields.idDocumentNumber')}
                  required
                  error={errs.idDocumentNumber?.message}
                  htmlFor="driver-license"
                >
                  <Input
                    id="driver-license"
                    {...form.register('idDocumentNumber')}
                  />
                </FormField>
                <FormField
                  label={t('fields.licenseExpiry')}
                  required
                  error={errs.licenseExpiry?.message}
                  htmlFor="driver-licenseExpiry"
                >
                  <Input
                    id="driver-licenseExpiry"
                    type="date"
                    {...form.register('licenseExpiry')}
                  />
                </FormField>
              </div>

              <FormField
                label={t('fields.notes')}
                error={errs.notes?.message}
                htmlFor="driver-notes"
              >
                <Textarea
                  id="driver-notes"
                  rows={3}
                  {...form.register('notes')}
                />
              </FormField>

              {/* ADR permit — checkbox reveals the certificate <FileUpload>,
                  which is required by the server when the flag is on. */}
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('adr')} />
                {t('fields.adr')}
              </label>
              {adrOn && (
                <FormItem className="ml-6 mt-2 animate-slide-in">
                  <FormLabel htmlFor="driver-file-adr" required>
                    {tFile('fields.adr')}
                  </FormLabel>
                  <FileUpload
                    id="driver-file-adr"
                    value={adrFiles}
                    onChange={setAdrBucket}
                    labels={fileLabels}
                    multiple={false}
                  />
                  <FormDescription>{tFile('fields.adrHint')}</FormDescription>
                </FormItem>
              )}

              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('active')} />
                {t('fields.active')}
              </label>
            </div>
          </SheetBody>

          <SheetFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
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
                      form.reset({ ...EMPTY_DEFAULTS });
                      setAdrFiles([]);
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

// ─── Attachment helpers ──────────────────────────────────

/** Maps a driver's server ADR attachments into <FileUpload> existing items. */
function attachmentsToItems(
  attachments: DriverAttachmentDto[],
): FileUploadItem[] {
  return attachments
    .filter((att) => att.category === 'adr')
    .map((att) => ({
      kind: 'existing' as const,
      id: att.id,
      fileName: att.fileName,
      size: att.size,
      mimeType: att.mimeType,
    }));
}

/** Extracts the freshly-picked `File` objects from the ADR bucket. */
function collectNewFiles(items: FileUploadItem[]): File[] {
  return items
    .filter(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    )
    .map((it) => it.file);
}

/**
 * Diffs the driver's original server attachments against the current bucket —
 * any existing attachment id no longer present was removed by the operator and
 * must be soft-deleted on PATCH.
 */
function collectRemovedIds(
  original: DriverAttachmentDto[],
  items: FileUploadItem[],
): string[] {
  const stillPresent = new Set<string>();
  for (const item of items) {
    if (item.kind === 'existing') stillPresent.add(item.id);
  }
  return original.map((a) => a.id).filter((id) => !stillPresent.has(id));
}

/** True when the ADR bucket holds ≥1 existing or newly-added valid file. */
function hasAdrFiles(items: FileUploadItem[]): boolean {
  return items.some(
    (it) => it.kind === 'existing' || it.error === undefined,
  );
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
