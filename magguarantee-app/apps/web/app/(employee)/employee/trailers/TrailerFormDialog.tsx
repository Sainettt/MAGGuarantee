'use client';

// Create / edit dialog for a trailer — centered <FormDialog> (docs/14 §13.1,
// §13.4). Replaces the legacy right-side TrailerSheet. Sections top-to-bottom:
// Dane podstawowe · Dach · Wyposażenie · Certyfikat XL · Notatki.
//
// Conditional sub-blocks use <RevealInset>; the XL-cert upload is the compact
// <FileUpload variant="compact"> (PDF only). Belts / mats / beams reveal a
// count input inside a RevealInset (min. 3, enforced by trailerCountsRefine);
// the sliding-roof checkbox reveals the Edscha flag. `airSuspension` was removed.
//
// Trailer create/edit is `multipart/form-data` now (the XL cert is a scanned
// file). Files live in component `useState`, handed to the mutation separately.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateTrailerSchema,
  UpdateTrailerObjectSchema,
  trailerCountsRefine,
  type CreateTrailerDto,
  type TrailerAttachmentDto,
  type TrailerDto,
  type UpdateTrailerDto,
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
import { Textarea } from '@/components/ui/Textarea';
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
import { useTrailerTypes } from '@/lib/hooks/useTrailerTypes';
import { useCreateTrailer, useUpdateTrailer } from '@/lib/hooks/useTrailers';

const DRAFT_KEY = 'draft:trailers:new';

const PDF_ACCEPT = ['application/pdf'] as const;

interface Props {
  open: boolean;
  trailer: TrailerDto | null;
  onClose: () => void;
  mode?: 'standalone' | 'wizard';
  wizardCarrierId?: string;
  wizardCarrierLabel?: string;
  wizardTempPassword?: string | null;
  onCompleted?: (created: TrailerDto) => void;
  onSkip?: () => void;
  onExit?: () => void;
  wizardCurrentStep?: 1 | 2 | 3 | 4;
  wizardCompletedSteps?: number[];
  wizardSkippedSteps?: number[];
  wizardEntityAlreadyExists?: boolean;
}

type FormValues = CreateTrailerDto;

const NUMERIC_FIELDS = [
  'innerLength',
  'innerWidth',
  'innerHeight',
  'capacity',
  'sideClearanceCm',
  'beltsCount',
  'matsCount',
  'beamsCount',
] as const;

