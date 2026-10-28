'use client';

// Phase 3 — new-claim form. Two-column layout per docs/14: RHF form on the
// left, <LivePreviewPanel> on the right. The preview is debounced 400ms after
// any field change and fired against POST /claims/preview. Submit is disabled
// while the preview is loading or returned an error.
//
// The carrier PICKS one of its claimable outings (`GET /delegations?claimable=
// true` → only `zjechal` outings with no linked wniosek) AND DECLARES the facts
// of the trip: period, time window and mileage.
//
// ⚠️ REWORK 2026-07-30 — the declared facts came back. Between 2026-06-20 and
// this rework the period/times/mileage were derived server-side (from the
// outing's actual datetimes and the weryfikator's daily-km board) and rendered
// read-only here. Customer decision reversed that: the money follows the
// mileage in SpedTrans while the weryfikator's per-day km come from a different
// external system, so the two never agree. The carrier states its own figures,
// `pracownik` reconciles them at verification against the weryfikator's — which
// the ClaimModal now shows side-by-side.
//
// What the outing still decides: the vehicle / trailer / driver (rendered
// read-only below) and the FLOOR for `dateStart` — the declared loading date
// may not precede the departure the carrier itself reported when registering
// the outing (the `min` attribute below mirrors the api's 422
// `CLAIM_DATE_BEFORE_DEPARTURE`).
//
// Deliberately absent (customer decision): no prefill from the outing, no
// "your mileage differs from the board" hint. Both would nudge the carrier
// toward a number the business does not pay on.

import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  businessDateIso,
  canSubmitByDuration,
  checkClaimDates,
  DEFAULTS as SUBMISSION_DEFAULTS,
  type DateRuleViolation,
  type PreviewClaimDto,
  type SubmitClaimDto,
  VEHICLE_NOT_GUARANTEED,
} from '@magguarantee/shared';

import { LivePreviewPanel } from '@/components/carrier/LivePreviewPanel';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import {
  FormDescription,
  FormField,
  FormGrid,
  FormItem,
  FormLabel,
  FormSection,
} from '@/components/forms/Form';
import { ApiResponseError } from '@/lib/api/client';
import { formatDateFull, formatWallClockDate } from '@/lib/format/numbers';
import { onInvalidToast } from '@/lib/forms/onInvalidToast';
import { useClaimPreview, useSubmitClaim } from '@/lib/hooks/useClaims';
import { useClaimableDelegations } from '@/lib/hooks/useDelegations';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { useFormDraft } from '@/lib/hooks/useFormDraft';

const DRAFT_KEY = 'draft:carrier:newClaim';

// ── AppConfig mirrors (tier-1 pre-calc rules — api is authoritative) ──
const CLIENT_MAX_DAYS_AFTER_UNLOAD = 7;
const CLIENT_MAX_PERIOD_DAYS = 90;

// Keys allowed in the carrier submit form. Used to filter the sessionStorage
// draft so keys that are not part of the current body cannot resurrect
// themselves on hydrate and trip the backend's Zod `.strict()`.
//
// REWORK 2026-07-30 re-ADDED `dateStart`/`dateEnd`/`timeFrom`/`timeTo`/
// `mileage`. `vehicleId`/`trailerId`/`driverId` stay OUT — those really are
// derived from the outing.
const FORM_ALLOWED_KEYS = [
  'delegationId',
  'dateStart',
  'dateEnd',
  'timeFrom',
  'timeTo',
  'mileage',
  'comment',
  'attachmentIds',
] as const;

// The form's editable values. All of `delegationId` + the five declared facts
// are REQUIRED; vehicle / trailer / driver stay server-derived from the outing
// and are rendered read-only.
interface FormValues {
  delegationId: string;
  dateStart: string;
  dateEnd: string;
  timeFrom: string;
  timeTo: string;
  /** Kept as a string — a number input yields `''` when cleared. */
  mileage: string;
  comment?: string;
  attachmentIds?: string[];
}

