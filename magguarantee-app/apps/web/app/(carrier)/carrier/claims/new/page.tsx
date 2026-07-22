'use client';

// Phase 3 — new-claim form. Two-column layout per docs/14: RHF form on the
// left, <LivePreviewPanel> on the right. The preview is debounced 400ms after
// any field change and fired against POST /claims/preview. Submit is disabled
// while the preview is loading or returned an error.
//
// Phase 7.10 REWORK (2026-06-20 #4, docs/14 §7.10.3): the carrier no longer
// types the period OR the time window. They PICK one of their claimable outings
// (`GET /delegations?claimable=true` → only `zjechal` outings with no linked
// wniosek). The chosen `delegationId` is sent to preview/submit; the PERIOD
// (`dateStart`/`dateEnd`), the TIME WINDOW (`timeFrom`/`timeTo`, wall-clock of
// the outing's actual departure/return) and the default `mileage` all come BACK
// from the preview (server-derived) and render READ-ONLY. The carrier's submit
// body is just `{ delegationId, comment?, attachmentIds? }`.
//
// Step 2 (precise times): `timeFrom`/`timeTo` are no longer carrier inputs — the
// weryfikator captures them on the `w_trasie`/`zjechal` transitions and the
// server derives them. Since `claimable` now returns ONLY returned (`zjechal`)
// outings, the old `w_trasie` "not yet returned" soft-warning is gone.

import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
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
import { formatDateFull, formatKm } from '@/lib/format/numbers';
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
// draft so removed keys cannot resurrect themselves on hydrate and trip Zod
// `.strict()`. Phase 7.10: `dateStart`/`dateEnd` were REMOVED earlier (period
// is server-derived from the outing). Phase 7 §0″ finish (2026-06-25):
// `vehicleId`/`trailerId`/`driverId`/`mileage` were ALSO REMOVED. Step 2:
// `timeFrom`/`timeTo` were REMOVED too — the weryfikator captures the actual
// departure/return moments and the server derives the wall-clock time window.
// A stale draft carrying any of those old keys would otherwise resurrect them
// into the submit body and trip the backend's `.strict()` 400.
const FORM_ALLOWED_KEYS = ['delegationId', 'comment', 'attachmentIds'] as const;

// The form's editable values — the carrier's ONLY inputs. `delegationId` is
// REQUIRED; the period, time window, vehicle, trailer, driver and mileage are
// all server-derived and never live in the form (rendered read-only from the
// selected outing / the preview response).
interface FormValues {
  delegationId: string;
  comment?: string;
  attachmentIds?: string[];
}

function getDefaults(): FormValues {
  return {
    delegationId: '',
    comment: undefined,
    attachmentIds: undefined,
  };
}

/**
 * Drop unknown keys from a persisted draft before `form.reset(draft)`. Without
 * this filter a returning user's saved draft re-introduces removed keys (e.g.
 * the old `vehicleId`/`trailerId`/`driverId`/`mileage`/`dateStart`/`dateEnd`/
 * `timeFrom`/`timeTo`), Zod `.strict()` rejects the whole form, and the user
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

  // ── Preview body — keyed off delegationId (everything derived server-side) ──
  // We send ONLY `delegationId` and OMIT vehicleId/mileage/timeFrom/timeTo; the
  // api derives the period, TIME WINDOW, vehicle/trailer/driver and mileage from
  // the outing and returns `dateStart`/`dateEnd`, `timeFrom`/`timeTo`, `mileage`
  // and `delegationContext`. The carrier cannot override any of them.
  const { previewBody, emptyReason } = useMemo<{
    previewBody: PreviewClaimDto | null;
    emptyReason: 'incomplete' | undefined;
  }>(() => {
    if (!watched.delegationId) {
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
        hoursAdjusted: 0,
      },
      emptyReason: undefined,
    };
  }, [watched.delegationId, selectedNotGuaranteed]);

  const debouncedPreviewBody = useDebouncedValue(previewBody, 400);
  const previewQ = useClaimPreview(debouncedPreviewBody, {
    enabled: !!debouncedPreviewBody,
  });

  // Derived (read-only) period + time window from the preview — what we submit.
  const derivedDateStart = previewQ.data?.dateStart;
  const derivedDateEnd = previewQ.data?.dateEnd;
  const derivedTimeFrom = previewQ.data?.timeFrom;
  const derivedTimeTo = previewQ.data?.timeTo;

  // ── Read-only mileage from the preview (Phase 7 §0″ finish) ──────────
  // ALWAYS the server-computed `Σ VehicleDailyKm (state=drove)` over the derived
  // period — the carrier can never edit it. Display-only; rendered read-only in
  // the values section. `undefined` until the preview returns (muted placeholder).
  const previewMileage = previewQ.data?.mileage;
  const hasPreviewMileage =
    typeof previewMileage === 'number' && !Number.isNaN(previewMileage);

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
      // Assemble the SubmitClaimDto (Step 2): the backend body is `.strict()`
      // and accepts ONLY these 3 keys. period / time window / vehicle / trailer
      // / driver / mileage are ALL DERIVED server-side from `delegationId` —
      // sending any of them is a 400. Strip empty optional fields.
      const body: Record<string, unknown> = {
        delegationId: values.delegationId,
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

  // Explicit required-fields gate (independent of resolver). The carrier's ONLY
  // required input is the outing — everything else (period, time window,
  // vehicle/trailer/driver, mileage) is server-derived.
  const requiredFilled = !!watched.delegationId;

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
                      <option key={d.id} value={d.id}>
                        {(d.vehicle?.plateNumber ?? '—')} ·{' '}
                        {formatDateFull(d.departureAt)} →{' '}
                        {formatDateFull(d.actualReturnAt ?? d.plannedReturnAt)}
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

                {/* Read-only derived period + time window (server-computed from
                    the outing's actual departure / return). */}
                {(derivedDateStart || derivedDateEnd) && (
                  <div className="rounded-md border border-border bg-input/40 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
                      {tPicker('derivedPeriod')}
                    </p>
                    <p className="mt-0.5 text-sm text-text tabular-nums">
                      {formatDateFull(derivedDateStart)} –{' '}
                      {formatDateFull(derivedDateEnd)}
                    </p>
                    {(derivedTimeFrom || derivedTimeTo) && (
                      <>
                        <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-text-sub">
                          {tPicker('derivedTimes')}
                        </p>
                        <p className="mt-0.5 text-sm text-text tabular-nums">
                          {derivedTimeFrom ?? '—'} – {derivedTimeTo ?? '—'}
                        </p>
                      </>
                    )}
                  </div>
                )}
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

              {/* Period + time window are DERIVED read-only from the outing —
                  shown in the picker card above (dates + wall-clock hours). The
                  carrier no longer types a time window (Step 2). */}

              {/* Mileage is DERIVED read-only from the preview (the
                  server-computed Σ VehicleDailyKm over the period). The carrier
                  can never edit it — it updates whenever the preview re-runs. */}
              <FormSection title={tForm('sectionValues')}>
                <FormGrid cols={2}>
                  <ReadOnlyField
                    label={tForm('mileage')}
                    value={hasPreviewMileage ? formatKm(previewMileage) : null}
                    placeholder={tForm('mileageReadOnlyPlaceholder')}
                    description={tForm('mileageReadOnlyHint')}
                  />
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
