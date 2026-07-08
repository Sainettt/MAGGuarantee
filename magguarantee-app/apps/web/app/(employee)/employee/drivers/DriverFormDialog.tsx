'use client';

// Create / edit dialog for a driver — centered <FormDialog> (docs/14 §13.1,
// §13.5). Replaces the legacy right-side DriverSheet. Sections top-to-bottom:
// Dane osobowe · Kontakt · Narodowość i języki · ADR · Notatki.
//
// The phone-prefix selector is INDEPENDENT of Narodowość (§13.5): it drives the
// <MaskedPhoneInput> `country` format hints only; the ADR checkbox reveals a
// classes multi-select (min. 1) + a compact required świadectwo upload.
//
// POST/PATCH are multipart/form-data (the ADR świadectwo is a scanned file).
// Files live in component `useState`, handed to the mutation separately.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateDriverSchema,
  DriverLanguageSchema,
  DriverNationalitySchema,
  AdrClassSchema,
  type CreateDriverDto,
  type DriverAttachmentDto,
  type DriverDto,
  type EuVatCountryCode,
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
import { MultiSelect } from '@/components/ui/MultiSelect';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { EntityAlreadyExistsNotice } from '@/components/carrier-onboarding/EntityAlreadyExistsNotice';
import { TemporaryPasswordRow } from '@/components/carrier-onboarding/TemporaryPasswordRow';
import { WizardStepper } from '@/components/carrier-onboarding/WizardStepper';
import { CountrySelect } from '@/components/forms/CountrySelect';
import {
  FormDescription,
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
import { MaskedPhoneInput } from '@/components/forms/MaskedPhoneInput';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useCarriers } from '@/lib/hooks/useCarriers';
import { useCreateDriver, useUpdateDriver } from '@/lib/hooks/useDrivers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';

const DRAFT_KEY = 'draft:drivers:new';

const EMPTY_DEFAULTS: CreateDriverDto = {
  carrierId: '' as unknown as string,
  firstName: '',
  lastName: '',
  phone: '',
  phone2: '',
  email: '',
  idDocumentNumber: '',
  licenseExpiry: '',
  notes: '',
  active: true,
  // Enum sentinel — empty string trips DriverNationalitySchema on submit.
  nationality: '' as unknown as CreateDriverDto['nationality'],
  languages: [],
  adr: false,
  adrClasses: [],
};

interface Props {
  open: boolean;
  driver: DriverDto | null;
  onClose: () => void;
  mode?: 'standalone' | 'wizard';
  wizardCarrierId?: string;
  wizardCarrierLabel?: string;
  wizardTempPassword?: string | null;
  onCompleted?: (created: DriverDto) => void;
  onSkip?: () => void;
  onExit?: () => void;
  wizardCurrentStep?: 1 | 2 | 3 | 4;
  wizardCompletedSteps?: number[];
  wizardSkippedSteps?: number[];
  wizardEntityAlreadyExists?: boolean;
}

type FormValues = CreateDriverDto;