function getDefaults(): FormValues {
  return {
    delegationId: '',
    // Deliberately blank: no prefill from the outing (customer decision).
    dateStart: '',
    dateEnd: '',
    timeFrom: '',
    timeTo: '',
    mileage: '',
    comment: undefined,
    attachmentIds: undefined,
  };
}

/**
 * Drop unknown keys from a persisted draft before `form.reset(draft)`. Without
 * this filter a returning user's saved draft re-introduces keys the body no
 * longer accepts (e.g. `vehicleId`/`trailerId`/`driverId`), Zod `.strict()`
 * rejects the whole form, and the user sees a permanently invalid form with no
 * visible offending field.
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

export default function NewClaimPage() {
  const t = useTranslations('carrier.claims');
  const tForm = useTranslations('carrier.claims.form');
  const tPicker = useTranslations('carrier.claims.wyjazdPicker');
  const tNoGuarantee = useTranslations('carrier.claims.noGuarantee');
  const tCommon = useTranslations('common');
  const router = useRouter();
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

  // The currently-selected outing (drives the picker context).
  const selectedDelegation = useMemo(
    () => delegations.find((d) => d.id === watched.delegationId) ?? null,
    [delegations, watched.delegationId],
  );

  // ── Guarantee gate (B+C hybrid) ──────────────────────────────────────
  // A vehicle is claimable ONLY when its `agreement === true`. `false`, `null`
  // and `undefined` ALL count as not-guaranteed (`!== true` collapses the
  // three). When the current selection is not guaranteed we mark it in the
  // picker (still selectable), swap the right-column preview for a block screen,
  // gate the preview request off and disable submit. The server 422
  // (`VEHICLE_NOT_GUARANTEED`) remains the load-bearing backstop for the
  // stale-data race (opiekun toggles agreement off after page load).
  const selectedNotGuaranteed =
    !!selectedDelegation && selectedDelegation.vehicle?.agreement !== true;

  // ── Read-only vehicle / trailer / driver (Phase 7 §0″ finish) ─────────
  // Derived DIRECTLY from the selected outing — the carrier no longer picks
  // them. Display-only; the submit body never carries them (the api derives
  // them from `delegationId`). `null` until an outing is selected → muted
  // "pick a wyjazd first" placeholder.
  const derivedVehiclePlate = selectedDelegation?.vehicle?.plateNumber ?? null;
  const derivedTrailerPlate = selectedDelegation?.trailer?.plateNumber ?? null;
  const derivedDriverName = selectedDelegation
    ? (selectedDelegation.driver
        ? `${selectedDelegation.driver.firstName} ${selectedDelegation.driver.lastName}`
        : selectedDelegation.driverNameSnapshot)
    : null;

  // ── Preview body — the outing + the facts the carrier has typed so far ──
  // The api prices exactly what we send here, so the live panel and the eventual
  // submit agree by construction. Fired only once the period is complete —
  // there is nothing to price without both dates.
  const mileageNumber = Number(watched.mileage);
  const hasMileage =
    watched.mileage.trim() !== '' && Number.isFinite(mileageNumber);
  const { previewBody, emptyReason } = useMemo<{
    previewBody: PreviewClaimDto | null;
    emptyReason: 'incomplete' | undefined;
  }>(() => {
    if (!watched.delegationId || !watched.dateStart || !watched.dateEnd) {
      return { previewBody: null, emptyReason: 'incomplete' };
    }
    // Non-guaranteed selection → never fire the preview (it would only earn a
    // pointless 422). The block screen replaces the panel anyway.
    if (selectedNotGuaranteed) {
      return { previewBody: null, emptyReason: 'incomplete' };
    }
    return {
      previewBody: {
        delegationId: watched.delegationId,
        dateStart: watched.dateStart,
        dateEnd: watched.dateEnd,
        ...(watched.timeFrom ? { timeFrom: watched.timeFrom } : {}),
        ...(watched.timeTo ? { timeTo: watched.timeTo } : {}),
        ...(hasMileage ? { mileage: mileageNumber } : {}),
        hoursAdjusted: 0,
      },
      emptyReason: undefined,
    };
  }, [
    watched.delegationId,
    watched.dateStart,
    watched.dateEnd,
    watched.timeFrom,
    watched.timeTo,
    hasMileage,
    mileageNumber,
    selectedNotGuaranteed,
  ]);

  const debouncedPreviewBody = useDebouncedValue(previewBody, 400);
  const previewQ = useClaimPreview(debouncedPreviewBody, {
    enabled: !!debouncedPreviewBody,
  });

  // Floor for the declared loading date — the departure the carrier reported
  // when registering the outing. Mirrors the api's `CLAIM_DATE_BEFORE_DEPARTURE`
  // gate so the browser blocks it before the round-trip.
  //
  // `departureAt` is a TRUE UTC instant (docs/19 #16), so the floor is its
  // WARSAW calendar day via `businessDateIso` — the same reduction the api
  // applies (and echoes back as `extensions.minDateStart`), UWAGI #29. E.g.
  // `2026-04-30T22:30:00.000Z` (= 01.05 00:30 CEST) floors at `2026-05-01`.
  // This is NOT the raw-slice rule used for the wall-clock `actual*` values:
  // slicing a true instant yields the UTC day, one day early after midnight.
  const minDateStart = selectedDelegation
    ? businessDateIso(new Date(selectedDelegation.departureAt))
    : undefined;
  const dateStartBelowFloor =
    !!minDateStart && !!watched.dateStart && watched.dateStart < minDateStart;

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

  // ── Client-side tier-1 date rules — run against the TYPED period. ──
  // Mirrors the api's tier-1 pipeline (order / future / span) so the carrier
  // sees the problem while typing instead of on submit. NB the deadline rule is
  // deliberately NOT mirrored client-side: the api measures it from the
  // weryfikator's `actualReturnAt`, which this form has no business showing.
  const dateViolations = useMemo<DateRuleViolation[]>(() => {
    if (!watched.dateStart || !watched.dateEnd) return [];
    return checkClaimDates({
      dateStart: watched.dateStart,
      dateEnd: watched.dateEnd,
      today: todayBusinessTzIso(),
      maxPeriodDays: CLIENT_MAX_PERIOD_DAYS,
      maxDaysAfterUnload: CLIENT_MAX_DAYS_AFTER_UNLOAD,
    }).filter((v) => v.code !== 'deadline_passed');
  }, [watched.dateStart, watched.dateEnd]);

  const clientViolations = useMemo<string[]>(() => {
    const out = dateViolations.map((v) => tForm(v.key, v.params));
    if (dateStartBelowFloor && minDateStart) {
      out.push(tForm('violationDateStartBeforeDeparture', { date: minDateStart }));
    }
    return out;
  }, [dateViolations, dateStartBelowFloor, minDateStart, tForm]);
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
      // Defense in depth: agreement can be toggled off between page load and
      // submit (the client gate read stale picker data). Surface a DISTINCT
      // toast with the block message — never fall through to the generic
      // submitErrorToast / violations list. The block screen already shows once
      // the picker query refetches, but the toast is the immediate signal.
      if (isVehicleNotGuaranteed(err)) {
        toast.error(tNoGuarantee('toast'));
        return;
      }
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
      // Assemble the SubmitClaimDto. The backend body is `.strict()`: the six
      // required keys below plus the two optional ones, nothing else — vehicle /
      // trailer / driver are still derived from `delegationId` and sending them
      // is a 400. Strip empty optional fields.
      const body: Record<string, unknown> = {
        delegationId: values.delegationId,
        dateStart: values.dateStart,
        dateEnd: values.dateEnd,
        timeFrom: values.timeFrom,
        timeTo: values.timeTo,
        mileage: Number(values.mileage),
      };
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

  // Explicit required-fields gate (independent of resolver): the outing plus
  // every declared fact. Vehicle/trailer/driver remain server-derived.
  const requiredFilled =
    !!watched.delegationId &&
    !!watched.dateStart &&
    !!watched.dateEnd &&
    !!watched.timeFrom &&
    !!watched.timeTo &&
    hasMileage &&
    mileageNumber > 0;

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
                      // B (hybrid): non-guaranteed outings stay SELECTABLE but
                      // get a "(bez gwarancji)" marker. Selecting one triggers
                      // the block screen + disabled submit (C).
                      // Dates: `departureAt` is a true instant (browser-local
                      // `formatDateFull`); the return end is wall-clock
                      // labelled UTC (`actualReturnAt`) or date-only
                      // (`plannedReturnAt`) → UTC-pinned `formatWallClockDate`
                      // (docs/19 #16).
                      <option key={d.id} value={d.id}>
                        {(d.vehicle?.plateNumber ?? '—')} ·{' '}
                        {formatDateFull(d.departureAt)} →{' '}
                        {formatWallClockDate(d.actualReturnAt ?? d.plannedReturnAt)}
                        {d.vehicle?.agreement !== true
                          ? ` · ${tPicker('noGuaranteeMarker')}`
                          : ''}
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

                {/* Selected-outing status chip (always zjechał now — claimable
                    returns only returned outings). */}
                {selectedDelegation && (
                  <div className="flex items-center gap-2 text-sm text-text-sub">
                    <span>{tPicker('selectedStatus')}</span>
                    <StatusBadge status={selectedDelegation.status} />
                  </div>
                )}

              </FormSection>

              {/* ② Declared period + time window (REWORK 2026-07-30). The
                  loading date is floored at the outing's reported departure;
                  everything else is free — a truck can return early or late. */}
              <FormSection title={tForm('sectionPeriod')}>
                <FormGrid cols={2}>
                  <FormField
                    label={tForm('dateStart')}
                    required
                    description={
                      minDateStart
                        ? tForm('dateStartHint', { date: minDateStart })
                        : undefined
                    }
                    error={errs.dateStart?.message}
                    htmlFor="claim-dateStart"
                  >
                    <Input
                      id="claim-dateStart"
                      type="date"
                      min={minDateStart}
                      max={todayBusinessTzIso()}
                      {...form.register('dateStart')}
                    />
                  </FormField>

                  <FormField
                    label={tForm('dateEnd')}
                    required
                    error={errs.dateEnd?.message}
                    htmlFor="claim-dateEnd"
                  >
                    <Input
                      id="claim-dateEnd"
                      type="date"
                      min={watched.dateStart || minDateStart}
                      max={todayBusinessTzIso()}
                      {...form.register('dateEnd')}
                    />
                  </FormField>

                  <FormField
                    label={tForm('timeFrom')}
                    required
                    error={errs.timeFrom?.message}
                    htmlFor="claim-timeFrom"
                  >
                    <Input
                      id="claim-timeFrom"
                      type="time"
                      {...form.register('timeFrom')}
                    />
                  </FormField>

                  <FormField
                    label={tForm('timeTo')}
                    required
                    error={errs.timeTo?.message}
                    htmlFor="claim-timeTo"
                  >
                    <Input
                      id="claim-timeTo"
                      type="time"
                      {...form.register('timeTo')}
                    />
                  </FormField>
                </FormGrid>
              </FormSection>

              {/* Vehicle / trailer / driver are DERIVED read-only from the
                  selected outing (Phase 7 §0″ finish) — the carrier no longer
                  picks them. Same visual treatment as the derived-period card. */}
              <FormSection title={tForm('sectionVehicleAndDriver')}>
                {selectedDelegation ? (
                  <FormGrid cols={2}>
                    <ReadOnlyField
                      label={tForm('vehicle')}
                      value={derivedVehiclePlate}
                    />
                    <ReadOnlyField
                      label={tForm('driver')}
                      value={derivedDriverName}
                    />
                    <ReadOnlyField
                      label={tForm('trailer')}
                      value={derivedTrailerPlate}
                    />
                  </FormGrid>
                ) : (
                  <p
                    role="status"
                    className="rounded-md border border-border bg-input/40 px-3 py-2 text-sm text-text-sub"
                  >
                    {tForm('vehicleReadOnlyPlaceholder')}
                  </p>
                )}
              </FormSection>

              {/* ③ Declared mileage (REWORK 2026-07-30). Free-form: the figure
                  the carrier is paid on comes from SpedTrans, not from the
                  weryfikator's board, so no hint and no prefill here. */}
              <FormSection title={tForm('sectionValues')}>
                <FormGrid cols={2}>
                  <FormField
                    label={tForm('mileage')}
                    required
                    description={tForm('mileageHint')}
                    error={errs.mileage?.message}
                    htmlFor="claim-mileage"
                  >
                    <Input
                      id="claim-mileage"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      {...form.register('mileage')}
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
                  selectedNotGuaranteed
                }
              >
                {submitting ? t('submitting') : t('submit')}
              </Button>
            </div>
          </div>

          {/* Right — Live preview, OR (C) the not-guaranteed block screen. The
              preview is meaningless for a non-guaranteed vehicle, so swap the
              whole panel for a prominent block directing the carrier to their
              opiekun. The left column stays so the carrier still sees what they
              picked. */}
          <div>
            {selectedNotGuaranteed ? (
              <div className="bg-card rounded-lg border border-danger/40 p-2">
                <EmptyState
                  icon={ShieldAlert}
                  title={tNoGuarantee('title')}
                  message={tNoGuarantee('message')}
                />
              </div>
            ) : (
              <LivePreviewPanel
                data={previewQ.data}
                isLoading={previewQ.isFetching}
                isError={previewQ.isError}
                isEmpty={!previewBody}
                emptyReason={emptyReason}
              />
            )}
          </div>
        </div>
      </form>
    </section>
  );
}

