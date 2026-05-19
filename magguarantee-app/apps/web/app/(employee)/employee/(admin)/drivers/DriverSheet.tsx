'use client';

// Create / edit drawer for a driver.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateDriverSchema,
  type CreateDriverDto,
  type DriverDto,
  type UpdateDriverDto,
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
import { FormField } from '@/components/forms/Form';
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
  driverLicenseNumber: '',
  // licenseExpiry is now NOT NULL (phase3_blocks). Empty string keeps the
  // <input type="date"> controlled; Zod's IsoDateSchema rejects "" on submit.
  licenseExpiry: '',
  bankAccount: '',
  notes: '',
  active: true,
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
  const isEdit = driver !== null;
  const isWizard = mode === 'wizard';

  // Form state matches CreateDriverDto in both modes — edit mode keeps
  // `carrierId` in state for display only; the submit handler strips it
  // before calling PATCH. We always validate with CreateDriverSchema so the
  // now-required fields (email/licenseExpiry/bankAccount) are enforced on
  // edit too.
  const form = useForm<FormValues>({
    resolver: zodResolver(CreateDriverSchema),
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  // Up to 200 carriers in the picker — Phase 2 UAT-grade.
  const carriersQ = useCarriers({ limit: 200 });

  // Persist create-mode drafts to sessionStorage; wizard mode opts out (see
  // VehicleSheet for the same rationale).
  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: !isEdit && !isWizard,
  });

  useEffect(() => {
    if (!open) return;
    if (isEdit && driver) {
      form.reset({
        carrierId: driver.carrierId,
        firstName: driver.firstName,
        lastName: driver.lastName,
        phone: driver.phone ?? '',
        phone2: driver.phone2 ?? '',
        email: driver.email ?? '',
        driverLicenseNumber: driver.driverLicenseNumber ?? '',
        licenseExpiry: driver.licenseExpiry ?? '',
        bankAccount: driver.bankAccount ?? '',
        notes: driver.notes ?? '',
        active: driver.active,
      });
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top
      // (skipped in wizard mode — see VehicleSheet).
      form.reset({
        ...EMPTY_DEFAULTS,
        ...(isWizard && wizardCarrierId
          ? { carrierId: wizardCarrierId }
          : {}),
      });
      if (!isWizard) draft.hydrate();
    }
  }, [open, isEdit, driver, form, draft, isWizard, wizardCarrierId]);

  const createM = useCreateDriver({
    onSuccess: (created) => {
      // Successful create — wipe the draft and reset to empty defaults.
      draft.clear();
      form.reset({ ...EMPTY_DEFAULTS });
      if (isWizard) {
        onCompleted?.(created);
        return;
      }
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const updateM = useUpdateDriver({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      // Strip empty strings → undefined so optional fields don't trip Zod.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
      if (isEdit && driver) {
        const { carrierId: _carrierId, ...rest } = cleaned;
        void _carrierId;
        updateM.mutate({ id: driver.id, body: rest as UpdateDriverDto });
      } else {
        createM.mutate(cleaned as CreateDriverDto);
      }
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

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
                    // See VehicleSheet for the race rationale.
                    <Input
                      id="driver-carrierId"
                      className="h-10 bg-input"
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
                    className="h-10"
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
                    className="h-10"
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
                    className="h-10"
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
                    className="h-10"
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
                    className="h-10"
                    {...form.register('email')}
                  />
                </FormField>
                <FormField
                  label={t('fields.driverLicenseNumber')}
                  required
                  error={errs.driverLicenseNumber?.message}
                  htmlFor="driver-license"
                >
                  <Input
                    id="driver-license"
                    className="h-10"
                    {...form.register('driverLicenseNumber')}
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
                    className="h-10"
                    {...form.register('licenseExpiry')}
                  />
                </FormField>
                <FormField
                  label={t('fields.bankAccount')}
                  error={errs.bankAccount?.message}
                  htmlFor="driver-bankAccount"
                >
                  <Input
                    id="driver-bankAccount"
                    className="h-10"
                    {...form.register('bankAccount')}
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

              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('active')} />
                {t('fields.active')}
              </label>
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
              </>
            )}
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