export function DriverFormDialog({
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
  const tMulti = useTranslations('multiSelect');
  const tCountry = useTranslations('forms.country');
  const isEdit = driver !== null;
  const isWizard = mode === 'wizard';

  const form = useForm<FormValues>({
    resolver: zodResolver(CreateDriverSchema) as never,
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  const [adrFiles, setAdrFiles] = useState<FileUploadItem[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [adrInvalid, setAdrInvalid] = useState(false);

  // Phone-prefix — UI-only, INDEPENDENT of Narodowość (§13.5). Drives the
  // <MaskedPhoneInput> format hints only; never persisted, never submitted.
  const [phonePrefix, setPhonePrefix] = useState<EuVatCountryCode | ''>('');

  const carriersQ = useCarriers({ limit: 200 });

  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit && !isWizard,
  });

  useEffect(() => {
    if (!open) return;
    setAttachmentError(null);
    setAdrInvalid(false);
    setPhonePrefix('');
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
        nationality: driver.nationality,
        languages: driver.languages ?? [],
        adr: driver.adr ?? false,
        adrClasses: driver.adrClasses ?? [],
      });
      setAdrFiles(attachmentsToItems(driver.attachments ?? []));
    } else {
      form.reset({
        ...EMPTY_DEFAULTS,
        ...(isWizard && wizardCarrierId ? { carrierId: wizardCarrierId } : {}),
      });
      setAdrFiles([]);
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, driver, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateDriver({
    onSuccess: (created) => {
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

  function handleSubmitError(err: unknown) {
    const violations = extractViolations(err);
    if (violations.length > 0) {
      setAttachmentError(violations.join(' · '));
      return;
    }
    toast.error(tCommon('errorGeneric'));
  }

  const setAdrBucket = useCallback((items: FileUploadItem[]) => {
    setAdrFiles(items);
    setAttachmentError(null);
    setAdrInvalid(false);
  }, []);

  const onSubmit = form.handleSubmit(
    (values) => {
      if (values.adr === true && !hasFiles(adrFiles)) {
        setAdrInvalid(true);
        setAttachmentError(tFile('required.adr'));
        return;
      }
      setAttachmentError(null);
      setAdrInvalid(false);

      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (Array.isArray(v)) {
          cleaned[k] = v;
          continue;
        }
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
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
  const adrOn = form.watch('adr') === true;

  useEffect(() => {
    if (!adrOn) form.setValue('adrClasses', []);
  }, [adrOn, form]);

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

  const langOptions = useMemo(
    () =>
      DriverLanguageSchema.options.map((l) => ({
        value: l,
        label: t(`languageOptions.${l}`),
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
              ? tWizard('wizard.header.title', { n: wizardCurrentStep ?? 4 })
              : isEdit
                ? t('editDriver')
                : t('newDriver')}
          </FormDialogTitle>
          <FormDialogDescription>
            {isEdit && driver ? `${driver.firstName} ${driver.lastName}` : null}
          </FormDialogDescription>
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
        </FormDialogHeader>

        <FormDialogBody>
          {isWizard && wizardEntityAlreadyExists && (
            <EntityAlreadyExistsNotice
              message={tWizard('wizard.entityAlreadyExists.driver')}
              dismissLabel={tCommon('clear')}
            />
          )}
          <div className="space-y-6">
            {/* ── Dane osobowe ── */}
            <FormSection title={t('sections.personalData')}>
              {!isEdit && (
                <FormField
                  label={t('fields.carrier')}
                  required
                  error={errs.carrierId?.message}
                  htmlFor="driver-carrierId"
                  className="md:col-span-2"
                >
                  {isWizard ? (
                    <Input
                      id="driver-carrierId"
                      value={wizardCarrierLabel ?? ''}
                      readOnly
                      disabled
                      aria-readonly="true"
                    />
                  ) : (
                    <Select id="driver-carrierId" {...form.register('carrierId')}>
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
                  label={t('fields.firstName')}
                  required
                  error={errs.firstName?.message}
                  htmlFor="driver-firstName"
                >
                  <Input id="driver-firstName" {...form.register('firstName')} />
                </FormField>
                <FormField
                  label={t('fields.lastName')}
                  required
                  error={errs.lastName?.message}
                  htmlFor="driver-lastName"
                >
                  <Input id="driver-lastName" {...form.register('lastName')} />
                </FormField>
                <FormField
                  label={t('fields.idDocumentNumber')}
                  required
                  error={errs.idDocumentNumber?.message}
                  htmlFor="driver-idDocumentNumber"
                >
                  <Input
                    id="driver-idDocumentNumber"
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
              </FormGrid>
            </FormSection>

            {/* ── Kontakt ── (phone prefix independent of Narodowość) */}
            <FormSection title={t('sections.contact')}>
              <FormGrid cols={2}>
                <FormField
                  label={t('phonePrefixLabel')}
                  description={tCountry('driverDescription')}
                  htmlFor="driver-phonePrefix"
                  className="md:col-span-2"
                >
                  <CountrySelect
                    id="driver-phonePrefix"
                    value={phonePrefix}
                    onChange={(e) =>
                      setPhonePrefix(e.target.value as EuVatCountryCode | '')
                    }
                  />
                </FormField>
                <FormField
                  label={t('fields.phone')}
                  required
                  error={errs.phone?.message}
                  htmlFor="driver-phone"
                >
                  <Controller
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <MaskedPhoneInput
                        id="driver-phone"
                        country={phonePrefix}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
                  />
                </FormField>
                <FormField
                  label={t('fields.phone2')}
                  error={errs.phone2?.message}
                  htmlFor="driver-phone2"
                >
                  <Controller
                    control={form.control}
                    name="phone2"
                    render={({ field }) => (
                      <MaskedPhoneInput
                        id="driver-phone2"
                        country={phonePrefix}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        ref={field.ref}
                      />
                    )}
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
              </FormGrid>
            </FormSection>

            {/* ── Narodowość i języki ── */}
            <FormSection title={t('sections.nationalityLangs')}>
              <FormGrid cols={2}>
                <FormField
                  label={t('fields.nationality')}
                  required
                  error={errs.nationality?.message}
                  htmlFor="driver-nationality"
                >
                  <Select id="driver-nationality" {...form.register('nationality')}>
                    <option value="">—</option>
                    {DriverNationalitySchema.options.map((n) => (
                      <option key={n} value={n}>
                        {t(`nationalityOptions.${n}`)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField
                  label={t('fields.languages')}
                  required
                  error={errs.languages?.message}
                  htmlFor="driver-languages"
                >
                  <Controller
                    control={form.control}
                    name="languages"
                    render={({ field }) => (
                      <MultiSelect
                        id="driver-languages"
                        options={langOptions}
                        value={field.value ?? []}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        sort={false}
                        placeholder={tMulti('langPlaceholder')}
                        searchPlaceholder={tMulti('searchPlaceholder')}
                        emptyText={tMulti('noResults')}
                        removeAriaLabel={(l) => tMulti('removeAria', { name: l })}
                      />
                    )}
                  />
                </FormField>
              </FormGrid>
            </FormSection>

            {/* ── ADR ── */}
            <FormSection title={t('sections.adr')}>
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('adr')} />
                {t('fields.adr')}
              </label>
              {adrOn && (
                <RevealInset>
                  <FormItem>
                    <FormLabel htmlFor="driver-adrClasses" required>
                      {t('fields.adrClasses')}
                    </FormLabel>
                    <Controller
                      control={form.control}
                      name="adrClasses"
                      render={({ field }) => (
                        <MultiSelect
                          id="driver-adrClasses"
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
                  <FormItem>
                    <FormLabel htmlFor="driver-file-adr" required>
                      {tFile('fields.adr')}
                    </FormLabel>
                    <FileUpload
                      id="driver-file-adr"
                      variant="compact"
                      multiple={false}
                      value={adrFiles}
                      onChange={setAdrBucket}
                      labels={fileLabels}
                      invalid={adrInvalid}
                    />
                    {adrInvalid ? (
                      <FormMessage>{tFile('required.adr')}</FormMessage>
                    ) : (
                      <FormDescription>{tFile('fields.adrHint')}</FormDescription>
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
                htmlFor="driver-notes"
                className="md:col-span-2"
              >
                <Textarea id="driver-notes" rows={3} {...form.register('notes')} />
              </FormField>
              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('active')} />
                {t('fields.active')}
              </label>
            </FormSection>
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
                    form.reset({ ...EMPTY_DEFAULTS });
                    setAdrFiles([]);
                    setAttachmentError(null);
                    setAdrInvalid(false);
                    setPhonePrefix('');
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

// ─── Attachment helpers ──────────────────────────────────

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

function collectNewFiles(items: FileUploadItem[]): File[] {
  return items
    .filter(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    )
    .map((it) => it.file);
}

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
