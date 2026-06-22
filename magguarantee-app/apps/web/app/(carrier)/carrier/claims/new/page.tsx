'use client';

// Phase 3 — new-claim form. Two-column layout per docs/14: RHF form on the
// left, <LivePreviewPanel> on the right. The preview is debounced 400ms after
// any field change and fired against POST /claims/preview. Submit is disabled
// while the preview is loading or returned an error.
//
// Phase 7.10 REWORK (2026-06-20 #4, docs/14 §7.10.3): the carrier no longer
// types the period. They PICK one of their claimable outings
// (`GET /delegations?claimable=true` → {w_trasie, zjechal} with no linked
// wniosek). The chosen `delegationId` is sent to preview/submit; the PERIOD
// (`dateStart`/`dateEnd`) + the default `mileage` come BACK from the preview
// (server-derived) and render read-only / pre-filled. `timeFrom`/`timeTo` stay
// form fields (`timeFrom` pre-filled from the outing's `departureAt` time).
//
// When a `w_trasie` outing is picked the preview returns
// `delegationWarning='NOT_YET_RETURNED'` → a soft warning banner + an inline
// soft-confirm checkbox gate (§7.10.3, the recommended option). `zjechal`
// outings submit straight through; `gotowy`/`zgloszony` never appear in the
// picker (the api doesn't return them).

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
  DELEGATION_NOT_YET_RETURNED_WARNING,
  type DateRuleViolation,
  type ExcludedDayDto,
  type PreviewClaimDto,
  type SubmitClaimDto,
} from '@magguarantee/shared';

import { LivePreviewPanel } from '@/components/carrier/LivePreviewPanel';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FormGrid, FormSection } from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { formatDateFull } from '@/lib/format/numbers';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useClaimPreview, useSubmitClaim } from '@/lib/hooks/useClaims';
import { useClaimableDelegations } from '@/lib/hooks/useDelegations';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFormDraft } from '@/lib/hooks/useFormDraft';
import { useMyFleet } from '@/lib/hooks/useMyFleet';

const DRAFT_KEY = 'draft:carrier:newClaim';

// ── AppConfig mirrors (tier-1 pre-calc rules — api is authoritative) ──
const CLIENT_MAX_DAYS_AFTER_UNLOAD = 7;
const CLIENT_MAX_PERIOD_DAYS = 90;

// Keys allowed in the carrier submit form. Used to filter the sessionStorage
// draft so removed keys cannot resurrect themselves on hydrate and trip Zod
// `.strict()`. Phase 7.10: `dateStart`/`dateEnd` were REMOVED (period is now
// server-derived from the outing) and `delegationId` was ADDED. A stale draft
// carrying the old `dateStart`/`dateEnd` keys would otherwise break submit.
const FORM_ALLOWED_KEYS = [
  'vehicleId',
  'delegationId',
  'trailerId',
  'driverId',
  'timeFrom',
  'timeTo',
  'mileage',
  'comment',
  'attachmentIds',
] as const;

// The form's editable values. `delegationId` is REQUIRED on submit; the
// period is server-derived and never lives in the form. `mileage` stays
// editable (override of the server prefill).
interface FormValues {
  vehicleId: string;
  delegationId: string;
  trailerId?: string;
  driverId?: string;
  timeFrom: string;
  timeTo: string;
  mileage: number;
  comment?: string;
  attachmentIds?: string[];
}

function getDefaults(): FormValues {
  return {
    vehicleId: '',
    delegationId: '',
    trailerId: undefined,
    driverId: undefined,
    // timeFrom / timeTo are NOT NULL since phase3_blocks. Empty string keeps
    // the <input type="time"> controlled; the submit gate rejects "".
    timeFrom: '',
    timeTo: '',
    mileage: 0,
    comment: undefined,
    attachmentIds: undefined,
  };
}

/**
 * Drop unknown keys from a persisted draft before `form.reset(draft)`. Without
 * this filter a returning user's saved draft re-introduces removed keys (e.g.
 * the old `dateStart`/`dateEnd`), Zod `.strict()` rejects the whole form, and
 * the user sees a permanently invalid form with no visible offending field.
 */
function sanitizeDraft(draft: Record<string, unknown>): Partial<FormValues> {
  const out: Record<string, unknown> = {};
  for (const key of FORM_ALLOWED_KEYS) {
    if (key in draft) out[key] = draft[key];
  }
  return out as Partial<FormValues>;
}