/**
 * A read-only derived field — same visual treatment as the §7.10.3 derived-
 * period card (`bg-input/40` boxed value, uppercase micro-label). Used for the
 * vehicle / trailer / driver (from the selected outing) and the mileage (from
 * the preview), all of which the carrier no longer enters (Phase 7 §0″ finish).
 * `value === null` falls back to a muted `placeholder` (or `—`). Grid-aware via
 * `<FormItem>`: the first child is the label band, the boxed value the control
 * band, so it aligns with sibling fields inside a `<FormGrid>`.
 */
function ReadOnlyField({
  label,
  value,
  placeholder,
  description,
}: {
  label: string;
  value: string | null | undefined;
  placeholder?: string;
  description?: string;
}) {
  const hasValue = value != null && value !== '';
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <div className="rounded-md border border-border bg-input/40 px-3 py-2 min-h-10 flex items-center">
        {hasValue ? (
          <span className="text-sm text-text tabular-nums">{value}</span>
        ) : (
          <span className="text-sm text-text-sub">{placeholder ?? '—'}</span>
        )}
      </div>
      {description && <FormDescription>{description}</FormDescription>}
    </FormItem>
  );
}

/**
 * Narrows an unknown mutation error to the not-guaranteed 422 backstop. The api
 * returns RFC-7807 with `extensions.code === VEHICLE_NOT_GUARANTEED`; the client
 * puts the decoded envelope on `err.data`, so the code lives at
 * `err.data.extensions.code`. Same single-code envelope as the carrier-readiness
 * gate (NOT the multi-rule `violations[]` array). This only fires in the
 * stale-data race: the opiekun toggles agreement off AFTER the carrier loaded
 * the page, so the picker data is stale and the client gate didn't catch it.
 */
function isVehicleNotGuaranteed(err: unknown): boolean {
  if (!(err instanceof ApiResponseError) || err.status !== 422) return false;
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return false;
  return (extensions as { code?: unknown }).code === VEHICLE_NOT_GUARANTEED;
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
