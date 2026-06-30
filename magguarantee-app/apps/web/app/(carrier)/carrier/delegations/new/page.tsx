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
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { toast } from 'sonner';
import {
  CARRIER_NOT_READY_CODE,
  DEPARTURE_IN_PAST_CODE,
  DEPARTURE_PAST_GRACE_MS,
  SubmitDelegationSchema,
  type EuVatCountryCode,
  type SubmitDelegationDto,
} from '@magguarantee/shared';

import { ApiResponseError } from '@/lib/api/client';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { CountrySelect } from '@/components/forms/CountrySelect';
import { FormField, FormGrid, FormSection } from '@/components/forms/Form';
import { MaskedPostalInput } from '@/components/forms/MaskedPostalInput';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import {
  useDelegationEligibility,
  useSubmitDelegation,
} from '@/lib/hooks/useDelegations';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

/**
 * Narrows an unknown mutation error to the carrier-readiness 422. The API
 * returns RFC-7807 with `extensions.code === CARRIER_NOT_READY_CODE`; the
 * client puts the whole decoded envelope on `err.data`, so the code lives at
 * `err.data.extensions.code`.
 */
function isCarrierNotReady(err: unknown): boolean {
  if (!(err instanceof ApiResponseError) || err.status !== 422) return false;
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return false;
  return (
    (extensions as { code?: unknown }).code === CARRIER_NOT_READY_CODE
  );
}

/**
 * Narrows an unknown mutation error to the past-departure 422 backstop. Same
 * envelope shape as {@link isCarrierNotReady}, matching on
 * `DEPARTURE_IN_PAST_CODE`. This is only the server-side safety net — the
 * primary block is the inline pre-submit check (skipped when bypassed). The two
 * flags (`NEXT_PUBLIC_ALLOW_PAST_DEPARTURE` vs the api `ALLOW_PAST_DEPARTURE`)
 * are independent, so a 422 can still arrive even with the web check disabled.
 */
function isDepartureInPast(err: unknown): boolean {
  if (!(err instanceof ApiResponseError) || err.status !== 422) return false;
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return false;
  return (
    (extensions as { code?: unknown }).code === DEPARTURE_IN_PAST_CODE
  );
}

/**
 * Build-time-baked bypass (same mechanism as `NEXT_PUBLIC_API_URL`). When
 * `true` the past-departure block is fully disabled in the UI: no `min` hint,
 * no pre-submit check. Independent from the api `ALLOW_PAST_DEPARTURE` flag —
 * both must agree for a full end-to-end bypass. Testing / e2e only.
 */
const ALLOW_PAST_DEPARTURE =
  process.env.NEXT_PUBLIC_ALLOW_PAST_DEPARTURE === 'true';

