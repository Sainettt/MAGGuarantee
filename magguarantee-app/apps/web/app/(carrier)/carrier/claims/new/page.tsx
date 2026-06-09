'use client';

// Phase 3 — new-claim form. Two-column layout per docs/14: RHF form on the
// left, <LivePreviewPanel> on the right. The preview is debounced 400ms
// after any field change and fired against POST /claims/preview. Submit
// button is disabled while the preview is loading or returned an error.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  canSubmitByDuration,
  checkClaimDates,
  DEFAULTS as SUBMISSION_DEFAULTS,
  SubmitClaimSchema,
  type DateRuleViolation,
  type ExcludedDayDto,
  type PreviewClaimDto,
  type SubmitClaimDto,
} from '@magguarantee/shared';

import { LivePreviewPanel } from '@/components/carrier/LivePreviewPanel';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FormGrid, FormSection } from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useClaimPreview, useSubmitClaim } from '@/lib/hooks/useClaims';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

const DRAFT_KEY = 'draft:carrier:newClaim';

// ── AppConfig mirrors ───────────────────────────────────────────
// Numbers used by the api in `claims.service.ts` for tier-1 (pre-calc)
// violations. Mirrored here so the carrier-side form can preview the
// same red banner BEFORE the user clicks Submit. AppConfig is not yet
// exposed to the web (no `/app-config` endpoint); when api-agent ships
// one, swap these to a `useAppConfig()` hook. The api is still the
// authoritative source — every Submit re-runs these checks server-side.
const CLIENT_MAX_DAYS_AFTER_UNLOAD = 7;
const CLIENT_MAX_PERIOD_DAYS = 90;

// Keys allowed in the carrier submit form. Used to filter the
// sessionStorage draft so stale `amountRequested` / `hoursAdjusted`
// (removed from `SubmitClaimSchema` in shared) cannot resurrect themselves
// on hydrate and trip Zod `.strict()` validation.
const FORM_ALLOWED_KEYS = [
  'vehicleId',
  'trailerId',
  'driverId',
  'dateStart',
  'dateEnd',
  'timeFrom',
  'timeTo',
  'mileage',
  'comment',
  'attachmentIds',
] as const;

type FormValues = SubmitClaimDto;

function getDefaults(): FormValues {
  return {
    vehicleId: '' as unknown as string,
    trailerId: undefined,
    driverId: undefined,
    dateStart: '',
    dateEnd: '',
    // timeFrom / timeTo are NOT NULL since phase3_blocks. Empty string keeps
    // the <input type="time"> controlled; HhMmSchema rejects "" on submit.
    timeFrom: '',
    timeTo: '',
    mileage: 0,
    comment: undefined,
    // orderNumber / orderDate are intentionally NOT in the carrier submit
    // DTO (phase3_blocks): they're MAGTRANS-internal and assigned by the
    // verifier when transitioning to ZAAKCEPTOWANO.
    attachmentIds: undefined,
  };
}

/**
 * Drop unknown keys from a persisted draft before `form.reset(draft)`.
 * `amountRequested` / `hoursAdjusted` were removed from `SubmitClaimSchema`
 * — without this filter, a returning user's saved draft re-introduces them,
 * Zod `.strict()` rejects the whole form on the next change, and the user
 * sees a permanently invalid form with no visible offending field.
 */
function sanitizeDraft(draft: Record<string, unknown>): Partial<FormValues> {
  const out: Record<string, unknown> = {};
  for (const key of FORM_ALLOWED_KEYS) {
    if (key in draft) out[key] = draft[key];
  }
  return out as Partial<FormValues>;
}

const BUSINESS_TZ = 'Europe/Warsaw';

/**
 * `YYYY-MM-DD` of today in the business timezone (Europe/Warsaw — MAGTRANS
 * operating timezone). Used both for the `<input type="date" max=...>` cap
 * and as the injected `today` argument to the shared `checkClaimDates` rules
 * (which are pure — they never read the wall clock themselves).
 *
 * Computing the date in Europe/Warsaw avoids the old bug where a UTC-derived
 * "today" rolled back a day between local midnight and ~02:00, producing
 * false "date in future" violations.
 */
function todayBusinessTzIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** `'2026-06-04'` → `'04.06'` for compact inline hints (pl-PL day.month). */
function formatDayMonth(iso: string): string {
  const parts = iso.split('-');
  return `${parts[2]}.${parts[1]}`;
}

const WEEKDAY_TZ_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
});

/** True if the `YYYY-MM-DD` calendar date falls on Sat/Sun. */
function isWeekendIso(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return false;
  const wd = WEEKDAY_TZ_FMT.format(d);
  return wd === 'Sat' || wd === 'Sun';
}

export default function NewClaimPage() {
  const t = useTranslations('carrier.claims');
  const tForm = useTranslations('carrier.claims.form');
  const tCommon = useTranslations('common');
  const router = useRouter();
  // Include deactivated vehicles in the dropdown — a wniosek can legitimately
  // reference a vehicle that worked the period and was deactivated afterwards.
  // Inactive rows are tagged "(nieaktywny)" in the option label below.
  const fleetQ = useMyFleet({ includeInactive: true });

  const form = useForm<FormValues>({
    resolver: zodResolver(SubmitClaimSchema),
    defaultValues: getDefaults(),
    // `onTouched` + `reValidateMode: 'onChange'`: validate a field once the
    // user has touched (blurred) it, then re-validate live on every change.
    // The previous `onChange` mode ran the cross-field date refine against the
    // empty-string `dateEnd` default the instant a start date was picked —
    // part of Bug 1. With `onTouched` the dateEnd refine waits until dateEnd
    // is actually touched, and the schema-side guard (datesWellOrdered) no
    // longer compares against an empty string anyway. Submit gating does NOT
    // rely on `formState.isValid` alone — see the disabled logic below.
    mode: 'onTouched',
    reValidateMode: 'onChange',
  });

  const draft = useFormDraft(form, DRAFT_KEY, {
    enabled: true,
    sanitize: sanitizeDraft,
  });

  useEffect(() => {
    draft.hydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const watched = form.watch();

  // Build a preview body when the form has the bare minimum filled. Server
  // is the source of truth — we don't compute anything locally.
  //
  // `hoursAdjusted` is pinned to 0 for the carrier form: it was removed from
  // the carrier submit DTO entirely and on submit the api always feeds 0
  // into km-calc. `PreviewClaimSchema` still carries the key (for the
  // verifier modal's recalc badge) so we have to satisfy the TS type — but
  // semantically the carrier preview always asks "what would the payout be
  // with zero downtime?" exactly the same as `submit` does.
  // `emptyReason` lets the right-hand <LivePreviewPanel> show *why* it's
  // empty instead of the generic "fill in fields" placeholder. Particularly
  // important for the `date-order` case: a user editing dateStart to a
  // value later than dateEnd (planning to bump dateEnd next) would
  // otherwise see the preview silently vanish with no explanation.
  const { previewBody, emptyReason } = useMemo<{
    previewBody: PreviewClaimDto | null;
    emptyReason: 'incomplete' | 'date-order' | 'mileage-zero' | undefined;
  }>(() => {
    if (!watched.vehicleId || !watched.dateStart || !watched.dateEnd) {
      return { previewBody: null, emptyReason: 'incomplete' };
    }
    if (watched.dateStart > watched.dateEnd) {
      return { previewBody: null, emptyReason: 'date-order' };
    }
    if (
      typeof watched.mileage !== 'number' ||
      Number.isNaN(watched.mileage) ||
      watched.mileage <= 0
    ) {
      return { previewBody: null, emptyReason: 'mileage-zero' };
    }
    return {
      previewBody: {
        vehicleId: watched.vehicleId,
        dateStart: watched.dateStart,
        dateEnd: watched.dateEnd,
        timeFrom: watched.timeFrom || undefined,
        timeTo: watched.timeTo || undefined,
        mileage: watched.mileage,
        hoursAdjusted: 0,
      },
      emptyReason: undefined,
    };
  }, [
    watched.vehicleId,
    watched.dateStart,
    watched.dateEnd,
    watched.mileage,
    watched.timeFrom,
    watched.timeTo,
  ]);

  // Debounce 400ms before firing the preview request.
  const debouncedPreviewBody = useDebouncedValue(previewBody, 400);
  const previewQ = useClaimPreview(debouncedPreviewBody, {
    enabled: !!debouncedPreviewBody,
  });

  // ── Duration gate (mirror of api-side `canSubmitByDuration`) ──────
  // Evaluated client-side so the submit button can disable + show an
  // inline hint BEFORE we hit the API. The api re-checks with the same
  // shared function, so this is purely UX — never a security boundary.
  //
  // Reads `totalDays` from the live km-calc preview (same engine the api
  // uses on submit). While the preview is still loading we hold the gate
  // open — the api re-checks anyway, and surfacing a stale "rejected"
  // banner during typing is worse than a brief moment of optimism.
  //
  // Threshold (default 10, boundary inclusive — 10.00 passes, 9.99 does
  // not): we read `DEFAULTS.workedDaysThreshold` from `@magguarantee/shared`
  // until a `GET /app-config` endpoint exists. TODO: swap to a
  // `useAppConfig()` hook once api-agent ships it.
  const previewTotalDays = previewQ.data?.breakdown?.totalDays;
  const durationGate = useMemo(() => {
    if (previewTotalDays === undefined) return null;
    return canSubmitByDuration({
      totalDays: previewTotalDays,
      workedDaysThreshold: SUBMISSION_DEFAULTS.workedDaysThreshold,
    });
  }, [previewTotalDays]);
  const durationBlocked = durationGate?.ok === false;
  const durationMessage =
    durationGate && !durationGate.ok ? durationGate.message : null;

  // ── Client-side tier-1 business rules ────────────────────────
  // Mirror the pre-calc violations the api throws in `ClaimsService.submit`
  // so the carrier sees the same red-banner immediately on date entry, not
  // only after Submit. The api re-checks everything — this is purely UX.
  //
  // The rule logic itself lives in `checkClaimDates` (@magguarantee/shared) so
  // the web and api share ONE definition of "what's an acceptable date pair".
  // `today` is injected (business TZ) — the shared fn is pure and never reads
  // the clock. AppConfig values are mirrored as constants until a
  // `GET /app-config` endpoint exists; the api forwards the real AppConfig.
  // Each returned violation carries an i18n key + params → render via tForm.
  const dateViolations = useMemo<DateRuleViolation[]>(() => {
    return checkClaimDates({
      dateStart: watched.dateStart ?? '',
      dateEnd: watched.dateEnd ?? '',
      today: todayBusinessTzIso(),
      maxPeriodDays: CLIENT_MAX_PERIOD_DAYS,
      maxDaysAfterUnload: CLIENT_MAX_DAYS_AFTER_UNLOAD,
    });
  }, [watched.dateStart, watched.dateEnd]);

  const clientViolations = useMemo<string[]>(
    () => dateViolations.map((v) => tForm(v.key, v.params)),
    [dateViolations, tForm],
  );
  const clientBlocked = clientViolations.length > 0;

  // Server-side business-rule violations from the 422 envelope (rendered as
  // a sticky banner above the form). Cleared on every fresh submit attempt
  // so the user only sees current issues.
  const [violations, setViolations] = useState<string[]>([]);
  const violationsRef = useRef<HTMLDivElement | null>(null);

  const submitM = useSubmitClaim({
    onSuccess: (claim) => {
      setViolations([]);
      draft.clear();
      toast.success(t('submittedToast', { nrZgl: claim.nrZgl }));
      router.push(`/carrier/claims/${encodeURIComponent(claim.nrZgl)}`);
    },
    onError: (err) => {
      const list = extractViolations(err);
      if (list.length > 0) {
        setViolations(list);
        // Scroll to banner so the user sees it even with a long form.
        requestAnimationFrame(() =>
          violationsRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
          }),
        );
        toast.error(t('violationsToast'));
        return;
      }
      const msg = err instanceof Error ? err.message : t('submitErrorToast');
      toast.error(msg);
    },
  });

  const submitting = submitM.isPending;
  const previewBlocked =
    previewQ.isLoading || (previewQ.isError && !previewQ.data);

  const onSubmit = form.handleSubmit(
    (values) => {
      setViolations([]); // hide stale banner before the new round trip
      // Strip empty strings so optional fields go through Zod cleanly.
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v === '' || v === undefined) continue;
        cleaned[k] = v;
      }
      // Use a fresh idempotency key so refresh + resubmit doesn't double-insert.
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined;
      submitM.mutate({ body: cleaned as SubmitClaimDto, idempotencyKey });
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const errs = form.formState.errors;

  // The cross-field refine in SubmitClaimSchema attaches the STABLE MACHINE
  // CODE 'date_order' to `dateEnd` (the api echoes Zod issue.message verbatim;
  // the web owns i18n). Map it to a localized message here so the raw code can
  // never reach the UI. All other dateEnd errors (format/required) are already
  // localized strings from the resolver and pass through untouched.
  const dateEndError =
    errs.dateEnd?.message === 'date_order'
      ? tForm('violationDateOrder')
      : errs.dateEnd?.message;

  // Explicit required-fields gate — independent of `formState.isValid`.
  // With `mode: 'onTouched'`, `isValid` does track the resolver, but an
  // untouched fresh form should never be submittable regardless of how RHF
  // chooses to lazily evaluate validity. This gate is the load-bearing block
  // for the empty-form case; `isValid` then adds format-level blocking once
  // fields are touched. (The api re-validates everything — this is UX only.)
  const requiredFilled =
    !!watched.vehicleId &&
    !!watched.dateStart &&
    !!watched.dateEnd &&
    !!watched.timeFrom &&
    !!watched.timeTo &&
    typeof watched.mileage === 'number' &&
    watched.mileage > 0;

  // ── Bug 2 feedback — boundary-day "time has no effect" hints ──────
  // The engine's `timeFrom` / `timeTo` only scale the FIRST / LAST calendar
  // day's working fraction. When that boundary day is dropped from the count
  // (weekend, Polish holiday, EU heavy-vehicle ban day), changing the time
  // recalcs but the km is unchanged — so the field looks like a no-op. The
  // engine is correct; this is a targeted inline explanation tied to the
  // boundary day, distinct from the full excluded-days list in BreakdownTable.
  //
  // An excluded day's reason label comes from the engine (`ExcludedDay.label`,
  // e.g. "Boże Ciało"); weekends aren't in `excludedDays` (universal, omitted
  // there by design) so we detect those locally with `isWeekendIso`.
  const excludedByDate = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>();
    const months = previewQ.data?.breakdown?.breakdown ?? [];
    for (const m of months) {
      for (const ex of (m.excludedDays ?? []) as ExcludedDayDto[]) {
        map.set(ex.date, ex.label);
      }
    }
    return map;
  }, [previewQ.data]);

  function boundaryHint(
    iso: string | undefined,
    holidayKey: 'boundaryHintTimeFrom' | 'boundaryHintTimeTo',
    weekendKey: 'boundaryHintTimeFromWeekend' | 'boundaryHintTimeToWeekend',
  ): string | null {
    if (!iso) return null;
    const label = excludedByDate.get(iso);
    if (label) {
      return tForm(holidayKey, { date: formatDayMonth(iso), reason: label });
    }
    if (isWeekendIso(iso)) {
      return tForm(weekendKey, { date: formatDayMonth(iso) });
    }
    return null;
  }

  const timeFromHint = boundaryHint(
    watched.dateStart,
    'boundaryHintTimeFrom',
    'boundaryHintTimeFromWeekend',
  );
  const timeToHint = boundaryHint(
    watched.dateEnd,
    'boundaryHintTimeTo',
    'boundaryHintTimeToWeekend',
  );

  const vehicles = fleetQ.data?.vehicles ?? [];
  const drivers = fleetQ.data?.drivers ?? [];
  const trailers = fleetQ.data?.trailers ?? [];

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-text mb-6">
        {t('newClaim')}
      </h1>

      {/*
        Two violation sources feed the red banner:
        1. `clientViolations` — synchronous tier-1 rules (period span, 7-day
           deadline, future dates). Recomputed on every keystroke so the
           carrier sees the same red message the api would throw on Submit,
           but BEFORE round-tripping. Cannot be dismissed — they disappear
           the moment the user fixes the underlying field.
        2. `violations` — 422 envelope from a real Submit attempt. Sticky:
           the user explicitly dismisses with the X (or a fresh Submit
           clears them automatically).
        Both render the same shell; only the dismiss affordance differs.
      */}
      {(violations.length > 0 || clientViolations.length > 0) && (() => {
        const combined = [...clientViolations, ...violations];
        return (
          <div
            ref={violationsRef}
            role="alert"
            className="mb-6 rounded-lg border border-danger/40 bg-danger-bg dark:bg-danger/10 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={20}
                className="mt-0.5 flex-none text-danger"
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-danger-dark dark:text-danger">
                  {combined.length === 1
                    ? t('violationsHeadingOne')
                    : t('violationsHeadingMany', { count: combined.length })}
                </h2>
                <ul className="mt-2 space-y-1.5 text-sm text-text">
                  {combined.map((v, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden className="text-danger">•</span>
                      <span className="flex-1">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Only the api-side stack is dismissible — client-side
                  violations are reactive to form state, so they reappear
                  immediately anyway. Showing the X only when there's a
                  sticky 422 in play keeps the affordance honest. */}
              {violations.length > 0 && (
                <button
                  type="button"
                  onClick={() => setViolations([])}
                  aria-label={tCommon('clear')}
                  className="flex-none rounded-md p-1 text-text-sub hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-danger/40"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
          {/* Left — RHF form */}
          <div className="space-y-6">
            <div className="bg-card rounded-lg border border-border p-5 space-y-6">
              <FormSection title={tForm('sectionVehicleAndDriver')}>
                <FormField
                  label={tForm('vehicle')}
                  required
                  error={errs.vehicleId?.message}
                  htmlFor="claim-vehicleId"
                >
                  <Select
                    id="claim-vehicleId"
                    {...form.register('vehicleId')}
                  >
                    <option value="">—</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber}
                        {v.brand || v.model
                          ? ` — ${[v.brand, v.model].filter(Boolean).join(' ')}`
                          : ''}
                        {!v.active ? ` ${tCommon('inactiveSuffix')}` : ''}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormGrid cols={2}>
                  <FormField
                    label={tForm('driver')}
                    error={errs.driverId?.message}
                    htmlFor="claim-driverId"
                  >
                    <Select
                      id="claim-driverId"
                      {...form.register('driverId')}
                    >
                      <option value="">—</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.firstName} {d.lastName}
                          {!d.active ? ` ${tCommon('inactiveSuffix')}` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                  <FormField
                    label={tForm('trailer')}
                    error={errs.trailerId?.message}
                    htmlFor="claim-trailerId"
                  >
                    <Select
                      id="claim-trailerId"
                      {...form.register('trailerId')}
                    >
                      <option value="">—</option>
                      {trailers.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.plateNumber}
                          {tr.trailerTypeName ? ` (${tr.trailerTypeName})` : ''}
                          {!tr.active ? ` ${tCommon('inactiveSuffix')}` : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </FormGrid>
              </FormSection>

              <FormSection title={tForm('sectionPeriod')}>
                <FormGrid cols={2}>
                  <FormField
                    label={tForm('dateStart')}
                    required
                    error={errs.dateStart?.message}
                    htmlFor="claim-dateStart"
                  >
                    <Input
                      id="claim-dateStart"
                      type="date"
                      className="h-10"
                      max={todayBusinessTzIso()}
                      {...form.register('dateStart')}
                    />
                  </FormField>
                  <FormField
                    label={tForm('dateEnd')}
                    required
                    error={dateEndError}
                    htmlFor="claim-dateEnd"
                  >
                    <Input
                      id="claim-dateEnd"
                      type="date"
                      className="h-10"
                      max={todayBusinessTzIso()}
                      {...form.register('dateEnd')}
                    />
                  </FormField>
                  <div>
                    <FormField
                      label={tForm('timeFrom')}
                      required
                      error={errs.timeFrom?.message}
                      htmlFor="claim-timeFrom"
                    >
                      <Input
                        id="claim-timeFrom"
                        type="time"
                        className="h-10"
                        {...form.register('timeFrom')}
                      />
                    </FormField>
                    {timeFromHint && (
                      <p
                        role="status"
                        aria-live="polite"
                        className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-dark dark:text-warning"
                      >
                        {timeFromHint}
                      </p>
                    )}
                  </div>
                  <div>
                    <FormField
                      label={tForm('timeTo')}
                      required
                      error={errs.timeTo?.message}
                      htmlFor="claim-timeTo"
                    >
                      <Input
                        id="claim-timeTo"
                        type="time"
                        className="h-10"
                        {...form.register('timeTo')}
                      />
                    </FormField>
                    {timeToHint && (
                      <p
                        role="status"
                        aria-live="polite"
                        className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-dark dark:text-warning"
                      >
                        {timeToHint}
                      </p>
                    )}
                  </div>
                </FormGrid>
              </FormSection>

              <FormSection title={tForm('sectionValues')}>
                {/*
                  Only mileage is carrier-editable now. `amountRequested` is
                  derived server-side from `calc.paymentEur` (see api
                  claims.service.ts:353); `hoursAdjusted` was moved to the
                  verifier-only PATCH path and hard-coded to 0 on submit.
                  The live `paymentEur` value the carrier will be requesting
                  is visible in the right-hand <LivePreviewPanel> stat grid.
                */}
                <FormGrid cols={2}>
                  <FormField
                    label={tForm('mileage')}
                    required
                    error={errs.mileage?.message}
                    htmlFor="claim-mileage"
                  >
                    <Input
                      id="claim-mileage"
                      type="number"
                      step="0.01"
                      min={0}
                      className="h-10"
                      {...form.register('mileage', {
                        setValueAs: (v) =>
                          v === '' || v === null ? 0 : Number(v),
                      })}
                    />
                  </FormField>
                </FormGrid>
              </FormSection>

              {/*
                orderNumber / orderDate were removed from the carrier submit
                DTO in phase3_blocks — they are MAGTRANS-internal and filled
                in by the verifier on PATCH /claims/:nrZgl when transitioning
                to ZAAKCEPTOWANO. The carrier-side form keeps just the
                comment field.
              */}
              {durationMessage && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-dark dark:text-warning"
                >
                  {/* Polish, fully-rendered by shared/canSubmitByDuration. We
                      do not prepend anything — the message already names both
                      thresholds and the carrier's current values. */}
                  {durationMessage}
                </div>
              )}

              <details>
                <summary className="cursor-pointer text-sm font-semibold text-text-sub hover:text-text">
                  {tForm('addComment')}
                </summary>
                <div className="mt-4 space-y-4">
                  <FormField
                    label={tForm('comment')}
                    error={errs.comment?.message}
                    htmlFor="claim-comment"
                  >
                    <Textarea
                      id="claim-comment"
                      rows={3}
                      {...form.register('comment')}
                    />
                  </FormField>
                </div>
              </details>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  draft.clear();
                  form.reset(getDefaults());
                }}
                disabled={submitting}
              >
                {tCommon('clear')}
              </Button>
              <Button
                type="submit"
                size="lg"
                // Disabled if any of: (a) an in-flight submit, (b) preview
                // failed for current input, (c) duration gate (<10 days),
                // (d) client-side tier-1 violations (period span / 7-day
                // deadline / future dates / order), (e) required fields not
                // all filled (independent gate — blocks the untouched empty
                // form even before RHF lazily computes validity under
                // `mode: 'onTouched'`), (f) RHF schema invalid (format-level).
                disabled={
                  submitting ||
                  previewBlocked ||
                  durationBlocked ||
                  clientBlocked ||
                  !requiredFilled ||
                  !form.formState.isValid
                }
              >
                {submitting ? t('submitting') : t('submit')}
              </Button>
            </div>
          </div>

          {/* Right — Live preview */}
          <div>
            <LivePreviewPanel
              data={previewQ.data}
              isLoading={previewQ.isFetching}
              isError={previewQ.isError}
              isEmpty={!previewBody}
              emptyReason={emptyReason}
            />
          </div>
        </div>
      </form>
    </section>
  );
}

/**
 * Parse the `violations: string[]` array out of a 422 envelope. Falls back
 * to an empty list if the error doesn't carry the multi-violation shape
 * (e.g. plain 500 / 401 / network error).
 */
function extractViolations(err: unknown): string[] {
  if (!(err instanceof ApiResponseError)) return [];
  if (err.status !== 422) return [];
  const v = err.data?.violations;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