const BUSINESS_TZ = 'Europe/Warsaw';

/** `YYYY-MM-DD` of today in the business timezone (Europe/Warsaw). */
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

/** Extract the `HH:mm` portion from an ISO datetime (local-zone agnostic — the
 *  api stores the carrier's claimed window verbatim, the slice mirrors it). */
function timeFromIso(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m?.[1] ?? '';
}

export default function NewClaimPage() {
  const t = useTranslations('carrier.claims');
  const tForm = useTranslations('carrier.claims.form');
  const tPicker = useTranslations('carrier.claims.wyjazdPicker');
  const tCommon = useTranslations('common');
  const router = useRouter();
  // Include deactivated vehicles — a wniosek can reference a vehicle that
  // worked the period and was deactivated afterwards.
  const fleetQ = useMyFleet({ includeInactive: true });
  const delegationsQ = useClaimableDelegations();
  const delegations = useMemo(
    () => delegationsQ.data?.items ?? [],
    [delegationsQ.data],
  );

  const form = useForm<FormValues>({
    // No zodResolver here: the submit body is assembled + validated against
    // SubmitClaimSchema at mutate time (api re-validates). The required-gate
    // below is the load-bearing client block.
    defaultValues: getDefaults(),
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

  // The currently-selected outing (drives the picker context + the warning).
  const selectedDelegation = useMemo(
    () => delegations.find((d) => d.id === watched.delegationId) ?? null,
    [delegations, watched.delegationId],
  );

  // ── Prefill vehicle + timeFrom from the chosen outing ────────────────
  // Picking an outing pre-selects its vehicle (the wniosek is against that
  // vehicle) and seeds `timeFrom` from the outing's `departureAt` time — both
  // overridable. Guarded on the *current* form value so a manual edit is never
  // clobbered.
  useEffect(() => {
    if (!selectedDelegation) return;
    if (!form.getValues('vehicleId')) {
      form.setValue('vehicleId', selectedDelegation.vehicleId, {
        shouldDirty: false,
      });
    }
    const seedTime = timeFromIso(selectedDelegation.departureAt);
    if (seedTime && !form.getValues('timeFrom')) {
      form.setValue('timeFrom', seedTime, { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDelegation?.id]);

  // ── Preview body — keyed off delegationId (period derived server-side) ──
  // We send `delegationId` and OMIT the dates; the api derives the period and
  // returns `dateStart`/`dateEnd` (+ `delegationWarning` for w_trasie). Mileage
  // is omitted until the carrier types a positive override so the server prefill
  // (`Σ VehicleDailyKm`) drives the math.
  const { previewBody, emptyReason } = useMemo<{
    previewBody: PreviewClaimDto | null;
    emptyReason: 'incomplete' | undefined;
  }>(() => {
    if (!watched.vehicleId || !watched.delegationId) {
      return { previewBody: null, emptyReason: 'incomplete' };
    }
    const hasMileage =
      typeof watched.mileage === 'number' &&
      !Number.isNaN(watched.mileage) &&
      watched.mileage > 0;
    return {
      previewBody: {
        vehicleId: watched.vehicleId,
        delegationId: watched.delegationId,
        timeFrom: watched.timeFrom || undefined,
        timeTo: watched.timeTo || undefined,
        mileage: hasMileage ? watched.mileage : undefined,
        hoursAdjusted: 0,
      },
      emptyReason: undefined,
    };
  }, [
    watched.vehicleId,
    watched.delegationId,
    watched.mileage,
    watched.timeFrom,
    watched.timeTo,
  ]);

  const debouncedPreviewBody = useDebouncedValue(previewBody, 400);
  const previewQ = useClaimPreview(debouncedPreviewBody, {
    enabled: !!debouncedPreviewBody,
  });

  // Derived (read-only) period from the preview — the dates we'll submit.
  const derivedDateStart = previewQ.data?.dateStart;
  const derivedDateEnd = previewQ.data?.dateEnd;

  // Soft-warning: the chosen outing is still `w_trasie` (not yet `zjechal`).
  const notYetReturned =
    previewQ.data?.delegationWarning === DELEGATION_NOT_YET_RETURNED_WARNING;

  // ── Soft-confirm gate (§7.10.3) — inline checkbox. ─────────────────
  // Must be ticked before submit enables when the outing is `w_trasie`. Reset
  // whenever the warning is no longer active (different outing / now zjechal).
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    if (!notYetReturned) setAcknowledged(false);
  }, [notYetReturned, watched.delegationId]);

  // ── Mileage prefill from the preview ─────────────────────────────────
  const previewMileage = previewQ.data?.mileage;
  useEffect(() => {
    if (typeof previewMileage !== 'number' || previewMileage <= 0) return;
    const current = form.getValues('mileage');
    if (typeof current === 'number' && current > 0) return;
    form.setValue('mileage', previewMileage, {
      shouldDirty: false,
      shouldValidate: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMileage]);

  // ── Duration gate (mirror of api-side `canSubmitByDuration`) ──────────
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

  // ── Client-side tier-1 date rules — run against the DERIVED period. ──
  // The carrier no longer types dates, but the same tier-1 violations (period
  // span / 7-day deadline / future) still apply to the server-derived period;
  // surface them inline so the carrier sees them before submit. Only runs once
  // the preview returns the derived dates.
  const dateViolations = useMemo<DateRuleViolation[]>(() => {
    if (!derivedDateStart || !derivedDateEnd) return [];
    return checkClaimDates({
      dateStart: derivedDateStart,
      dateEnd: derivedDateEnd,
      today: todayBusinessTzIso(),
      maxPeriodDays: CLIENT_MAX_PERIOD_DAYS,
      maxDaysAfterUnload: CLIENT_MAX_DAYS_AFTER_UNLOAD,
    });
  }, [derivedDateStart, derivedDateEnd]);

  const clientViolations = useMemo<string[]>(
    () => dateViolations.map((v) => tForm(v.key, v.params)),
    [dateViolations, tForm],
  );
  const clientBlocked = clientViolations.length > 0;

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
      setViolations([]);
      // Assemble the SubmitClaimDto: delegationId-driven, NO dates (server
      // derives the period). Strip empty optional fields.
      const body: Record<string, unknown> = {
        vehicleId: values.vehicleId,
        delegationId: values.delegationId,
        timeFrom: values.timeFrom,
        timeTo: values.timeTo,
        mileage: values.mileage,
      };
      if (values.trailerId) body.trailerId = values.trailerId;
      if (values.driverId) body.driverId = values.driverId;
      if (values.comment) body.comment = values.comment;
      if (values.attachmentIds && values.attachmentIds.length > 0) {
        body.attachmentIds = values.attachmentIds;
      }
      const idempotencyKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : undefined;
      submitM.mutate({ body: body as SubmitClaimDto, idempotencyKey });
    },
    onInvalidToast(form.setFocus, tCommon('validationFailedToast')),
  );

  const errs = form.formState.errors;

  // Explicit required-fields gate (independent of resolver). The empty form is
  // never submittable; the soft-gate adds the w_trasie acknowledgement.
  const requiredFilled =
    !!watched.vehicleId &&
    !!watched.delegationId &&
    !!watched.timeFrom &&
    !!watched.timeTo &&
    typeof watched.mileage === 'number' &&
    watched.mileage > 0;

  // Soft-gate: when the outing is w_trasie, the acknowledgement checkbox must
  // be ticked. zjechal outings submit straight through (no gate).
  const softGateBlocked = notYetReturned && !acknowledged;

  // ── Boundary-day "time has no effect" hints (Bug 2) ──────────────────
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
    derivedDateStart,
    'boundaryHintTimeFrom',
    'boundaryHintTimeFromWeekend',
  );
  const timeToHint = boundaryHint(
    derivedDateEnd,
    'boundaryHintTimeTo',
    'boundaryHintTimeToWeekend',
  );

  const vehicles = fleetQ.data?.vehicles ?? [];
  const drivers = fleetQ.data?.drivers ?? [];
  const trailers = fleetQ.data?.trailers ?? [];

  const noClaimable =
    !delegationsQ.isLoading && delegations.length === 0;

  return (
    <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <h1 className="text-2xl font-extrabold tracking-tight text-text mb-6">
        {t('newClaim')}
      </h1>

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
              {/* ① Wyjazd selector — REPLACES the old manual period entry. */}
              <FormSection title={tPicker('section')}>
                <FormField
                  label={tPicker('label')}
                  required
                  description={tPicker('help')}
                  error={errs.delegationId?.message}
                  htmlFor="claim-delegationId"
                >
                  <Select
                    id="claim-delegationId"
                    disabled={delegationsQ.isLoading || noClaimable}
                    {...form.register('delegationId')}
                  >
                    <option value="">
                      {delegationsQ.isLoading
                        ? tPicker('loading')
                        : tPicker('placeholder')}
                    </option>
                    {delegations.map((d) => (
                      <option key={d.id} value={d.id}>
                        {(d.vehicle?.plateNumber ?? '—')} ·{' '}
                        {formatDateFull(d.departureAt)} →{' '}
                        {formatDateFull(d.actualReturnAt ?? d.plannedReturnAt)}
                      </option>
                    ))}
                  </Select>
                </FormField>

                {noClaimable && (
                  <p
                    role="status"
                    className="rounded-md border border-border bg-input px-3 py-2 text-sm text-text-sub"
                  >
                    {tPicker('empty')}
                  </p>
                )}

                {/* Selected-outing status chip (so the carrier sees zjechał vs
                    w trasie at a glance). */}
                {selectedDelegation && (
                  <div className="flex items-center gap-2 text-sm text-text-sub">
                    <span>{tPicker('selectedStatus')}</span>
                    <StatusBadge status={selectedDelegation.status} />
                  </div>
                )}

                {/* §7.10.3 — w_trasie warning banner + soft-confirm checkbox. */}
                {notYetReturned && (
                  <div className="space-y-2">
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-start gap-2 rounded-md bg-warning-bg dark:bg-warning/15 border border-warning/40 px-3 py-2"
                    >
                      <AlertTriangle
                        size={16}
                        className="text-warning-dark dark:text-warning shrink-0 mt-0.5"
                        aria-hidden
                      />
                      <p className="text-sm text-warning-dark dark:text-warning">
                        {tPicker('warningBanner')}
                      </p>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-text cursor-pointer select-none">
                      <Checkbox
                        className="mt-0.5"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                      />
                      <span>{tPicker('warningAck')}</span>
                    </label>
                  </div>
                )}

                {/* Read-only derived period (server-computed from the outing). */}
                {(derivedDateStart || derivedDateEnd) && (
                  <div className="rounded-md border border-border bg-input/40 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
                      {tPicker('derivedPeriod')}
                    </p>
                    <p className="mt-0.5 text-sm text-text tabular-nums">
                      {formatDateFull(derivedDateStart)} –{' '}
                      {formatDateFull(derivedDateEnd)}
                    </p>
                    {notYetReturned && (
                      <p className="mt-1 text-xs text-text-sub">
                        {tPicker('temporaryPeriodHint')}
                      </p>
                    )}
                  </div>
                )}
              </FormSection>

              <FormSection title={tForm('sectionVehicleAndDriver')}>
                <FormField
                  label={tForm('vehicle')}
                  required
                  error={errs.vehicleId?.message}
                  htmlFor="claim-vehicleId"
                >
                  <Select id="claim-vehicleId" {...form.register('vehicleId')}>
                    <option value="">—</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber}
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
                    <Select id="claim-driverId" {...form.register('driverId')}>
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
                    <Select id="claim-trailerId" {...form.register('trailerId')}>
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

              {/* Period is now derived (above). Only the time window stays a
                  carrier field — `timeFrom` pre-fills from the outing. */}
              <FormSection title={tForm('sectionPeriod')}>
                <FormGrid cols={2}>
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
                <FormGrid cols={2}>
                  <FormField
                    label={tForm('mileage')}
                    required
                    description={tPicker('mileageHint')}
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

              {durationMessage && (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning-dark dark:text-warning"
                >
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
                  setAcknowledged(false);
                }}
                disabled={submitting}
              >
                {tCommon('clear')}
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={
                  submitting ||
                  previewBlocked ||
                  durationBlocked ||
                  clientBlocked ||
                  !requiredFilled ||
                  softGateBlocked
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
 * to an empty list if the error doesn't carry the multi-violation shape.
 */
function extractViolations(err: unknown): string[] {
  if (!(err instanceof ApiResponseError)) return [];
  if (err.status !== 422) return [];
  const v = err.data?.violations;
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