/**
 * Formats a `Date` as the local-time string `<input type="datetime-local">`
 * expects: `YYYY-MM-DDTHH:mm` — local, no seconds, no `Z`. Used to seed the
 * field `min` so the native picker can't offer past instants. Computed after
 * mount only (never on the server) to avoid an SSR/client hydration mismatch.
 */
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

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
  const tBlocked = useTranslations('carrier.delegations.blocked');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const fleetQ = useMyFleet();

  // Carrier-readiness gate. While loading we render the form skeleton; if the
  // carrier isn't ready we replace the form with a generic blocking state.
  const eligibilityQ = useDelegationEligibility();
  // Defense in depth: a 422 CARRIER_NOT_READY on submit (state changed since
  // page load) flips this latch, swapping the form for the same blocked view.
  const [blockedBySubmit, setBlockedBySubmit] = useState(false);
  const blocked = eligibilityQ.data?.canCreate === false || blockedBySubmit;

  // `min` for the departure picker. Left `undefined` on the server + first
  // client paint (so SSR and hydration agree — a `new Date()` baked inline
  // would differ between renders), then filled in post-mount. It's a soft UX
  // hint only; the hard blocks are the pre-submit check + the 422 backstop.
  const [departureMin, setDepartureMin] = useState<string | undefined>(
    undefined,
  );

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
    // Compute `min` only after mount — never during SSR — so the initial HTML
    // matches the first client render (no hydration mismatch). Skipped when the
    // past-departure block is bypassed.
    if (!ALLOW_PAST_DEPARTURE) {
      // Floor the picker at `now - grace` so the native control mirrors the
      // server's grace window (a carrier picking "now" stays valid for a few
      // minutes of form fill-in). Same `DEPARTURE_PAST_GRACE_MS` as the api.
      setDepartureMin(toDatetimeLocal(new Date(Date.now() - DEPARTURE_PAST_GRACE_MS)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitM = useSubmitDelegation({
    onSuccess: () => {
      draft.clear();
      toast.success(t('registeredToast'));
      router.push('/carrier/delegations');
    },
    onError: (err) => {
      // Defense in depth: readiness can change between page load and submit
      // (e.g. the opiekun deactivated the last active driver). Surface the
      // SAME generic blocked view + a generic toast — never the raw detail,
      // and never a breakdown of what's missing (product decision).
      if (isCarrierNotReady(err)) {
        setBlockedBySubmit(true);
        toast.error(tBlocked('toast'));
        return;
      }
      // Backstop for the past-departure rule when the web/api flags drift, or
      // clock skew slips a past date past the inline pre-check. Surface the
      // same inline field error as the client-side block.
      if (isDepartureInPast(err)) {
        form.setError('departureAt', { message: tForm('departureInPast') });
        form.setFocus('departureAt');
        return;
      }
      const msg =
        err instanceof Error ? err.message : t('registerErrorToast');
      toast.error(msg);
    },
  });

  const onSubmit = form.handleSubmit(
    (values) => {
      // Instant client-side hard block — no round-trip. `values.departureAt` is
      // already a full ISO string here (the field's `setValueAs` ran), so the
      // `getTime()` comparison against `Date.now()` is timezone-safe. Allow a
      // small grace window (`DEPARTURE_PAST_GRACE_MS`, shared with the api) so a
      // carrier who picks "now" isn't rejected for the seconds spent submitting.
      // The 422 backstop in `onError` covers flag-drift / clock-skew leaks.
      if (
        !ALLOW_PAST_DEPARTURE &&
        values.departureAt &&
        new Date(values.departureAt).getTime() < Date.now() - DEPARTURE_PAST_GRACE_MS
      ) {
        form.setError('departureAt', { message: tForm('departureInPast') });
        form.setFocus('departureAt');
        return;
      }

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

      {eligibilityQ.isLoading ? (
        // Form skeleton while we resolve carrier readiness.
        <div className="bg-card rounded-lg border border-border p-5 space-y-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-5 w-32" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ) : blocked ? (
        // Generic blocking state — the carrier's data isn't complete enough to
        // register a trip. No breakdown of what's missing (product decision);
        // the carrier is directed to their opiekun. No bypass.
        <div className="bg-card rounded-lg border border-border p-2">
          <EmptyState
            icon={ShieldAlert}
            title={tBlocked('title')}
            message={tBlocked('message')}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push('/carrier/delegations')}
              >
                {t('backToList')}
              </Button>
            }
          />
        </div>
      ) : (
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
                  </option>
                ))}
              </Select>
            </FormField>

            <FormGrid cols={2}>
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
            </FormGrid>
          </FormSection>

          <FormSection title={tForm('sectionDeparture')}>
            {/* Original mobile layout was 1-col (`grid-cols-1 md:grid-cols-3`);
                FormGrid cols=3 defaults to a 2-col mobile base, so override
                back to `grid-cols-1` to preserve the single-column phone stack
                for these 3-field address rows. */}
            <FormGrid cols={3} className="grid-cols-1">
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
                  min={departureMin}
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
            </FormGrid>
          </FormSection>

          <FormSection title={tForm('sectionReturn')}>
            <FormGrid cols={3} className="grid-cols-1">
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
            </FormGrid>
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
      )}
    </section>
  );
}
