'use client';

// Create / edit drawer for a carrier. Wires the live VIES (NIP) and Biała
// Lista (account+NIP) checks per docs/14-design-system.md § Field validation
// badge. Both checks run on-blur; failures degrade to "service unavailable"
// (warning) so the form never breaks if api-agent's integrations endpoints
// aren't deployed yet.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateCarrierSchema,
  UpdateCarrierSchema,
  type CarrierDto,
  type CreateCarrierDto,
  type UpdateCarrierDto,
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
import {
  FieldValidationBadge,
  type FieldValidationState,
} from '@/components/forms/FieldValidationBadge';
import {
  checkVies,
  checkWhitelist,
  INTEGRATION_UNAVAILABLE,
} from '@/lib/api/integrations';
import { useCreateCarrier, useUpdateCarrier } from '@/lib/hooks/useCarriers';
import { useOpiekuni } from '@/lib/hooks/useLookups';

interface Props {
  open: boolean;
  carrier: CarrierDto | null;
  onClose: () => void;
}

// Single form-values shape for both modes. Create has all the fields plus
// `password` (no `active`); Update has `active` (no `password`/`login`). The
// onSubmit handler picks the right slice before posting.
type CarrierFormValues = CreateCarrierDto & { active?: boolean };

const NUMERIC_FIELDS = [
  'paymentTerms',
  'insuranceValue',
  'numberOfPermits',
] as const;

