'use client';

// Create / edit drawer for a carrier. Wires the live VIES (NIP) and Biała
// Lista (account+NIP) checks per docs/14-design-system.md § Field validation
// badge. Both checks run on-blur; failures degrade to "service unavailable"
// (warning) so the form never breaks if api-agent's integrations endpoints
// aren't deployed yet.
//
// Phase-2 contract changes (db-agent migration `phase2_required_fields_…`):
//   - `phone` is now NOT NULL on the Carrier row; UI marks it required.
//   - `opiekunId` is NOT NULL; UI surfaces a required Select preselected to
//     the current opiekun when the form is opened by an opiekun.
//   - `vatId` stays optional on the API but the UI now splits it into a
//     country dropdown (EU_VAT_COUNTRIES) + a numeric/alnum suffix that we
//     concatenate just before mutate.
//   - `nip` accepts only 10 digits; we strip whitespace + hyphens at write
//     time (setValueAs) so paste-from-Excel still works.

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CreateCarrierSchema,
  EU_VAT_COUNTRIES,
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
import { ApiResponseError } from '@/lib/api/client';
import {
  checkVies,
  checkWhitelist,
  checkWhitelistSearch,
  INTEGRATION_UNAVAILABLE,
  type WhitelistSearchResult,
} from '@/lib/api/integrations';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCreateCarrier, useUpdateCarrier } from '@/lib/hooks/useCarriers';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useOpiekuni } from '@/lib/hooks/useLookups';

const DRAFT_KEY = 'draft:carriers:new';

// Codes used by EuVatSchema (regex `^[A-Z]{2}…`). The set of codes is
// stable so we keep a literal default rather than introducing another
// runtime constant.
const DEFAULT_VAT_COUNTRY = 'PL';

interface Props {
  open: boolean;
  carrier: CarrierDto | null;
  onClose: () => void;
}

// Single form-values shape for both modes. Create has all the fields plus
// `password` (no `active`); Update has `active` (no `password`/`login`). The
// onSubmit handler picks the right slice before posting.
//
// `_vatCountry` / `_vatNumber` are *form-only* helper fields. They never
// reach the API — `cleanForm` strips them after we combine them into
// `vatId`. RHF's `passthrough()` resolver lets these unknown keys live in
// the form state without tripping the strict Zod schemas.
//
// `insuranceValue` is widened to `number | undefined` for the form only —
// the wire DTO still requires `number`. Allowing undefined in form state
// lets the input start blank; Zod then reports the missing field on submit
// instead of the form silently sending 0.
type CarrierFormValues = Omit<CreateCarrierDto, 'insuranceValue'> & {
  insuranceValue?: number;
  active?: boolean;
  _vatCountry?: string;
  _vatNumber?: string;
};

const NUMERIC_FIELDS = [
  'paymentTerms',
  'insuranceValue',
  'numberOfPermits',
] as const;

// Fields that are part of form state but never go to the API.
const FORM_ONLY_FIELDS = ['_vatCountry', '_vatNumber'] as const;

