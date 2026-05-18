'use client';

// Phase 3 — new delegation form. Carrier picks vehicle / driver / trailer /
// departure / planned-return (all required since the
// `phase3_delegation_required_fields_and_date_only` migration).
//
// Highlights vs. the earlier draft:
// - Country pickers are `<CountrySelect>` (EU-27 enum) instead of free-text
//   inputs — keeps client + server enums in lockstep.
// - Postal codes use `<MaskedPostalInput>`, masked per-country per
//   `EU_POSTAL_CODES`. When the country changes we clear the postal — the
//   previous-country format is almost never valid for the new one.
// - `plannedReturnAt` is `type="date"` (the DB column is `@db.Date`).
// - Empty-string defaults keep RHF inputs controlled; Zod rejects them at
//   submit so the user sees inline validation errors.

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import {
  SubmitDelegationSchema,
  type EuVatCountryCode,
  type SubmitDelegationDto,
} from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { CountrySelect } from '@/components/forms/CountrySelect';
import { FormField, FormSection } from '@/components/forms/Form';
import { MaskedPostalInput } from '@/components/forms/MaskedPostalInput';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useSubmitDelegation } from '@/lib/hooks/useDelegations';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

const DRAFT_KEY = 'draft:carrier:newDelegation';

/**
 * Form-shape mirror of `SubmitDelegationDto` that uses empty strings (instead
 * of `undefined` / the enum literal) so every input is controlled from the
 * first render. Zod takes care of rejecting the empty values at submit time.
 */
type FormValues = {
  vehicleId: string;
  trailerId: string;
  driverId: string;
  departureAt: string;
  departureCountry: EuVatCountryCode | '';
  departurePostalCode: string;
  plannedReturnAt: string;
  returnCountry: EuVatCountryCode | '';
  returnPostalCode: string;
  comment: string | undefined;
};

const EMPTY_DEFAULTS: FormValues = {
  vehicleId: '',
  trailerId: '',
  driverId: '',
  departureAt: '',
  departureCountry: '',
  departurePostalCode: '',
  plannedReturnAt: '',
  returnCountry: '',
  returnPostalCode: '',
  comment: undefined,
};