export function CarrierSheet({ open, carrier, onClose }: Props) {
  const t = useTranslations('carriers');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const isEdit = carrier !== null;

  // Both schemas are .strict() but our form carries fields that aren't part
  // of the wire DTO (login/password in edit, active in create). Passthrough
  // lets RHF run the resolver against the registered fields without choking
  // on the spectator values; onSubmit strips them before the API call.
  const form = useForm<CarrierFormValues>({
    resolver: zodResolver(
      isEdit
        ? UpdateCarrierSchema.passthrough()
        : CreateCarrierSchema.passthrough(),
    ) as never,
    defaultValues: getDefaults(),
  });

  const opiekuniQ = useOpiekuni();

  // ── Inline validation badges (VIES + Biała Lista) ─────────────────
  const [nipState, setNipState] = useState<FieldValidationState>('idle');
  const [nipMsg, setNipMsg] = useState<string | undefined>(undefined);
  const [accountState, setAccountState] = useState<FieldValidationState>('idle');
  const [accountMsg, setAccountMsg] = useState<string | undefined>(undefined);

  const checkNip = async () => {
    const nip = (form.getValues('nip') ?? '').trim();
    if (!nip) {
      setNipState('idle');
      return;
    }
    setNipState('loading');
    const res = await checkVies('PL', nip);
    if (res === INTEGRATION_UNAVAILABLE) {
      setNipState('error');
      setNipMsg(tValidation('error'));
      return;
    }
    if (res.valid) {
      setNipState('valid');
      setNipMsg(res.name ? `${tValidation('valid')} — ${res.name}` : undefined);
    } else {
      setNipState('invalid');
      setNipMsg(undefined);
    }
  };

  const checkAccount = async () => {
    const nip = (form.getValues('nip') ?? '').trim();
    const account = (form.getValues('accountEur') ?? '').trim();
    if (!nip || !account) {
      setAccountState('idle');
      return;
    }
    setAccountState('loading');
    const res = await checkWhitelist(nip, account);
    if (res === INTEGRATION_UNAVAILABLE) {
      setAccountState('error');
      setAccountMsg(tValidation('error'));
      return;
    }
    if (res.accountAssigned) {
      setAccountState('valid');
      setAccountMsg(undefined);
    } else {
      setAccountState('invalid');
      setAccountMsg(undefined);
    }
  };

  useEffect(() => {
    if (!open) return;
    setNipState('idle');
    setAccountState('idle');
    if (isEdit && carrier) {
      form.reset({
        login: carrier.login,
        email: carrier.email ?? '',
        name: carrier.name ?? '',
        company: carrier.company ?? '',
        password: undefined,
        nip: carrier.nip ?? '',
        vatId: carrier.vatId ?? '',
        contactPerson: carrier.contactPerson ?? '',
        phone: carrier.phone ?? '',
        ordersEmail: carrier.ordersEmail ?? '',
        accountEur: carrier.accountEur ?? '',
        accountPln: carrier.accountPln ?? '',
        paymentTerms: carrier.paymentTerms ?? undefined,
        insuranceValue: carrier.insuranceValue ?? undefined,
        insuranceExpiry: carrier.insuranceExpiry ?? undefined,
        licenseExpiry: carrier.licenseExpiry ?? undefined,
        numberOfPermits: carrier.numberOfPermits ?? undefined,
        companyAddress: carrier.companyAddress ?? '',
        opiekunId: carrier.opiekunId ?? undefined,
        active: carrier.active,
      });
    } else {
      form.reset(getDefaults());
    }
  }, [open, isEdit, carrier, form]);

  const createM = useCreateCarrier({
    onSuccess: (created) => {
      // Phase 2 dev-only: API returns the temporary password in the response.
      // Surface it in a long-lived toast so the admin can copy it.
      if (created.temporaryPassword) {
        toast.success(
          t('tempPasswordToast', { password: created.temporaryPassword }),
          { duration: 30_000 },
        );
      } else {
        toast.success(tCommon('saved'));
      }
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const updateM = useUpdateCarrier({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onSubmit = form.handleSubmit((values) => {
    const cleaned = cleanForm(values);
    if (isEdit && carrier) {
      // login isn't editable per Update schema; password not allowed either.
      const { login: _login, password: _pw, ...rest } = cleaned;
      void _login;
      void _pw;
      updateM.mutate({ id: carrier.id, body: rest as UpdateCarrierDto });
    } else {
      // active isn't part of CreateCarrierDto.
      const { active: _active, ...rest } = cleaned;
      void _active;
      createM.mutate(rest as CreateCarrierDto);
    }
  });

  const submitting = createM.isPending || updateM.isPending;
  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent size="wide">
        <form onSubmit={onSubmit} className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>
              {isEdit ? t('editCarrier') : t('newCarrier')}
            </SheetTitle>
            <SheetDescription>
              {isEdit && carrier ? carrier.login : null}
            </SheetDescription>
          </SheetHeader>

          <SheetBody>
            <div className="space-y-6">
              <FormSection title={t('sections.account')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={t('fields.login')}
                    required={!isEdit}
                    error={errMsg('login')}
                    htmlFor="carrier-login"
                  >
                    <Input
                      id="carrier-login"
                      className="h-10"
                      disabled={isEdit}
                      {...form.register('login')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.email')}
                    required
                    error={errMsg('email')}
                    htmlFor="carrier-email"
                  >
                    <Input
                      id="carrier-email"
                      type="email"
                      className="h-10"
                      {...form.register('email')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.name')}
                    required
                    error={errMsg('name')}
                    htmlFor="carrier-name"
                  >
                    <Input
                      id="carrier-name"
                      className="h-10"
                      {...form.register('name')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.contactPerson')}
                    error={errMsg('contactPerson')}
                    htmlFor="carrier-contactPerson"
                  >
                    <Input
                      id="carrier-contactPerson"
                      className="h-10"
                      {...form.register('contactPerson')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.phone')}
                    error={errMsg('phone')}
                    htmlFor="carrier-phone"
                  >
                    <Input
                      id="carrier-phone"
                      className="h-10"
                      {...form.register('phone')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.ordersEmail')}
                    error={errMsg('ordersEmail')}
                    htmlFor="carrier-ordersEmail"
                  >
                    <Input
                      id="carrier-ordersEmail"
                      type="email"
                      className="h-10"
                      {...form.register('ordersEmail')}
                    />
                  </FormField>
                  {!isEdit && (
                    <FormField
                      label={t('fields.password')}
                      description="≥10 chars, ≥1 letter, ≥1 digit. Leave empty to auto-generate."
                      error={errMsg('password')}
                      htmlFor="carrier-password"
                    >
                      <Input
                        id="carrier-password"
                        type="text"
                        className="h-10"
                        autoComplete="new-password"
                        {...form.register('password')}
                      />
                    </FormField>
                  )}
                </div>
              </FormSection>

              <FormSection title={t('sections.company')}>
                <FormField
                  label={t('fields.company')}
                  error={errMsg('company')}
                  htmlFor="carrier-company"
                >
                  <Input
                    id="carrier-company"
                    className="h-10"
                    {...form.register('company')}
                  />
                </FormField>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={t('fields.nip')}
                    error={errMsg('nip')}
                    htmlFor="carrier-nip"
                  >
                    <div className="space-y-1">
                      <Input
                        id="carrier-nip"
                        className="h-10"
                        {...form.register('nip', {
                          onBlur: () => {
                            void checkNip();
                          },
                        })}
                      />
                      <FieldValidationBadge
                        state={nipState}
                        message={nipMsg}
                      />
                    </div>
                  </FormField>
                  <FormField
                    label={t('fields.vatId')}
                    error={errMsg('vatId')}
                    htmlFor="carrier-vatId"
                  >
                    <Input
                      id="carrier-vatId"
                      className="h-10"
                      {...form.register('vatId')}
                    />
                  </FormField>
                </div>
                <FormField
                  label={t('fields.companyAddress')}
                  error={errMsg('companyAddress')}
                  htmlFor="carrier-address"
                >
                  <Textarea
                    id="carrier-address"
                    rows={2}
                    {...form.register('companyAddress')}
                  />
                </FormField>
              </FormSection>

              <FormSection title={t('sections.finance')}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={t('fields.accountEur')}
                    error={errMsg('accountEur')}
                    htmlFor="carrier-accountEur"
                  >
                    <div className="space-y-1">
                      <Input
                        id="carrier-accountEur"
                        className="h-10"
                        {...form.register('accountEur', {
                          onBlur: () => {
                            void checkAccount();
                          },
                        })}
                      />
                      <FieldValidationBadge
                        state={accountState}
                        message={accountMsg}
                      />
                    </div>
                  </FormField>
                  <FormField
                    label={t('fields.accountPln')}
                    error={errMsg('accountPln')}
                    htmlFor="carrier-accountPln"
                  >
                    <Input
                      id="carrier-accountPln"
                      className="h-10"
                      {...form.register('accountPln')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.paymentTerms')}
                    error={errMsg('paymentTerms')}
                    htmlFor="carrier-paymentTerms"
                  >
                    <Input
                      id="carrier-paymentTerms"
                      type="number"
                      className="h-10"
                      {...form.register('paymentTerms', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.insuranceValue')}
                    error={errMsg('insuranceValue')}
                    htmlFor="carrier-insuranceValue"
                  >
                    <Input
                      id="carrier-insuranceValue"
                      type="number"
                      step="0.01"
                      className="h-10"
                      {...form.register('insuranceValue', {
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.insuranceExpiry')}
                    error={errMsg('insuranceExpiry')}
                    htmlFor="carrier-insuranceExpiry"
                  >
                    <Input
                      id="carrier-insuranceExpiry"
                      type="date"
                      className="h-10"
                      {...form.register('insuranceExpiry')}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.licenseExpiry')}
                    error={errMsg('licenseExpiry')}
                    htmlFor="carrier-licenseExpiry"
                  >
                    <Input
                      id="carrier-licenseExpiry"
                      type="date"
                      className="h-10"
                      {...form.register('licenseExpiry')}
                    />
                  </FormField>
                </div>
              </FormSection>

              <FormSection title={t('sections.permits')}>
                <FormField
                  label={t('fields.numberOfPermits')}
                  error={errMsg('numberOfPermits')}
                  htmlFor="carrier-numberOfPermits"
                >
                  <Input
                    id="carrier-numberOfPermits"
                    type="number"
                    className="h-10"
                    {...form.register('numberOfPermits', {
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                  />
                </FormField>
              </FormSection>

              <FormSection title={t('sections.assignment')}>
                <FormField
                  label={t('fields.opiekun')}
                  error={errMsg('opiekunId')}
                  htmlFor="carrier-opiekunId"
                >
                  <Select
                    id="carrier-opiekunId"
                    {...form.register('opiekunId')}
                  >
                    <option value="">—</option>
                    {(opiekuniQ.data ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name ?? u.login}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {isEdit && (
                  <label className="flex items-center gap-2 text-sm text-text">
                    <Checkbox {...form.register('active')} />
                    {t('fields.active')}
                  </label>
                )}
              </FormSection>
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
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? tCommon('saving') : tCommon('save')}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function getDefaults(): CarrierFormValues {
  return {
    login: '',
    email: '',
    name: '',
    company: '',
    password: undefined,
    nip: '',
    vatId: '',
    contactPerson: '',
    phone: '',
    ordersEmail: '',
    accountEur: '',
    accountPln: '',
    paymentTerms: undefined,
    insuranceValue: undefined,
    insuranceExpiry: undefined,
    licenseExpiry: undefined,
    numberOfPermits: undefined,
    companyAddress: '',
    opiekunId: undefined,
    active: true,
  };
}

function cleanForm(
  values: CarrierFormValues,
): Record<string, unknown> & { active?: boolean } {
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