export function CarrierSheet({ open, carrier, onClose }: Props) {
  const t = useTranslations('carriers');
  const tCommon = useTranslations('common');
  const tValidation = useTranslations('validation');
  const isEdit = carrier !== null;
  const { user } = useAuth();

  // Both schemas are .strict() but our form carries fields that aren't part
  // of the wire DTO (login/password in edit, active in create, plus the
  // VAT split helpers). Passthrough lets RHF run the resolver against the
  // registered fields without choking on the spectator values; onSubmit
  // strips them before the API call.
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
  // ── Multi-account picker (Biała Lista search returned ≥2 accounts) ──
  //
  // When MF's registry returns multiple bank accounts for the NIP we don't
  // try to guess which one is EUR — we surface the list under the
  // `accountEur` field and let the user pick. Cleared on:
  //   - successful selection,
  //   - manual typing into `accountEur` (so the picker doesn't linger),
  //   - clear-form button, sheet open/close, NIP re-lookup.
  const [accountChoices, setAccountChoices] = useState<string[]>([]);

  const checkNip = async () => {
    const nip = (form.getValues('nip') ?? '').trim();
    if (!nip) {
      setNipState('idle');
      // Drop any stale picker from a previous lookup.
      setAccountChoices([]);
      return;
    }
    setNipState('loading');
    // Reset the multi-account picker on every fresh lookup — its contents
    // are derived from the response we're about to fetch.
    setAccountChoices([]);
    // VIES + Biała Lista search fire in parallel. VIES still owns the badge
    // (works for foreign carriers too); Biała Lista contributes autofill +
    // multi-account selector for PL carriers only and stays silent on
    // failure / `found: false`.
    const [viesSettled, blSettled] = await Promise.allSettled([
      checkVies('PL', nip),
      checkWhitelistSearch(nip),
    ]);

    // 1) Biała Lista autofill runs first — MF is authoritative for PL data.
    //    Both autofill helpers respect the "empty fields only" rule, so a
    //    successful MF hit wins, VIES later fills only the remaining gaps.
    if (blSettled.status === 'fulfilled') {
      const blRes = blSettled.value;
      if (blRes !== INTEGRATION_UNAVAILABLE) {
        applyWhitelistAutofill(blRes, form);
        // Account-numbers branch — see § 2.4 of the integration spec.
        if (blRes.found && blRes.accountNumbers.length > 0) {
          const accounts = blRes.accountNumbers;
          const currentEur = (form.getValues('accountEur') ?? '').trim();
          const first = accounts[0];
          if (accounts.length === 1 && first) {
            if (!currentEur) {
              form.setValue('accountEur', first, {
                shouldDirty: true,
                shouldValidate: true,
              });
            }
          } else if (accounts.length >= 2) {
            // ≥2 accounts → defer to user choice via the inline picker.
            // We surface it regardless of whether `accountEur` is already
            // filled in edit-mode — actually, only show it when the field
            // is empty, so existing carriers aren't pestered.
            if (!currentEur) {
              setAccountChoices(accounts);
            }
          }
        }
      }
    }

    // 2) VIES result drives the badge (and supplements autofill).
    if (viesSettled.status !== 'fulfilled') {
      // Promise.allSettled only rejects on programmer errors here (the
      // wrapper catches network failures); treat as service-unavailable.
      setNipState('error');
      setNipMsg(tValidation('error'));
      return;
    }
    const res = viesSettled.value;
    if (res === INTEGRATION_UNAVAILABLE) {
      setNipState('error');
      setNipMsg(tValidation('error'));
      return;
    }
    if (res.valid) {
      setNipState('valid');
      setNipMsg(res.name ? `${tValidation('valid')} — ${res.name}` : undefined);
      applyViesAutofill(res, form);
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

  // Persist create-mode drafts to sessionStorage; closing the sheet keeps
  // the user's typing intact. Edit mode skipped — server is source of truth.
  const draft = useFormDraft(form, DRAFT_KEY, { enabled: !isEdit });

  // Default opiekunId on create: if the current user is an opiekun,
  // preselect their own id. Computed once per `user` change so reset()
  // below picks it up deterministically.
  const defaultOpiekunId = useMemo(
    () => (user?.role === 'opiekun' ? user.id : undefined),
    [user?.role, user?.id],
  );

  // Keep `vatId` in form state in lockstep with the country+number split so
  // Zod validates the composed value on submit (otherwise vatId stays '' until
  // the submit handler composes it, and the resolver rejects ahead of that).
  const watchedVatCountry = form.watch('_vatCountry');
  const watchedVatNumber = form.watch('_vatNumber');
  useEffect(() => {
    const composed = composeVatId(watchedVatCountry, watchedVatNumber);
    form.setValue('vatId', composed ?? '', { shouldValidate: false });
  }, [watchedVatCountry, watchedVatNumber, form]);

  useEffect(() => {
    if (!open) return;
    setNipState('idle');
    setAccountState('idle');
    setAccountChoices([]);
    if (isEdit && carrier) {
      const split = splitVatId(carrier.vatId);
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
        paymentTerms: carrier.paymentTerms ?? 30,
        insuranceValue: carrier.insuranceValue ?? undefined,
        insuranceExpiry: carrier.insuranceExpiry ?? '',
        licenseExpiry: carrier.licenseExpiry ?? '',
        numberOfPermits: carrier.numberOfPermits ?? undefined,
        companyAddress: carrier.companyAddress ?? '',
        opiekunId: carrier.opiekunId,
        active: carrier.active,
        _vatCountry: split.country,
        _vatNumber: split.number,
      });
    } else {
      // Reset to empty defaults first, then overlay any saved draft on top.
      form.reset({
        ...getDefaults(),
        opiekunId: defaultOpiekunId as unknown as string,
      });
      draft.hydrate();
    }
  }, [open, isEdit, carrier, form, draft, defaultOpiekunId]);

  const createM = useCreateCarrier({
    onSuccess: (created) => {
      // Successful create — wipe the draft and reset the form so the next
      // "+ New" opens a clean slate.
      draft.clear();
      form.reset(getDefaults());

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
    onError: (err) => toast.error(formatApiError(err, tCommon('errorGeneric'))),
  });
  const updateM = useUpdateCarrier({
    onSuccess: () => {
      toast.success(tCommon('saved'));
      onClose();
    },
    onError: (err) => toast.error(formatApiError(err, tCommon('errorGeneric'))),
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      // `vatId` is already kept in sync via the watch effect above, so
      // `values.vatId` is the composed value Zod just validated.
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
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

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
                    required
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
                    required
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
                    required
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
                      required
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    label={t('fields.nip')}
                    required
                    description={t('fields.nipHint')}
                    error={errMsg('nip')}
                    htmlFor="carrier-nip"
                  >
                    <div className="space-y-1">
                      <Input
                        id="carrier-nip"
                        className="h-10"
                        inputMode="text"
                        maxLength={20}
                        autoComplete="off"
                        {...form.register('nip', {
                          // Strip whitespace and hyphens so paste-from-Excel
                          // produces a clean alphanumeric string the API
                          // accepts (5–20 chars). Polish 10-digit NIP still
                          // passes; foreign TINs (Italian Codice Fiscale up to
                          // 16 etc.) also fit.
                          setValueAs: (v) =>
                            typeof v === 'string'
                              ? v.replace(/[\s-]/g, '')
                              : v,
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
                    description={t('fields.vatHint')}
                    error={errMsg('vatId')}
                    htmlFor="carrier-vatNumber"
                  >
                    <div className="flex gap-2">
                      <Select
                        id="carrier-vatCountry"
                        aria-label={t('fields.vatCountry')}
                        className="h-10 max-w-[8rem]"
                        {...form.register('_vatCountry')}
                      >
                        {EU_VAT_COUNTRIES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </Select>
                      <Input
                        id="carrier-vatNumber"
                        aria-label={t('fields.vatNumber')}
                        className="h-10 flex-1"
                        inputMode="text"
                        maxLength={12}
                        autoComplete="off"
                        {...form.register('_vatNumber', {
                          // Strip whitespace + hyphens; uppercase letters so
                          // EuVatSchema regex (`[A-Z]{2}[A-Za-z0-9]{2,12}`)
                          // is happy regardless of how the user typed it.
                          setValueAs: (v) =>
                            typeof v === 'string'
                              ? v.replace(/[\s-]/g, '').toUpperCase()
                              : v,
                        })}
                      />
                    </div>
                  </FormField>
                </div>
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
                <FormField
                  label={t('fields.companyAddress')}
                  required
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
                    required
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
                          // Manual typing dismisses the MF picker — once
                          // the user starts editing the account they don't
                          // want a dropdown nagging them.
                          onChange: () => {
                            if (accountChoices.length > 0) {
                              setAccountChoices([]);
                            }
                          },
                        })}
                      />
                      {accountChoices.length > 0 && (
                        <div className="space-y-1 rounded-[8px] border border-border bg-card p-2">
                          <p
                            id="carrier-account-picker-label"
                            className="text-[12px] text-text-sub"
                          >
                            {t('accountSelector.label')}
                          </p>
                          <Select
                            aria-labelledby="carrier-account-picker-label"
                            defaultValue=""
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) return;
                              form.setValue('accountEur', v, {
                                shouldDirty: true,
                                shouldValidate: true,
                              });
                              setAccountChoices([]);
                            }}
                          >
                            <option value="" disabled>
                              {t('accountSelector.placeholder')}
                            </option>
                            {accountChoices.map((acc) => (
                              <option key={acc} value={acc}>
                                {acc}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
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
                    required
                    error={errMsg('insuranceValue')}
                    htmlFor="carrier-insuranceValue"
                  >
                    <Input
                      id="carrier-insuranceValue"
                      type="number"
                      step="0.01"
                      min={250000}
                      placeholder={t('fields.insuranceMinHint')}
                      className="h-10"
                      {...form.register('insuranceValue', {
                        // Empty / null input → undefined so Zod treats the
                        // field as missing and surfaces "Required" instead of
                        // silently coercing to 0.
                        setValueAs: (v) =>
                          v === '' || v === null ? undefined : Number(v),
                      })}
                    />
                  </FormField>
                  <FormField
                    label={t('fields.insuranceExpiry')}
                    required
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
                    required
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
                  required
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
            {!isEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  draft.clear();
                  form.reset({
                    ...getDefaults(),
                    opiekunId: defaultOpiekunId as unknown as string,
                  });
                  // Also clear any inline integration badges so they don't
                  // dangle for fields that were just wiped.
                  setNipState('idle');
                  setAccountState('idle');
                  setAccountChoices([]);
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

/**
 * Autofill `company` / `companyAddress` from a successful VIES lookup, but
 * only when the user hasn't typed anything yet (Variant 1 — "empty fields
 * only"). `shouldDirty: true` keeps `useFormDraft` in sync; `shouldValidate`
 * runs the Zod resolver so the field's error state clears immediately.
 */
function applyViesAutofill(
  res: { name: string | null; address: string | null },
  form: UseFormReturn<CarrierFormValues>,
): void {
  const name = res.name?.trim();
  if (name && !(form.getValues('company') ?? '').trim()) {
    form.setValue('company', name, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
  // VIES address often comes with embedded newlines + double spaces; collapse
  // to a single line so the <Textarea rows={2}> renders sanely.
  const address = res.address?.trim().replace(/\s+/g, ' ');
  if (address && !(form.getValues('companyAddress') ?? '').trim()) {
    form.setValue('companyAddress', address, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
}

/**
 * Autofill `company` / `companyAddress` from a Biała Lista (MF registry)
 * search hit. Same "empty fields only" rule as {@link applyViesAutofill}
 * so the user's typing is never overwritten.
 *
 * Account numbers are intentionally NOT touched here — that logic lives in
 * `checkNip()` because it depends on the array length (single → autofill,
 * multi → show picker) and the picker is component-level state.
 */
function applyWhitelistAutofill(
  res: WhitelistSearchResult,
  form: UseFormReturn<CarrierFormValues>,
): void {
  if (!res.found) return;

  const name = res.name?.trim();
  if (name && !(form.getValues('company') ?? '').trim()) {
    form.setValue('company', name, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  // MF addresses can arrive with extra whitespace too; normalize to a single
  // line so the <Textarea rows={2}> renders predictably.
  const address = res.address?.trim().replace(/\s+/g, ' ');
  if (address && !(form.getValues('companyAddress') ?? '').trim()) {
    form.setValue('companyAddress', address, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }
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
    // paymentTerms has a Zod default (30) but RHF needs a controlled value.
    // 30 mirrors the schema default so the user sees the canonical value.
    paymentTerms: 30,
    // insuranceValue is required (NOT NULL, must be > 0). Leave undefined so
    // the <input type="number"> stays empty until the user types — submitting
    // blank then surfaces the standard Zod "Required" / positive-number error
    // instead of silently sending 0.
    insuranceValue: undefined,
    // insuranceExpiry / licenseExpiry are NOT NULL ISO-date strings. Empty
    // string keeps the <input type="date"> controlled; IsoDateSchema rejects
    // it on submit so the user sees a clear error.
    insuranceExpiry: '',
    licenseExpiry: '',
    numberOfPermits: undefined,
    companyAddress: '',
    // opiekunId is required in CreateCarrierSchema (UUID). RHF needs a
    // string-shaped controlled value — empty string parks the Select on
    // its placeholder option and Zod will report "Invalid uuid" on submit
    // if the user hasn't picked one.
    opiekunId: '' as unknown as string,
    active: true,
    _vatCountry: DEFAULT_VAT_COUNTRY,
    _vatNumber: '',
  };
}

/**
 * Strip empty / undefined / null values + the form-only helper keys, coerce
 * numeric fields. Mutates nothing.
 */
function cleanForm(
  values: CarrierFormValues,
): Record<string, unknown> & { active?: boolean } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if ((FORM_ONLY_FIELDS as readonly string[]).includes(k)) continue;
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

/**
 * Combine the country-code dropdown and the suffix input into the single
 * VAT-ID string the API expects. Returns `undefined` when the suffix is
 * empty so callers can omit the field entirely.
 */
function composeVatId(
  country: string | undefined,
  number: string | undefined,
): string | undefined {
  const c = (country ?? '').trim().toUpperCase();
  const n = (number ?? '').replace(/[\s-]/g, '').toUpperCase();
  if (!n) return undefined;
  // Country missing — fall back to PL so the resulting string still has the
  // 2-letter prefix EuVatSchema requires; any further validation is on the
  // server.
  return `${c || DEFAULT_VAT_COUNTRY}${n}`;
}

/**
 * Pull a user-facing message off an API error. The backend uses RFC 7807
 * problem-details with localized Polish messages for 4xx (e.g. 409 Conflict
 * "Login lub email są już zajęte"); we surface those as-is. For 5xx (server
 * crash) we fall through to the caller's generic fallback.
 */
function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiResponseError && err.status >= 400 && err.status < 500) {
    return err.message || fallback;
  }
  return fallback;
}

/**
 * Inverse of {@link composeVatId} — splits an existing carrier's `vatId`
 * back into the dropdown + suffix shape the form uses for display. Tolerant
 * of legacy values that don't start with a 2-letter prefix.
 */
function splitVatId(vatId: string | null | undefined): {
  country: string;
  number: string;
} {
  if (!vatId) return { country: DEFAULT_VAT_COUNTRY, number: '' };
  const head = vatId.slice(0, 2);
  if (/^[A-Z]{2}$/.test(head)) {
    return { country: head, number: vatId.slice(2) };
  }
  return { country: DEFAULT_VAT_COUNTRY, number: vatId };
}