export default function NewDelegationPage() {
  const t = useTranslations('carrier.delegations');
  const tForm = useTranslations('carrier.delegations.form');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const fleetQ = useMyFleet();

  const form = useForm<FormValues>({
    // The resolver is typed against the strict DTO; cast lets us keep the
    // form-friendly `FormValues` (empty strings) at the RHF surface — Zod
    // converts them to validation errors instead.
    resolver: zodResolver(SubmitDelegationSchema) as unknown as Resolver<FormValues>,
    defaultValues: { ...EMPTY_DEFAULTS },
  });

  const draft = useFormDraft(form, DRAFT_KEY, { enabled: true });

  useEffect(() => {
    form.reset({ ...EMPTY_DEFAULTS });
    draft.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitM = useSubmitDelegation({
    onSuccess: () => {
      draft.clear();
      toast.success(t('registeredToast'));
      router.push('/carrier/delegations');
    },
    onError: (err) => {
      const msg =
        err instanceof Error ? err.message : t('registerErrorToast');
      toast.error(msg);
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined;
      submitM.mutate({ body: cleaned as SubmitDelegationDto, idempotencyKey });
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const submitting = submitM.isPending;
  const errs = form.formState.errors;
  const vehicles = fleetQ.data?.vehicles ?? [];
  const drivers = fleetQ.data?.drivers ?? [];
  const trailers = fleetQ.data?.trailers ?? [];

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-4">
        <Link
          href="/carrier/delegations"
          className="inline-flex items-center gap-1 text-sm text-text-sub hover:text-text"
        >
          <ArrowLeft size={14} />
          {t('backToList')}
        </Link>
      </div>

      <h1 className="text-2xl font-extrabold tracking-tight text-text mb-6">
        {t('newDelegation')}
      </h1>

      <form onSubmit={onSubmit}>
        <div className="bg-card rounded-lg border border-border p-5 space-y-6">
          <FormSection title={tForm('sectionVehicleAndDriver')}>
            <FormField
              label={tForm('vehicle')}
              required
              error={errs.vehicleId?.message}
              htmlFor="del-vehicleId"
            >
              <Select
                id="del-vehicleId"
                {...form.register('vehicleId')}
              >
                <option value="">—</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.plateNumber}
                    {v.brand || v.model
                      ? ` — ${[v.brand, v.model].filter(Boolean).join(' ')}`
                      : ''}
                  </option>
                ))}
              </Select>
            </FormField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                label={tForm('driver')}
                required
                error={errs.driverId?.message}
                htmlFor="del-driverId"
              >
                <Select id="del-driverId" {...form.register('driverId')}>
                  <option value="">—</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.firstName} {d.lastName}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField
                label={tForm('trailer')}
                required
                error={errs.trailerId?.message}
                htmlFor="del-trailerId"
              >
                <Select id="del-trailerId" {...form.register('trailerId')}>
                  <option value="">—</option>
                  {trailers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.plateNumber}
                      {tr.trailerTypeName ? ` (${tr.trailerTypeName})` : ''}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
          </FormSection>

          <FormSection title={tForm('sectionDeparture')}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label={tForm('departureAt')}
                required
                error={errs.departureAt?.message}
                htmlFor="del-departureAt"
                className="md:col-span-1"
              >
                <Input
                  id="del-departureAt"
                  type="datetime-local"
                  className="h-10"
                  {...form.register('departureAt', {
                    setValueAs: (v) => {
                      if (!v) return '';
                      // Browser <input type="datetime-local"> emits "YYYY-MM-DDThh:mm".
                      // The backend wants a full ISO datetime.
                      return new Date(v as string).toISOString();
                    },
                  })}
                />
              </FormField>
              <FormField
                label={tForm('departureCountry')}
                required
                error={errs.departureCountry?.message}
                htmlFor="del-departureCountry"
              >
                <Controller
                  control={form.control}
                  name="departureCountry"
                  render={({ field }) => (
                    <CountrySelect
                      id="del-departureCountry"
                      className="h-10"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                        // Per-country mask changes — drop the now-incompatible
                        // postal so the user can't submit `00-001` while the
                        // country says Germany.
                        form.setValue('departurePostalCode', '', {
                          shouldDirty: true,
                          shouldValidate: false,
                        });
                      }}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
              </FormField>
              <FormField
                label={tForm('departurePostalCode')}
                required
                error={errs.departurePostalCode?.message}
                htmlFor="del-departurePostalCode"
              >
                <Controller
                  control={form.control}
                  name="departurePostalCode"
                  render={({ field }) => (
                    <MaskedPostalInput
                      id="del-departurePostalCode"
                      className="h-10"
                      country={form.watch('departureCountry')}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title={tForm('sectionReturn')}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                label={tForm('plannedReturnAt')}
                required
                error={errs.plannedReturnAt?.message}
                htmlFor="del-plannedReturnAt"
              >
                <Input
                  id="del-plannedReturnAt"
                  type="date"
                  className="h-10"
                  {...form.register('plannedReturnAt')}
                />
              </FormField>
              <FormField
                label={tForm('returnCountry')}
                required
                error={errs.returnCountry?.message}
                htmlFor="del-returnCountry"
              >
                <Controller
                  control={form.control}
                  name="returnCountry"
                  render={({ field }) => (
                    <CountrySelect
                      id="del-returnCountry"
                      className="h-10"
                      value={field.value}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                        form.setValue('returnPostalCode', '', {
                          shouldDirty: true,
                          shouldValidate: false,
                        });
                      }}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
              </FormField>
              <FormField
                label={tForm('returnPostalCode')}
                required
                error={errs.returnPostalCode?.message}
                htmlFor="del-returnPostalCode"
              >
                <Controller
                  control={form.control}
                  name="returnPostalCode"
                  render={({ field }) => (
                    <MaskedPostalInput
                      id="del-returnPostalCode"
                      className="h-10"
                      country={form.watch('returnCountry')}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                    />
                  )}
                />
              </FormField>
            </div>
          </FormSection>

          <FormField
            label={tForm('comment')}
            error={errs.comment?.message}
            htmlFor="del-comment"
          >
            <Textarea
              id="del-comment"
              rows={3}
              {...form.register('comment')}
            />
          </FormField>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              draft.clear();
              form.reset({ ...EMPTY_DEFAULTS });
            }}
            disabled={submitting}
          >
            {tCommon('clear')}
          </Button>
          <Button type="submit" size="lg" disabled={submitting}>
            {submitting ? t('saving') : t('registerSubmit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