export function TrailerFormDialog({
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
  const tFile = useTranslations('fileUpload');
  const isEdit = trailer !== null;
  const isWizard = mode === 'wizard';

  const form = useForm<FormValues>({
    resolver: zodResolver(
      isEdit
        ? UpdateTrailerObjectSchema.passthrough().superRefine(trailerCountsRefine)
        : CreateTrailerSchema,
    ) as never,
    defaultValues: getDefaults(),
  });

  const [certXlFiles, setCertXlFiles] = useState<FileUploadItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [certXlInvalid, setCertXlInvalid] = useState(false);

  const carriersQ = useCarriers({ limit: 200 });
  const typesQ = useTrailerTypes({ active: true });

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
    setCertXlInvalid(false);
    if (isEdit && trailer) {
      form.reset({
        carrierId: trailer.carrierId,
        plateNumber: trailer.plateNumber,
        active: trailer.active,
        trailerTypeId: trailer.trailerTypeId ?? undefined,
        sideClearanceCm: trailer.sideClearanceCm ?? (undefined as unknown as number),
        belts: trailer.belts ?? false,
        beltsCount: trailer.beltsCount ?? undefined,
        mats: trailer.mats ?? false,
        matsCount: trailer.matsCount ?? undefined,
        beams: trailer.beams ?? false,
        beamsCount: trailer.beamsCount ?? undefined,
        innerLength: trailer.innerLength ?? undefined,
        innerWidth: trailer.innerWidth ?? undefined,
        innerHeight: trailer.innerHeight ?? undefined,
        capacity: trailer.capacity ?? undefined,
        liftingRoof: trailer.liftingRoof ?? false,
        slidingRoof: trailer.slidingRoof ?? false,
        edscha: trailer.edscha ?? false,
        palletBox: trailer.palletBox ?? false,
        certXl: trailer.certXl ?? false,
        multilock: trailer.multilock ?? false,
        notes: trailer.notes ?? '',
      });
      setCertXlFiles(attachmentsToItems(trailer.attachments ?? []));
    } else {
      form.reset({
        ...getDefaults(),
        ...(isWizard && wizardCarrierId ? { carrierId: wizardCarrierId } : {}),
      });
      setCertXlFiles([]);
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, trailer, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateTrailer({
    onSuccess: (created) => {
      draft.clear();
      form.reset(getDefaults());
      setCertXlFiles([]);
      if (isWizard) {
        onCompleted?.(created);
        return;
      }
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (err) => handleSubmitError(err),
  });
  const updateM = useUpdateTrailer({
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

  const setCertXlBucket = useCallback((items: FileUploadItem[]) => {
    setCertXlFiles(items);
    setAttachmentError(null);
    setCertXlInvalid(false);
  }, []);

  const onSubmit = form.handleSubmit(
    (values) => {
      // XL cert required when certXl=true (server-enforced; mirrored here).
      if (values.certXl === true && !hasFiles(certXlFiles)) {
        setCertXlInvalid(true);
        setAttachmentError(tFile('required.cert_xl'));
        return;
      }
      setAttachmentError(null);
      setCertXlInvalid(false);

      const cleaned = cleanForm(values);
      const newFiles = collectNewFiles(certXlFiles);

      if (isEdit && trailer) {
        const { carrierId: _carrierId, ...rest } = cleaned;
        void _carrierId;
        const removeAttachmentIds = collectRemovedIds(
          trailer.attachments ?? [],
          certXlFiles,
        );
        const body: Record<string, unknown> = { ...rest };
        if (removeAttachmentIds.length > 0) {
          body.removeAttachmentIds = removeAttachmentIds;
        }
        updateM.mutate({
          id: trailer.id,
          body: body as UpdateTrailerDto,
          files: { certXl: newFiles },
        });
      } else {
        createM.mutate({
          body: cleaned as CreateTrailerDto,
          files: { certXl: newFiles },
        });
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  const beltsOn = form.watch('belts') === true;
  const matsOn = form.watch('mats') === true;
  const beamsOn = form.watch('beams') === true;
  const slidingRoofOn = form.watch('slidingRoof') === true;
  const certXlOn = form.watch('certXl') === true;
  const activeOn = form.watch('active') === true;

  useEffect(() => {
    if (!beltsOn) form.setValue('beltsCount', undefined);
  }, [beltsOn, form]);
  useEffect(() => {
    if (!matsOn) form.setValue('matsCount', undefined);
  }, [matsOn, form]);
  useEffect(() => {
    if (!beamsOn) form.setValue('beamsCount', undefined);
  }, [beamsOn, form]);

  const fileLabels = useMemo<FileUploadLabels>(
    () => ({
      prompt: tFile('prompt'),
      promptCompact: tFile('promptCompact'),
      constraints: tFile('constraintsPdf'),
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

  const handleClose = () => {
    if (isWizard) onExit?.();
    else onClose();
  };

  const countField = (
    key: 'beltsCount' | 'matsCount' | 'beamsCount',
    id: string,
  ) => (
    <RevealInset>
      <FormItem>
        <FormLabel htmlFor={id} required>
          {t(`fields.${key}`)}
        </FormLabel>
        <div className="flex items-center gap-2">
          <Input
            id={id}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            aria-invalid={!!errs[key]}
            className="w-24 tabular-nums"
            {...form.register(key, {
              setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)),
            })}
          />
          <span className="text-xs text-text-sub">{tCommon('pcsShort')}</span>
        </div>
        {errs[key]?.message && (
          <FormMessage>{errs[key]?.message as string}</FormMessage>
        )}
      </FormItem>
    </RevealInset>
  );

  return (
    <FormDialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <FormDialogHeader>
          <FormDialogTitle>
            {isWizard
              ? tWizard('wizard.header.title', { n: wizardCurrentStep ?? 3 })
              : isEdit
                ? t('editTrailer')
                : t('newTrailer')}
          </FormDialogTitle>
          <FormDialogDescription>
            {isEdit && trailer ? (
              <span className="font-mono">{trailer.plateNumber}</span>
            ) : null}
          </FormDialogDescription>
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
        </FormDialogHeader>

        <FormDialogBody>
          {isWizard && wizardEntityAlreadyExists && (
            <EntityAlreadyExistsNotice
              message={tWizard('wizard.entityAlreadyExists.trailer')}
              dismissLabel={tCommon('clear')}
            />
          )}
          <div className="space-y-6">
            {/* ── Dane podstawowe ── */}
            <FormSection title={t('sections.basic')}>
              <FormGrid cols={2}>
                {!isEdit && (
                  <FormField
                    label={t('fields.carrier')}
                    required
                    error={errs.carrierId?.message}
                    htmlFor="trailer-carrierId"
                  >
                    {isWizard ? (
                      <Input
                        id="trailer-carrierId"
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
                  <Input id="trailer-plateNumber" {...form.register('plateNumber')} />
                </FormField>
                <FormField
                  label={t('fields.trailerType')}
                  required
                  error={errs.trailerTypeId?.message}
                  htmlFor="trailer-typeId"
                >
                  <Select id="trailer-typeId" {...form.register('trailerTypeId')}>
                    <option value="">—</option>
                    {(typesQ.data ?? []).map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.shortCode ? `[${tt.shortCode}] ` : ''}
                        {tt.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </FormGrid>
              <FormGrid cols={4}>
                {(
                  ['innerLength', 'innerWidth', 'innerHeight', 'capacity'] as const
                ).map((key) => (
                  <FormField
                    key={key}
                    label={t(`fields.${key}`)}
                    error={errs[key]?.message}
                    htmlFor={`trailer-${key}`}
                  >
                    <Input
                      id={`trailer-${key}`}
                      type="number"
                      step="0.01"
                      {...form.register(key, {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                ))}
                <FormField
                  label={t('fields.sideClearanceCm')}
                  required
                  error={errs.sideClearanceCm?.message}
                  htmlFor="trailer-sideClearanceCm"
                >
                  <Input
                    id="trailer-sideClearanceCm"
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    {...form.register('sideClearanceCm', {
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                  />
                </FormField>
              </FormGrid>
            </FormSection>

            {/* ── Dach ── */}
            <FormSection title={t('sections.roof')}>
              <FormGrid cols={2}>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('liftingRoof')} />
                  {t('fields.liftingRoof')}
                </label>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('slidingRoof')} />
                  {t('fields.slidingRoof')}
                </label>
              </FormGrid>
              {slidingRoofOn && (
                <RevealInset>
                  <label className="flex items-center gap-2 text-sm text-text">
                    <Checkbox {...form.register('edscha')} />
                    {t('fields.edscha')}
                  </label>
                  {errs.edscha?.message && (
                    <FormMessage>{errs.edscha.message as string}</FormMessage>
                  )}
                </RevealInset>
              )}
            </FormSection>

            {/* ── Wyposażenie ── */}
            <FormSection title={t('sections.equipment')}>
              <FormGrid cols={2}>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('palletBox')} />
                  {t('fields.palletBox')}
                </label>
                <label className="flex items-center gap-2 text-sm text-text">
                  <Checkbox {...form.register('multilock')} />
                  {t('fields.multilock')}
                </label>
                <div>
                  <label className="flex items-center gap-2 text-sm text-text">
                    <Checkbox {...form.register('belts')} />
                    {t('fields.belts')}
                  </label>
                  {beltsOn && countField('beltsCount', 'trailer-beltsCount')}
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-text">
                    <Checkbox {...form.register('mats')} />
                    {t('fields.mats')}
                  </label>
                  {matsOn && countField('matsCount', 'trailer-matsCount')}
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm text-text">
                    <Checkbox {...form.register('beams')} />
                    {t('fields.beams')}
                  </label>
                  {beamsOn && countField('beamsCount', 'trailer-beamsCount')}
                </div>
              </FormGrid>
            </FormSection>

            {/* ── Certyfikat XL ── */}
            <FormSection title={t('sections.certXl')}>
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('certXl')} />
                {t('fields.certXl')}
              </label>
              {certXlOn && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="trailer-file-certXl" required>
                      {tFile('fields.certXl')}
                    </FormLabel>
                    <FileUpload
                      id="trailer-file-certXl"
                      variant="compact"
                      multiple={false}
                      accept={PDF_ACCEPT}
                      value={certXlFiles}
                      onChange={setCertXlBucket}
                      labels={fileLabels}
                      invalid={certXlInvalid}
                    />
                    {certXlInvalid && (
                      <FormMessage>{tFile('required.cert_xl')}</FormMessage>
                    )}
                  </FormItem>
                </RevealInset>
              )}
            </FormSection>

            {/* ── Notatki ── */}
            <FormSection title={t('sections.notesSection')}>
              <FormField
                label={t('fields.notes')}
                error={errs.notes?.message}
                htmlFor="trailer-notes"
                className="md:col-span-2"
              >
                <Textarea id="trailer-notes" rows={3} {...form.register('notes')} />
              </FormField>
            </FormSection>

            {/* ── Aktywny — distinguished status row, body bottom (§13.2.4) ── */}
            <ActiveStatusRow
              label={t('fields.active')}
              consequence={tWizard('formActive.trailerConsequence')}
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
                    setCertXlFiles([]);
                    setAttachmentError(null);
                    setCertXlInvalid(false);
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
    carrierId: undefined as unknown as string,
    plateNumber: '',
    active: true,
    trailerTypeId: '' as unknown as string,
    sideClearanceCm: undefined as unknown as number,
    belts: false,
    beltsCount: undefined,
    mats: false,
    matsCount: undefined,
    beams: false,
    beamsCount: undefined,
    innerLength: undefined,
    innerWidth: undefined,
    innerHeight: undefined,
    capacity: undefined,
    liftingRoof: false,
    slidingRoof: false,
    edscha: false,
    palletBox: false,
    certXl: false,
    multilock: false,
    notes: '',
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

// ─── Attachment helpers ──────────────────────────────────

function attachmentsToItems(
  attachments: TrailerAttachmentDto[],
): FileUploadItem[] {
  return attachments
    .filter((att) => att.category === 'cert_xl')
    .map((att) => ({
      kind: 'existing' as const,
      id: att.id,
      fileName: att.fileName,
      size: att.size,
      mimeType: att.mimeType,
    }));
}

function collectNewFiles(items: FileUploadItem[]): File[] {
  return items
    .filter(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    )
    .map((it) => it.file);
}

function collectRemovedIds(
  original: TrailerAttachmentDto[],
  items: FileUploadItem[],
): string[] {
  const stillPresent = new Set<string>();
  for (const item of items) {
    if (item.kind === 'existing') stillPresent.add(item.id);
  }
  return original.map((a) => a.id).filter((id) => !stillPresent.has(id));
}

function hasFiles(items: FileUploadItem[]): boolean {
  return items.some((it) => it.kind === 'existing' || it.error === undefined);
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
