'use client';

// Phase 3 — carrier-side driver create/edit sheet. Mirrors the employee
// version but auto-injects `carrierId` (no carrier picker — przewoznik can
// only manage their own drivers).

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
import { FormField } from '@/components/forms/Form';
import { useCreateDriver, useUpdateDriver } from '@/lib/hooks/useDrivers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';

const DRAFT_KEY = 'draft:carrier:drivers:new';

const EMPTY_DEFAULTS: CreateDriverDto = {
  // Carrier scope: carrierId is filled from session in onSubmit; the form
  // defaults it to '' so RHF stays controlled.
  carrierId: '' as unknown as string,
  firstName: '',
  lastName: '',
  phone: '',
  phone2: '',
  email: '',
  driverLicenseNumber: '',
  // licenseExpiry is now NOT NULL (phase3_blocks). Empty string keeps the
  // <input type="date"> controlled; Zod IsoDateSchema fails on submit.
  licenseExpiry: '',
  bankAccount: '',
  notes: '',
  active: true,
};

interface Props {
  open: boolean;
  driver: DriverDto | null;
  carrierId: string | null;
  onClose: () => void;
}

type FormValues = CreateDriverDto;

export function DriverSheetCarrier({
  open,
  driver,
  carrierId,
  onClose,
}: Props) {
  const tDrivers = useTranslations('drivers');
  const tFields = useTranslations('drivers.fields');
  const tCommon = useTranslations('common');
  const isEdit = driver !== null;

  // Always validate against CreateDriverSchema — the carrier-side form
  // doesn't expose any field that's strictly create-only, so the same shape
  // works for edit. Submit handler strips carrierId for PATCH.
  const form = useForm<FormValues>({
    resolver: zodResolver(CreateDriverSchema),
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  const draft = useFormDraft(form, DRAFT_KEY, { enabled: !isEdit });

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
      form.reset({
        ...EMPTY_DEFAULTS,
        carrierId: carrierId ?? ('' as unknown as string),
      });
      draft.hydrate();
    }
  }, [open, isEdit, driver, carrierId, form, draft]);

  const createM = useCreateDriver({
    onSuccess: () => {
      draft.clear();
      form.reset({ ...EMPTY_DEFAULTS });
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

  const onSubmit = form.handleSubmit((values) => {
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
      // Always force the session-derived carrierId; never trust the form.
      cleaned.carrierId = carrierId;
      createM.mutate(cleaned as CreateDriverDto);
    }
  });

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? tDrivers('editDriver') : tDrivers('newDriver')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && driver
                ? `${driver.firstName} ${driver.lastName}`
                : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label={tFields('firstName')}
                  required
                  error={errs.firstName?.message}
                  htmlFor="cdriver-firstName"
                >
                  <Input
                    id="cdriver-firstName"
                    className="h-10"
                    {...form.register('firstName')}
                  />
                </FormField>
                <FormField
                  label={tFields('lastName')}
                  required
                  error={errs.lastName?.message}
                  htmlFor="cdriver-lastName"
                >
                  <Input
                    id="cdriver-lastName"
                    className="h-10"
                    {...form.register('lastName')}
                  />
                </FormField>
                <FormField
                  label={tFields('phone')}
                  required
                  error={errs.phone?.message}
                  htmlFor="cdriver-phone"
                >
                  <Input
                    id="cdriver-phone"
                    className="h-10"
                    {...form.register('phone')}
                  />
                </FormField>
                <FormField
                  label={tFields('phone2')}
                  error={errs.phone2?.message}
                  htmlFor="cdriver-phone2"
                >
                  <Input
                    id="cdriver-phone2"
                    className="h-10"
                    {...form.register('phone2')}
                  />
                </FormField>
                <FormField
                  label={tFields('email')}
                  error={errs.email?.message}
                  htmlFor="cdriver-email"
                >
                  <Input
                    id="cdriver-email"
                    type="email"
                    className="h-10"
                    {...form.register('email')}
                  />
                </FormField>
                <FormField
                  label={tFields('driverLicenseNumber')}
                  required
                  error={errs.driverLicenseNumber?.message}
                  htmlFor="cdriver-license"
                >
                  <Input
                    id="cdriver-license"
                    className="h-10"
                    {...form.register('driverLicenseNumber')}
                  />
                </FormField>
                <FormField
                  label={tFields('licenseExpiry')}
                  required
                  error={errs.licenseExpiry?.message}
                  htmlFor="cdriver-licenseExpiry"
                >
                  <Input
                    id="cdriver-licenseExpiry"
                    type="date"
                    className="h-10"
                    {...form.register('licenseExpiry')}
                  />
                </FormField>
                <FormField
                  label={tFields('bankAccount')}
                  error={errs.bankAccount?.message}
                  htmlFor="cdriver-bankAccount"
                >
                  <Input
                    id="cdriver-bankAccount"
                    className="h-10"
                    {...form.register('bankAccount')}
                  />
                </FormField>
              </div>

              <FormField
                label={tFields('notes')}
                error={errs.notes?.message}
                htmlFor="cdriver-notes"
              >
                <Textarea
                  id="cdriver-notes"
                  rows={3}
                  {...form.register('notes')}
                />
              </FormField>

              <label className="flex items-center gap-2 text-sm text-text">
                <Checkbox {...form.register('active')} />
                {tFields('active')}
              </label>
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
            <Button
              type="submit"
              size="sm"
              disabled={submitting || (!isEdit && !carrierId)}
            >
              {submitting ? tCommon('saving') : tCommon('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
