'use client';

// Phase 7.1 — Unified wniosek-verification surface (docs/14 §6.5).
//
// Replaces the two-surface flow (read-only `ClaimDetailModal` <Dialog> +
// editable `ClaimVerificationModal` <Sheet>) with ONE centered <Dialog
// max-w-4xl> carrying a `mode: 'view' | 'edit'` state:
//   - row click → opens in `view` (read-only).
//   - «Edycja» button → morphs the leaf controls static⇄input IN PLACE,
//     no re-mount: one mounted <Dialog>, one mounted RHF form. The form is
//     initialised once on open and never unmounted, so entering `edit` does
//     not reset values; leaf fact cells read `mode` and render either a
//     <dl> static value or an <Input>.
//   - «Anuluj» (edit) → form.reset(serverValues) + back to `view`; does NOT
//     close the Dialog (✕ / Escape / Zamknij close it).
//
// Body order (locked by §6.5.2, top→bottom):
//   ① DANE WNIOSKU / DANE PO WERYFIKACJI — 6 fact pairs (§6.5.3)
//   ② DOPŁATA — locked/computed, live recalc INDEPENDENT of decyzja (§6.5.4)
//   ③ DECYZJA — targetStatus select + conditional fields (§6.5.5), at bottom
//   ④ Secondary Historia/Autoryzacja sub-panel (§6.5.7) — Tabs if both apply,
//      single section if one, omitted if neither.
//
// The form contract is unchanged from Phase 4: `UpdateClaimSchema`
// discriminated union, the custom `updateClaimResolver` + `cleanUpdatePayload`
// (strips sibling-variant keys so the strict union validates), `useUpdateClaim`,
// `useClaimPreviewExisting`, `useRequestAuthorization`. Only the surface and
// the layout order change.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Loader2, Lock, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Controller,
  useForm,
  type FieldErrors,
  type Resolver,
  type SubmitHandler,
  type UseFormReturn,
} from 'react-hook-form';
import { toast } from 'sonner';
import {
  RequestAuthorizationSchema,
  UpdateClaimSchema,
  getAuthThreshold,
  isCompensationDue,
  type ClaimDto,
  type KmCalcBreakdown,
  type PreviewClaimDto,
  type RequestAuthorizationDto,
  type UpdateClaimDto,
} from '@magguarantee/shared';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { AutoRecalcBadge } from '@/components/claims/AutoRecalcBadge';
import { HoursReadout } from '@/components/claims/HoursReadout';
import { RecalcBadge } from '@/components/claims/RecalcBadge';
import {
  decisionTargetsFor,
  type ClaimDecisionTarget,
} from '@/components/claims/claim-transitions';
import { FormDescription, FormField, FormGrid } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Textarea } from '@/components/ui/Textarea';
import { ApiResponseError } from '@/lib/api/client';
import { formatDateFull, formatEur } from '@/lib/format/numbers';
import {
  useClaim,
  useClaimPreviewExisting,
  useRequestAuthorization,
  useUpdateClaim,
} from '@/lib/hooks/useClaims';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────────────────────────────
// Form values shape — superset of every variant in `UpdateClaimSchema`.
// (unchanged from the Phase 4 ClaimVerificationModal)
// ────────────────────────────────────────────────────────────────────
interface FormValues {
  targetStatus: ClaimDecisionTarget | '';
  dateStart: string;
  dateEnd: string;
  timeFrom: string;
  timeTo: string;
  mileage: number | undefined;
  hoursAdjusted: number | undefined;
  orderNumber: string;
  orderDate: string;
  amountApproved: number | undefined;
  amountMaximum: number | undefined;
  comment: string;
  margin: number | undefined;
  authorizationDescription: string;
  reklamacjaAmount: number | undefined;
}

export type ClaimModalMode = 'view' | 'edit';

interface ClaimModalProps {
  open: boolean;
  nrZgl: string | null;
  /** Initial mode on open. Row-click seeds `'view'`. */
  initialMode?: ClaimModalMode;
  /** Whether the «Edycja» affordance is shown (admin / pracownik only). For
   *  read-only roles the modal stays in `view` with no edit button. */
  canEdit?: boolean;
  onClose: () => void;
}

function buildPreviewBody(
  claim: ClaimDto,
  v: Partial<FormValues>,
): PreviewClaimDto | null {
  if (!claim.vehicleId) return null;
  const dateStart = v.dateStart || claim.dateStart.slice(0, 10);
  const dateEnd = v.dateEnd || claim.dateEnd.slice(0, 10);
  // `mileage` is back in PreviewClaimSchema (bug-fix finish): the verifier's
  // manual km override DRIVES the live recalc. It's server-side role-gated —
  // honored for pracownik/admin, IGNORED for przewoznik and on the
  // delegationId-driven carrier path. We only send it when it's a finite,
  // non-negative number; while the input is empty/NaN we omit the field so
  // the server falls back to Σ VehicleDailyKm (no crash, just a momentary
  // fallback). The verifier's mileage edit ALSO still flows through the PATCH
  // (UpdateClaimCorrectionFields.mileage) as before.
  const hoursAdjusted =
    v.hoursAdjusted !== undefined && Number.isFinite(v.hoursAdjusted)
      ? Number(v.hoursAdjusted)
      : 0;
  const mileageOverride =
    v.mileage !== undefined && Number.isFinite(v.mileage) && Number(v.mileage) >= 0
      ? Number(v.mileage)
      : undefined;
  return {
    vehicleId: claim.vehicleId,
    dateStart,
    dateEnd,
    timeFrom: v.timeFrom || claim.timeFrom,
    timeTo: v.timeTo || claim.timeTo,
    hoursAdjusted,
    ...(mileageOverride !== undefined ? { mileage: mileageOverride } : {}),
  };
}

// Custom RHF resolver — see Phase 4 commentary: the form registers the
// SUPERSET of all variants so `targetStatus` can switch without re-mounting
// fields; `cleanUpdatePayload` strips sibling-variant keys before validating
// against the strict discriminated union.
const updateClaimResolver: Resolver<FormValues> = async (values) => {
  if (!values.targetStatus) {
    return {
      values: {},
      errors: {
        targetStatus: {
          type: 'required',
          message: 'required',
        },
      } as FieldErrors<FormValues>,
    };
  }
  const cleaned = cleanUpdatePayload(values);
  const result = UpdateClaimSchema.safeParse(cleaned);
  if (result.success) {
    return { values, errors: {} };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || 'targetStatus';
    if (!errors[path]) {
      errors[path] = { type: issue.code, message: issue.message };
    }
  }
  return {
    values: {},
    errors: errors as FieldErrors<FormValues>,
  };
};

/** Drop empty / undefined values so Zod's `.strict()` doesn't choke. */
function cleanUpdatePayload(values: FormValues): UpdateClaimDto {
  const out: Record<string, unknown> = { targetStatus: values.targetStatus };
  const include = (k: string, v: unknown) => {
    if (v === '' || v === undefined || v === null) return;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    out[k] = v;
  };
  if (
    values.targetStatus !== 'ODRZUCONO' &&
    values.targetStatus !== 'REKLAMACJA_ODRZUCONO'
  ) {
    include('dateStart', values.dateStart);
    include('dateEnd', values.dateEnd);
    include('timeFrom', values.timeFrom);
    include('timeTo', values.timeTo);
    include('mileage', values.mileage);
    include('hoursAdjusted', values.hoursAdjusted);
  }
  switch (values.targetStatus) {
    case 'ZAAKCEPTOWANO':
      include('orderNumber', values.orderNumber);
      include('orderDate', values.orderDate);
      include('amountApproved', values.amountApproved);
      include('amountMaximum', values.amountMaximum);
      include('comment', values.comment);
      break;
    case 'ODRZUCONO':
      include('comment', values.comment);
      break;
    case 'OCZEKUJE_NA_AUTORYZACJE':
      include('margin', values.margin);
      include('authorizationDescription', values.authorizationDescription);
      break;
    case 'REKLAMACJA_ZAAKCEPTOWANO':
      include('comment', values.comment);
      include('reklamacjaAmount', values.reklamacjaAmount);
      break;
    case 'REKLAMACJA_ODRZUCONO':
      include('comment', values.comment);
      break;
  }
  return out as UpdateClaimDto;
}

// ── Public component ────────────────────────────────────────────────
// Keeps the <Dialog> mounted across the whole modal lifetime so the
// view↔edit morph never re-mounts; the inner <ModalBody> mounts the RHF
// form once the claim is loaded.

export function ClaimModal({
  open,
  nrZgl,
  initialMode = 'view',
  canEdit = false,
  onClose,
}: ClaimModalProps) {
  const t = useTranslations('employee.claims.modal');

  const claimQ = useClaim(open ? nrZgl : null);
  const claim = claimQ.data ?? null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100%-2rem)] max-h-[calc(100dvh-4rem)] flex flex-col p-0">
        {claimQ.isLoading || !claim ? (
          <LoadingState nrZgl={nrZgl} t={t} />
        ) : (
          <ModalBody
            key={claim.id}
            claim={claim}
            initialMode={initialMode}
            canEdit={canEdit}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function LoadingState({
  nrZgl,
  t,
}: {
  nrZgl: string | null;
  t: ReturnType<typeof useTranslations<'employee.claims.modal'>>;
}) {
  return (
    <>
      <div className="shrink-0 border-b border-border px-6 pt-6 pb-4 pr-12 sm:px-8 sm:pr-14">
        <DialogTitle>{nrZgl ? t('title', { nrZgl }) : ''}</DialogTitle>
        <Skeleton className="mt-2 h-4 w-48" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </>
  );
}

// ── Internal body — mounts the RHF form once the claim is loaded ────

interface ModalBodyProps {
  claim: ClaimDto;
  initialMode: ClaimModalMode;
  canEdit: boolean;
  onClose: () => void;
}

function ModalBody({ claim, initialMode, canEdit, onClose }: ModalBodyProps) {
  const t = useTranslations('employee.claims.modal');
  const tStatus = useTranslations('employee.claims.modal.targetStatus');
  const tUnified = useTranslations('employee.claims.modal.unified');
  const tEdit = useTranslations('employee.claims.modal.edit');
  const tCommon = useTranslations('common');

  const targets = useMemo(() => decisionTargetsFor(claim.status), [claim.status]);

  // ── Post-authorization accept (product decision) ──
  // When a claim reached the verifier THROUGH Maksim's e-mail authorization
  // flow (status OCZEKUJE_NA_AUTORYZACJE), an accept lets the verifier ENTER
  // the amount Maksim actually approved instead of locking to the live-computed
  // dopłata. For a direct accept from NA_WERYFIKACJI the field stays locked.
  const postAuthorization = claim.status === 'OCZEKUJE_NA_AUTORYZACJE';

  // ── In-place morph state. Non-editing roles are pinned to `view`. ──
  const [mode, setMode] = useState<ClaimModalMode>(
    canEdit ? initialMode : 'view',
  );
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<FormValues>({
    resolver: updateClaimResolver,
    defaultValues: getDefaults(claim),
  });

  const targetStatus = form.watch('targetStatus');

  // ── Live preview (debounced 300ms) — DECISION-INDEPENDENT (§6.5.4). ──
  // Recomputes whenever any of the 6 facts changes, regardless of the
  // selected targetStatus. Gated only on the vehicle being known (handled
  // inside buildPreviewBody) — the verifier sees the financial consequence
  // of their corrections BEFORE committing to a decision.
  // `mileage` IS watched: the verifier's manual km override drives the live
  // recalc. It's honored server-side only for pracownik/admin (ignored for
  // przewoznik and on the delegationId carrier path); buildPreviewBody sends
  // it only while it's a finite non-negative number, otherwise omits it so the
  // server falls back to Σ VehicleDailyKm. The PATCH still carries mileage too.
  const watched = form.watch([
    'dateStart',
    'dateEnd',
    'timeFrom',
    'timeTo',
    'hoursAdjusted',
    'mileage',
  ]);
  const wDateStart = watched[0];
  const wDateEnd = watched[1];
  const wTimeFrom = watched[2];
  const wTimeTo = watched[3];
  const wHoursAdjusted = watched[4];
  const wMileage = watched[5];

  const previewBodyImmediate = useMemo<PreviewClaimDto | null>(
    () =>
      buildPreviewBody(claim, {
        dateStart: wDateStart,
        dateEnd: wDateEnd,
        timeFrom: wTimeFrom,
        timeTo: wTimeTo,
        hoursAdjusted: wHoursAdjusted,
        mileage: wMileage,
      }),
    [claim, wDateStart, wDateEnd, wTimeFrom, wTimeTo, wHoursAdjusted, wMileage],
  );

  const debouncedPreviewBody = useDebouncedValue(previewBodyImmediate, 300);

  const previewQ = useClaimPreviewExisting(claim.nrZgl, debouncedPreviewBody, {
    enabled: debouncedPreviewBody !== null,
  });

  const inDebounce =
    previewBodyImmediate !== debouncedPreviewBody &&
    previewBodyImmediate !== null;
  const recalcState: 'idle' | 'loading' | 'success' | 'error' =
    previewBodyImmediate === null
      ? 'idle'
      : inDebounce || previewQ.isFetching
        ? 'loading'
        : previewQ.isError
          ? 'error'
          : 'success';

  // The dopłata shown in the locked field: the live previewed value when
  // available, else the persisted server value.
  const liveDoplata =
    previewQ.data?.paymentEur ?? claim.paymentEur;

  // ── Próg autoryzacji — SOFT INFORMATIONAL hint (docs/01, getAuthThreshold) ──
  // Tracks the live recalc: dni jezdne come from the previewed breakdown when
  // available, else the persisted `claim.drivenDays`. Nothing here gates or
  // disables the decision/authorization actions — the legacy app never
  // enforced this threshold either; it only surfaced it as context. The
  // exceeds-hint additionally requires the claim to still be pre-decision
  // (NA_WERYFIKACJI) so it disappears once a decision/authorization is in play.
  const liveDrivenDays =
    previewQ.data?.breakdown?.totalDays ?? claim.drivenDays;
  const prog = getAuthThreshold(liveDrivenDays);
  const exceedsProg = liveDoplata > prog;
  const showExceedsHint =
    exceedsProg && claim.status === 'NA_WERYFIKACJI';

  // ── Live hours readout source (§6.5.4 / Phase 3.1) ──
  // The edit-mode HoursReadout must reflect the verifier's CURRENT working
  // times — the same numbers that drive the live dopłata. `previewQ.data`
  // already recomputes both rawTotalDays (pre-korekta, edited times) and
  // totalDays (post-korekta, edited times) from `buildPreviewBody`. The query
  // is configured with `placeholderData: (prev) => prev`, so once the first
  // response lands `previewQ.data` is retained across in-flight debounced
  // recalcs — no snap-back / number flicker between keystrokes. Before the
  // first response we fall back to the persisted breakdown so the readout
  // never renders "—" / NaN.
  const livePreviewBreakdown = previewQ.data?.breakdown ?? null;
  const previewNotYetLoaded = previewQ.data === undefined;

  // ── Acceptance gate by recalc result (§6.5.5 / §6.5.10) ──
  // When the live recalc shows the guarantee was met (kmDifference <= 0 →
  // no payout due) acceptance is impossible: drop the accept targets from
  // the select, leaving only the rejection options. UI guard only — the
  // backend independently hard-rejects acceptance with 422.
  const liveKmDiff = previewQ.data?.kmDifference ?? claim.kmDifference;
  const metGuarantee = !isCompensationDue(liveKmDiff);
  const availableTargets = useMemo(
    () =>
      metGuarantee
        ? targets.filter(
            (target) =>
              target === 'ODRZUCONO' || target === 'REKLAMACJA_ODRZUCONO',
          )
        : targets,
    [metGuarantee, targets],
  );

  // Clear a stale acceptance selection if an edit pushes recalc into
  // "guarantee met". Guarded on the value of `targetStatus` (read via the
  // watch above) and `metGuarantee` only — `form.setValue` is stable, so no
  // loop. Skipped while a recalc is in flight to avoid flicker.
  useEffect(() => {
    if (!metGuarantee) return;
    if (recalcState === 'loading') return;
    if (
      targetStatus === 'ZAAKCEPTOWANO' ||
      targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO'
    ) {
      form.setValue('targetStatus', '');
    }
  }, [metGuarantee, recalcState, targetStatus, form]);

  // Auto-populate `amountApproved` to the live dopłata for ZAAKCEPTOWANO
  // until the verifier overrides it. (decision-scoped — only fires when the
  // accept branch is selected.)
  // SKIPPED for the post-authorization accept (OCZEKUJE_NA_AUTORYZACJE): there
  // the field is editable and prefilled with kwota Maksima (getDefaults), so
  // re-syncing it to the live dopłata would clobber that prefill.
  useEffect(() => {
    if (postAuthorization) return;
    if (targetStatus !== 'ZAAKCEPTOWANO') return;
    if (form.formState.dirtyFields.amountApproved) return;
    if (typeof liveDoplata === 'number') {
      form.setValue('amountApproved', liveDoplata, { shouldDirty: false });
    }
  }, [postAuthorization, targetStatus, liveDoplata, form]);

  const updateM = useUpdateClaim({
    onSuccess: () => {
      toast.success(tEdit('savedToast'));
      onClose();
    },
    onError: (err) => {
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tEdit('errorToast');
      toast.error(msg);
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    if (!values.targetStatus) return;
    const payload = cleanUpdatePayload(values);
    updateM.mutate({ nrZgl: claim.nrZgl, body: payload });
  };

  // ── Mode transitions — focus management (§6.5.6) ──
  const enterEdit = () => {
    setMode('edit');
    // Focus the first verifier input after the morph paints.
    requestAnimationFrame(() => firstInputRef.current?.focus());
  };
  const cancelEdit = () => {
    // Discard unsaved edits, back to view; do NOT close the Dialog.
    form.reset(getDefaults(claim));
    setMode('view');
    requestAnimationFrame(() => editButtonRef.current?.focus());
  };

  const submitDisabled =
    !targetStatus ||
    targets.length === 0 ||
    updateM.isPending ||
    recalcState === 'loading';

  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  const isEdit = mode === 'edit';

  // ── Secondary sub-panel applicability (§6.5.7) ──
  const hasHistory = claimHasHistory(claim);
  // Autoryzacja is actionable while the claim can still be routed for /
  // already awaits Maksim sign-off. (See report Deviations — the spec's
  // "doplata > threshold" gate is not exposed to the client; we keep the
  // Phase 4 status-based applicability.)
  const hasAuthorization =
    claim.status === 'NA_WERYFIKACJI' ||
    claim.status === 'OCZEKUJE_NA_AUTORYZACJE';

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* ── Header (non-scrolling) ── */}
      <header className="shrink-0 border-b border-border px-6 pt-6 pb-4 pr-12 sm:px-8 sm:pr-14">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <DialogTitle className="font-mono">
            {t('title', { nrZgl: claim.nrZgl })}
          </DialogTitle>
          <StatusBadge status={claim.status} />
        </div>
        <p className="mt-1 text-sm text-text-sub">
          {t('carrierAndPlate', {
            carrier:
              claim.carrier?.name ?? claim.carrier?.login ?? claim.carrierId,
            plate: claim.vehiclePlateSnapshot,
          })}
        </p>
        <p className="mt-0.5 text-xs text-text-sub">
          {t('submittedAt', { date: formatDateFull(claim.createdAt) })}
        </p>
      </header>

      {/* ── Body (scrolling) ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8 space-y-6">
        {/* Save error — surfaced at the top of the body in edit mode. */}
        {updateM.isError && isEdit && (
          <p
            role="alert"
            className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {tEdit('errorToast')}
          </p>
        )}

        {/* Linked-outing context row (§7.10.4) — plan vs fakt + the static
            auto-recalc badge. Sits at the top of the §6.5.3 fact block. */}
        <LinkedDelegationRow claim={claim} />

        {/* ① Fact pairs */}
        <FactPairs
          claim={claim}
          form={form}
          mode={mode}
          firstInputRef={firstInputRef}
          livePreviewBreakdown={livePreviewBreakdown}
          previewNotYetLoaded={previewNotYetLoaded}
          errMsg={errMsg}
          tUnified={tUnified}
        />

        {/* ② Dopłata — locked / computed, live, ABOVE decyzja */}
        <DoplataBlock
          claim={claim}
          recalcState={recalcState}
          liveDoplata={liveDoplata}
          prog={prog}
          liveDrivenDays={liveDrivenDays}
          showExceedsHint={showExceedsHint}
          tUnified={tUnified}
        />

        {/* ③ Decyzja — at the very bottom */}
        <section className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {tUnified('decyzjaSection')}
          </h3>

          {targets.length === 0 ? (
            <p className="rounded-md border border-border bg-input p-3 text-sm text-text-sub">
              {tUnified('terminalState')}
            </p>
          ) : !isEdit ? (
            // In view mode the decyzja inputs are hidden — the verifier
            // morphs to edit to make a decision.
            <p className="rounded-md border border-border bg-input/40 p-3 text-sm text-text-sub">
              {tUnified('decisionRequired')}
            </p>
          ) : (
            <>
              <DecisionFields
                form={form}
                targets={availableTargets}
                targetStatus={targetStatus}
                postAuthorization={postAuthorization}
                errMsg={errMsg}
                tEdit={tEdit}
                tStatus={tStatus}
              />
              {/* Acceptance gate hint — shown while recalc reports the
                  guarantee was met (no payout due ⇒ accept removed). */}
              {metGuarantee && (
                <p className="text-xs text-text-sub">
                  {tUnified('guaranteeMetHint')}
                </p>
              )}
            </>
          )}
        </section>

        {/* ④ Secondary sub-panel — Historia / Autoryzacja (§6.5.7) */}
        <SecondaryPanel
          claim={claim}
          hasHistory={hasHistory}
          hasAuthorization={hasAuthorization}
          prog={prog}
          onClose={onClose}
        />
      </div>

      {/* ── Footer (non-scrolling) ── */}
      <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-border px-6 py-3 sm:px-8">
        {isEdit ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={cancelEdit}
              disabled={updateM.isPending}
            >
              {tCommon('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={submitDisabled}>
              {updateM.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  {tEdit('submitting')}
                </>
              ) : (
                tEdit('submit')
              )}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              {tCommon('close')}
            </Button>
            {canEdit && targets.length > 0 && (
              <Button
                ref={editButtonRef}
                type="button"
                size="sm"
                onClick={enterEdit}
              >
                <Pencil size={14} aria-hidden />
                {tUnified('edycja')}
              </Button>
            )}
          </>
        )}
      </footer>
    </form>
  );
}

// ── Linked-delegation context row (§7.10.4) ─────────────────────────
//
// Shows the outing the wniosek was filed against: plan (`plannedReturnAt`) vs
// fakt (`actualReturnAt`), plus the STATIC auto-recalc badge (applied/skipped).
// The outing detail (plan/fakt) is fetched by `delegationId`; the badge state is
// read DIRECTLY from `claim.autoRecalcState` (REWORK 2026-06-20 #4 — the old
// `resolveAutoRecalcState` heuristic is gone). Renders nothing when the claim
// has no linked outing.

function LinkedDelegationRow({ claim }: { claim: ClaimDto }) {
  const t = useTranslations('employee.claims.modal.linkedDelegation');
  const tRecalc = useTranslations('claim.autoRecalc');

  if (!claim.delegationId) return null;

  // Plan/fakt return are embedded on the ClaimDto (no separate
  // `GET /delegations/:id`, which pracownik may not read). See claims toDto.
  const plate = claim.vehiclePlateSnapshot || '—';
  const planned = claim.delegationPlannedReturnAt;
  const actual = claim.delegationActualReturnAt;

  const recalcState = claim.autoRecalcState;

  return (
    <section className="space-y-2 rounded-md border border-border bg-input/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('heading')}
        </h3>
        {recalcState !== 'none' && (
          <AutoRecalcBadge
            state={recalcState}
            label={
              recalcState === 'applied'
                ? tRecalc('applied')
                : tRecalc('skipped')
            }
            title={
              recalcState === 'applied'
                ? tRecalc('appliedTooltip', {
                    origDateEnd: formatDateFull(claim.origDateEnd ?? claim.dateEnd),
                    actualReturnAt: formatDateFull(actual),
                  })
                : tRecalc('skippedTooltip', {
                    actualReturnAt: formatDateFull(actual),
                    dateEnd: formatDateFull(claim.dateEnd),
                  })
            }
          />
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3 text-sm">
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
              {t('vehicle')}
            </dt>
            <dd className="font-mono font-semibold text-text">{plate}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
              {t('planned')}
            </dt>
            <dd className="text-text tabular-nums">{formatDateFull(planned)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
              {t('actual')}
            </dt>
            <dd className="text-text tabular-nums">{formatDateFull(actual)}</dd>
          </div>
      </dl>
    </section>
  );
}

// ── ① Fact pairs ────────────────────────────────────────────────────

interface FactPairsProps {
  claim: ClaimDto;
  form: UseFormReturn<FormValues>;
  mode: ClaimModalMode;
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  /** Live km-calc breakdown from `previewQ.data` — recomputed from the
   *  verifier's CURRENT working times. `null` until the first preview lands. */
  livePreviewBreakdown: KmCalcBreakdown | null;
  /** `true` only before the first preview response — drives the persisted
   *  breakdown fallback so the readout never renders "—" / NaN. */
  previewNotYetLoaded: boolean;
  errMsg: (key: string) => string | undefined;
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
}

function FactPairs({
  claim,
  form,
  mode,
  firstInputRef,
  livePreviewBreakdown,
  previewNotYetLoaded,
  errMsg,
  tUnified,
}: FactPairsProps) {
  const isEdit = mode === 'edit';

  // Declared (carrier) sources — fall back to the live value for legacy
  // claims where the orig* snapshot is null (§6.5.3).
  const declared = {
    dateStart: claim.origDateStart ?? claim.dateStart,
    dateEnd: claim.origDateEnd ?? claim.dateEnd,
    timeFrom: claim.origTimeFrom ?? claim.timeFrom,
    timeTo: claim.origTimeTo ?? claim.timeTo,
    mileage: claim.origMileage ?? claim.mileage,
  };

  return (
    <section className="space-y-3">
      {/* Two-column section headers — verifier column only labelled in edit. */}
      <div
        className={cn(
          'grid gap-x-4',
          isEdit ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1',
        )}
      >
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {tUnified('declaredHeader')}
        </h3>
        {isEdit && (
          <div className="hidden md:block">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
              {tUnified('verifiedHeader')}
            </h3>
            <p className="text-xs text-text-sub font-normal normal-case tracking-normal">
              {tUnified('verifiedHint')}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {/* 1 — dateStart */}
        <FactPairRow
          label={tUnified('dateStart')}
          isEdit={isEdit}
          declaredCaption={tUnified('declaredCaption')}
          declaredText={formatDateFull(declared.dateStart)}
          verifierDisplay={formatDateFull(claim.dateStart)}
          input={(() => {
            // Merge RHF's `ref` with `firstInputRef` so enter-edit focus
            // lands here without overwriting register's own ref.
            const { ref: rhfRef, ...rest } = form.register('dateStart');
            return (
              <Input
                ref={(el) => {
                  rhfRef(el);
                  firstInputRef.current = el;
                }}
                type="date"
                aria-label={`${tUnified('verifiedHeader')} — ${tUnified('dateStart')}`}
                {...rest}
              />
            );
          })()}
          error={errMsg('dateStart')}
        />

        {/* 2 — dateEnd */}
        <FactPairRow
          label={tUnified('dateEnd')}
          isEdit={isEdit}
          declaredCaption={tUnified('declaredCaption')}
          declaredText={formatDateFull(declared.dateEnd)}
          verifierDisplay={formatDateFull(claim.dateEnd)}
          input={
            <Input
              type="date"
              aria-label={`${tUnified('verifiedHeader')} — ${tUnified('dateEnd')}`}
              {...form.register('dateEnd')}
            />
          }
          error={errMsg('dateEnd')}
        />

        {/* 3 — timeFrom (declared from origTimeFrom, NOT the live field) */}
        <FactPairRow
          label={tUnified('timeFrom')}
          isEdit={isEdit}
          declaredCaption={tUnified('declaredCaption')}
          declaredText={declared.timeFrom}
          verifierDisplay={claim.timeFrom}
          input={
            <Input
              type="time"
              aria-label={`${tUnified('verifiedHeader')} — ${tUnified('timeFrom')}`}
              {...form.register('timeFrom')}
            />
          }
          error={errMsg('timeFrom')}
        />

        {/* 4 — timeTo (declared from origTimeTo, NOT the live field) */}
        <FactPairRow
          label={tUnified('timeTo')}
          isEdit={isEdit}
          declaredCaption={tUnified('declaredCaption')}
          declaredText={declared.timeTo}
          verifierDisplay={claim.timeTo}
          input={
            <Input
              type="time"
              aria-label={`${tUnified('verifiedHeader')} — ${tUnified('timeTo')}`}
              {...form.register('timeTo')}
            />
          }
          error={errMsg('timeTo')}
        />

        {/* 5 — mileage */}
        <FactPairRow
          label={tUnified('mileage')}
          isEdit={isEdit}
          declaredCaption={tUnified('declaredCaption')}
          declaredText={`${Math.round(declared.mileage).toLocaleString('pl-PL')} km`}
          declaredNumeric
          verifierDisplay={`${Math.round(claim.mileage).toLocaleString('pl-PL')} km`}
          input={
            <Input
              type="number"
              step="1"
              min={0}
              aria-label={`${tUnified('verifiedHeader')} — ${tUnified('mileage')}`}
              {...form.register('mileage', {
                setValueAs: (v) =>
                  v === '' || v === null ? undefined : Number(v),
              })}
            />
          }
          error={errMsg('mileage')}
        />

        {/* 6 — hoursAdjusted — INPUT ONLY (no declared cell, never `0`). */}
        <HoursAdjustedFact
          claim={claim}
          form={form}
          mode={mode}
          livePreviewBreakdown={livePreviewBreakdown}
          previewNotYetLoaded={previewNotYetLoaded}
          errMsg={errMsg}
          tUnified={tUnified}
        />
      </div>
    </section>
  );
}

/**
 * One fact pair. In `edit` the declared value is a muted read-only field
 * (left/top, §6.5.3 muted treatment — NO lock icon) and the verifier input
 * sits right/below. In `view` only the verifier (saved) value renders as a
 * <dl> static row.
 */
function FactPairRow({
  label,
  isEdit,
  declaredCaption,
  declaredText,
  declaredNumeric = false,
  verifierDisplay,
  input,
  error,
}: {
  label: string;
  isEdit: boolean;
  declaredCaption: string;
  declaredText: string;
  declaredNumeric?: boolean;
  verifierDisplay: string;
  input: React.ReactNode;
  error?: string;
}) {
  if (!isEdit) {
    // View mode — single static row (the saved checked value).
    return (
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/60">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
            {label}
          </dt>
          <dd className="text-sm text-text tabular-nums text-right">
            {verifierDisplay}
          </dd>
        </div>
      </div>
    );
  }

  // Edit mode — declared (muted) + verifier input pair.
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 md:grid-cols-2">
      {/* Declared (muted, read-only — reference, no lock icon) */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
          {label}
        </span>
        <div
          className={cn(
            'flex h-10 w-full items-center rounded-[10px] border border-border bg-input/40 px-3.5 text-[14px] text-text-sub',
            declaredNumeric && 'tabular-nums',
          )}
          aria-readonly="true"
          title={declaredCaption}
        >
          {declaredText}
        </div>
      </div>
      {/* Verifier input */}
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-sub md:invisible md:select-none">
          {label}
        </span>
        {input}
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Fact #6 — hoursAdjusted. INPUT ONLY (no declared cell; never render `0`
 * as a declared value, §6.5.3). The live `HoursReadout` renders under the
 * input. In view mode it collapses to a static readout of the applied value.
 */
function HoursAdjustedFact({
  claim,
  form,
  mode,
  livePreviewBreakdown,
  previewNotYetLoaded,
  errMsg,
  tUnified,
}: {
  claim: ClaimDto;
  form: UseFormReturn<FormValues>;
  mode: ClaimModalMode;
  livePreviewBreakdown: KmCalcBreakdown | null;
  previewNotYetLoaded: boolean;
  errMsg: (key: string) => string | undefined;
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
}) {
  const isEdit = mode === 'edit';
  const error = errMsg('hoursAdjusted');

  if (!isEdit) {
    // §6.5.3 / §6.5.10: in read-only `view` the stoppage row appears ONLY when
    // a correction was actually applied. The carrier never enters a stoppage,
    // so an empty row here is pure noise — omit label + value entirely.
    if (claim.hoursAdjustedValue == null || claim.hoursAdjustedValue <= 0) {
      return null;
    }
    return (
      <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <div className="flex flex-col gap-1 py-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
            {tUnified('hoursAdjusted')}
          </span>
          <HoursReadout
            rawTotalDays={claim.breakdown?.rawTotalDays ?? null}
            totalDays={claim.breakdown?.totalDays ?? null}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
      {/* No declared cell — keep the input in the verifier (right) column to
          stay aligned with its row siblings; the declared column is empty. */}
      <div className="hidden md:block" aria-hidden />
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
          {tUnified('hoursAdjusted')}
        </span>
        <Input
          type="number"
          step="0.5"
          min={0}
          aria-label={tUnified('hoursAdjusted')}
          {...form.register('hoursAdjusted', {
            setValueAs: (v) =>
              v === '' || v === null ? undefined : Number(v),
          })}
        />
        <div className="mt-1">
          {(() => {
            // Both numbers come from the SAME live preview that drives the
            // dopłata (§6.5.4) — rawTotalDays (pre-korekta, EDITED times) and
            // totalDays (post-korekta, EDITED times). So `surowych` and
            // `zaliczonych` both track the verifier's GODZ. ZJAZDU/PRZYJAZDU
            // edits and differ by exactly the korekta — matching the payment.
            // Fallback to the persisted breakdown ONLY before the first preview
            // response arrives (so we never render "—"/NaN). `previewQ.data` is
            // retained across in-flight debounced recalcs (placeholderData), so
            // once loaded it never snaps back — no number flicker.
            const source =
              previewNotYetLoaded || livePreviewBreakdown == null
                ? claim.breakdown
                : livePreviewBreakdown;
            return (
              <HoursReadout
                live
                rawTotalDays={source?.rawTotalDays ?? null}
                totalDays={source?.totalDays ?? null}
              />
            );
          })()}
        </div>
        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

// ── ② Dopłata block ─────────────────────────────────────────────────

function DoplataBlock({
  claim,
  recalcState,
  liveDoplata,
  prog,
  liveDrivenDays,
  showExceedsHint,
  tUnified,
}: {
  claim: ClaimDto;
  recalcState: 'idle' | 'loading' | 'success' | 'error';
  liveDoplata: number;
  /** Live authorization threshold (EUR) for this claim's driven-days band. */
  prog: number;
  /** Driven working days the threshold band is derived from (for the hint). */
  liveDrivenDays: number;
  /** `true` when dopłata > próg AND the claim is still pre-decision. */
  showExceedsHint: boolean;
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
}) {
  const tEdit = useTranslations('employee.claims.modal.edit');

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {tUnified('doplataSection')}
        </h3>
        <RecalcBadge
          state={recalcState}
          baseAmount={claim.paymentEur}
          previewAmount={liveDoplata}
        />
      </div>

      {/* Locked / computed field — same recipe as amountApproved (§6.5.4):
          muted surface, muted text, no focus, <Lock> affordance, title hint.
          Rendered as a static value (not an RHF input) because the dopłata
          itself is never submitted directly — it's the recomputed preview. */}
      <div className="relative">
        <div
          className="flex h-10 w-full items-center rounded-[10px] border border-border bg-input/40 px-3.5 pr-9 text-[14px] font-semibold tabular-nums text-text-sub"
          aria-readonly="true"
          title={tEdit('amountApprovedLocked')}
        >
          {formatEur(liveDoplata)}
        </div>
        <Lock
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-text-sub/70"
        />
      </div>
      <FormDescription className="flex items-center gap-1">
        <Lock aria-hidden className="size-3 shrink-0" />
        {tEdit('amountApprovedAuto')}
      </FormDescription>

      {/* Soft próg-autoryzacji hint — informational only, never blocks
          (matches legacy). Shown when the live dopłata exceeds the threshold
          for this claim's driven-days band AND the claim is still
          pre-decision. */}
      {showExceedsHint && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md bg-warning-bg px-3 py-2 text-sm text-warning-dark dark:bg-warning/15 dark:text-warning"
        >
          <AlertTriangle size={15} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {tUnified('progExceededHint', {
              prog: formatEur(prog),
              days: Math.max(0, Math.round(liveDrivenDays)),
            })}
          </span>
        </p>
      )}

      {claim.breakdown && (
        <div className="pt-1">
          <BreakdownTable breakdown={claim.breakdown} />
        </div>
      )}
    </section>
  );
}

// ── ③ Decision fields ───────────────────────────────────────────────

function DecisionFields({
  form,
  targets,
  targetStatus,
  postAuthorization,
  errMsg,
  tEdit,
  tStatus,
}: {
  form: UseFormReturn<FormValues>;
  targets: ClaimDecisionTarget[];
  targetStatus: FormValues['targetStatus'];
  /** True when this claim came through Maksim's authorization flow
   *  (status OCZEKUJE_NA_AUTORYZACJE) — the kwota zatwierdzona becomes an
   *  editable input prefilled with kwota Maksima instead of a locked field. */
  postAuthorization: boolean;
  errMsg: (key: string) => string | undefined;
  tEdit: ReturnType<typeof useTranslations<'employee.claims.modal.edit'>>;
  tStatus: ReturnType<
    typeof useTranslations<'employee.claims.modal.targetStatus'>
  >;
}) {
  return (
    <div className="space-y-4">
      <FormField
        label={tEdit('targetStatus')}
        required
        error={errMsg('targetStatus')}
        htmlFor="claim-targetStatus"
      >
        <Controller
          control={form.control}
          name="targetStatus"
          render={({ field }) => (
            <Select
              id="claim-targetStatus"
              value={field.value}
              onChange={(e) =>
                field.onChange(e.target.value as ClaimDecisionTarget)
              }
            >
              <option value="">{tEdit('targetStatusPlaceholder')}</option>
              {targets.map((target) => (
                <option key={target} value={target}>
                  {tStatus(target)}
                </option>
              ))}
            </Select>
          )}
        />
      </FormField>

      {targetStatus === 'ZAAKCEPTOWANO' && (
        <FormGrid cols={2}>
          <FormField
            label={tEdit('orderNumber')}
            required
            error={errMsg('orderNumber')}
            htmlFor="claim-orderNumber"
          >
            <Input id="claim-orderNumber" {...form.register('orderNumber')} />
          </FormField>
          <FormField
            label={tEdit('orderDate')}
            required
            error={errMsg('orderDate')}
            htmlFor="claim-orderDate"
          >
            <Input
              id="claim-orderDate"
              type="date"
              {...form.register('orderDate')}
            />
          </FormField>
          <FormField
            label={tEdit('amountApproved')}
            required
            error={errMsg('amountApproved')}
            htmlFor="claim-amountApproved"
            className="col-span-2"
          >
            {postAuthorization ? (
              // Post-authorization accept (OCZEKUJE_NA_AUTORYZACJE): the field
              // is EDITABLE and prefilled with kwota Maksima (getDefaults). The
              // verifier enters the amount Maksim approved by e-mail; that
              // user-typed value flows through the PATCH `amountApproved` and
              // is NOT overwritten by the live-dopłata effect (gated off above).
              <>
                <Input
                  id="claim-amountApproved"
                  type="number"
                  step="0.01"
                  min={0}
                  {...form.register('amountApproved', {
                    setValueAs: (v) =>
                      v === '' || v === null ? undefined : Number(v),
                  })}
                />
                <FormDescription>
                  {tEdit('amountApprovedFromMaksim')}
                </FormDescription>
              </>
            ) : (
              <>
                {/* Same locked/computed field as the dopłata block (§6.5.5) —
                    bound to the live-computed value; verifier does NOT type
                    into it. `readOnly` (not `disabled`) keeps it
                    RHF-registered + submitted. */}
                <div className="relative">
                  <Input
                    id="claim-amountApproved"
                    type="number"
                    step="0.01"
                    min={0}
                    readOnly
                    tabIndex={-1}
                    aria-readonly="true"
                    title={tEdit('amountApprovedLocked')}
                    className="bg-input/40 pr-9 font-semibold tabular-nums text-text-sub cursor-not-allowed focus:border-border focus:ring-0"
                    {...form.register('amountApproved', {
                      setValueAs: (v) =>
                        v === '' || v === null ? undefined : Number(v),
                    })}
                  />
                  <Lock
                    aria-hidden
                    className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-text-sub/70"
                  />
                </div>
                <FormDescription className="flex items-center gap-1">
                  <Lock aria-hidden className="size-3 shrink-0" />
                  {tEdit('amountApprovedAuto')}
                </FormDescription>
              </>
            )}
          </FormField>
          <FormField
            label={tEdit('comment')}
            error={errMsg('comment')}
            htmlFor="claim-comment-accept"
            className="col-span-2"
          >
            <Textarea
              id="claim-comment-accept"
              rows={3}
              {...form.register('comment')}
            />
          </FormField>
        </FormGrid>
      )}

      {targetStatus === 'ODRZUCONO' && (
        <FormField
          label={tEdit('commentRejected')}
          required
          error={errMsg('comment')}
          htmlFor="claim-comment-reject"
        >
          <Textarea
            id="claim-comment-reject"
            rows={5}
            {...form.register('comment')}
          />
        </FormField>
      )}

      {targetStatus === 'OCZEKUJE_NA_AUTORYZACJE' && (
        <div className="space-y-3">
          <FormField
            label={tEdit('margin')}
            required
            error={errMsg('margin')}
            htmlFor="claim-margin"
          >
            <Input
              id="claim-margin"
              type="number"
              step="0.01"
              {...form.register('margin', {
                setValueAs: (v) =>
                  v === '' || v === null ? undefined : Number(v),
              })}
            />
          </FormField>
          <FormField
            label={tEdit('authorizationDescription')}
            required
            error={errMsg('authorizationDescription')}
            htmlFor="claim-authDesc"
          >
            <Textarea
              id="claim-authDesc"
              rows={5}
              {...form.register('authorizationDescription')}
            />
          </FormField>
        </div>
      )}

      {targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO' && (
        <div className="space-y-3">
          <FormField
            label={tEdit('reklamacjaAmount')}
            required
            error={errMsg('reklamacjaAmount')}
            htmlFor="claim-reklamacjaAmount"
          >
            <Input
              id="claim-reklamacjaAmount"
              type="number"
              step="0.01"
              min={0}
              {...form.register('reklamacjaAmount', {
                setValueAs: (v) =>
                  v === '' || v === null ? undefined : Number(v),
              })}
            />
          </FormField>
          <FormField
            label={tEdit('commentReklamacja')}
            required
            error={errMsg('comment')}
            htmlFor="claim-comment-rek-accept"
          >
            <Textarea
              id="claim-comment-rek-accept"
              rows={4}
              {...form.register('comment')}
            />
          </FormField>
        </div>
      )}

      {targetStatus === 'REKLAMACJA_ODRZUCONO' && (
        <FormField
          label={tEdit('commentReklamacja')}
          required
          error={errMsg('comment')}
          htmlFor="claim-comment-rek-reject"
        >
          <Textarea
            id="claim-comment-rek-reject"
            rows={5}
            {...form.register('comment')}
          />
        </FormField>
      )}
    </div>
  );
}

// ── ④ Secondary sub-panel (Historia / Autoryzacja, §6.5.7) ──────────

function SecondaryPanel({
  claim,
  hasHistory,
  hasAuthorization,
  prog,
  onClose,
}: {
  claim: ClaimDto;
  hasHistory: boolean;
  hasAuthorization: boolean;
  /** Live authorization threshold (EUR), surfaced in the request form. */
  prog: number;
  onClose: () => void;
}) {
  const t = useTranslations('employee.claims.modal.unified');

  if (!hasHistory && !hasAuthorization) return null;

  // Only one applies → single labelled section, no Tabs chrome.
  if (hasHistory && !hasAuthorization) {
    return (
      <section className="border-t border-border pt-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('secondaryHistory')}
        </h3>
        <HistorySection claim={claim} />
      </section>
    );
  }
  if (hasAuthorization && !hasHistory) {
    return (
      <section className="border-t border-border pt-5 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('secondaryAuthorization')}
        </h3>
        <AuthorizationSection claim={claim} prog={prog} onClose={onClose} />
      </section>
    );
  }

  // Both apply → secondary Tabs.
  return (
    <section className="border-t border-border pt-5">
      <Tabs defaultValue="history" className="flex flex-col gap-4">
        <TabsList>
          <TabsTrigger value="history">{t('secondaryHistory')}</TabsTrigger>
          <TabsTrigger value="authorization">
            {t('secondaryAuthorization')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="history">
          <HistorySection claim={claim} />
        </TabsContent>
        <TabsContent value="authorization">
          <AuthorizationSection claim={claim} prog={prog} onClose={onClose} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

/** True when the claim carries an orig* snapshot or a recorded decision. */
function claimHasHistory(claim: ClaimDto): boolean {
  return (
    claim.origDateStart !== null ||
    claim.origDateEnd !== null ||
    claim.origMileage !== null ||
    (claim.origHoursAdjusted !== null &&
      claim.origHoursAdjusted !== claim.hoursAdjustedValue) ||
    claim.decidedById !== null
  );
}

// ── Historia (diff orig→current) ───────────────────────────────────

function HistorySection({ claim }: { claim: ClaimDto }) {
  const t = useTranslations('employee.claims.modal.history');

  const hasOrig =
    claim.origDateStart !== null ||
    claim.origDateEnd !== null ||
    claim.origMileage !== null ||
    (claim.origHoursAdjusted !== null &&
      claim.origHoursAdjusted !== claim.hoursAdjustedValue);

  return (
    <div className="space-y-4">
      {claim.decidedBy && (
        <div className="rounded-md border border-border bg-input p-3 space-y-1 text-sm">
          <p>
            {t('decidedBy', {
              actor:
                claim.decidedBy.name ??
                claim.decidedBy.login ??
                claim.decidedById ??
                '—',
            })}
          </p>
          {claim.statusChangedAt && (
            <p className="text-text-sub text-xs">
              {t('decidedAt', { date: formatDateFull(claim.statusChangedAt) })}
            </p>
          )}
        </div>
      )}

      {hasOrig && (
        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('origData')}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <DiffRow
              label={t('origDateStart')}
              orig={formatDateFull(claim.origDateStart)}
              current={formatDateFull(claim.dateStart)}
            />
            <DiffRow
              label={t('origDateEnd')}
              orig={formatDateFull(claim.origDateEnd)}
              current={formatDateFull(claim.dateEnd)}
            />
            <DiffRow
              label={t('origMileage')}
              orig={
                claim.origMileage != null
                  ? `${Math.round(claim.origMileage).toLocaleString('pl-PL')} km`
                  : '—'
              }
              current={`${Math.round(claim.mileage).toLocaleString('pl-PL')} km`}
            />
            {claim.origHoursAdjusted !== null &&
              claim.origHoursAdjusted !== claim.hoursAdjustedValue && (
                <DiffRow
                  label={t('origHoursAdjusted')}
                  orig={`${claim.origHoursAdjusted} h`}
                  current={`${claim.hoursAdjustedValue ?? 0} h`}
                />
              )}
          </div>
        </section>
      )}

      {claim.reklamacjaText && (
        <section className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('reklamacjaText')}
          </h4>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-input p-3 text-sm">
            {claim.reklamacjaText}
          </p>
        </section>
      )}

      {claim.reklamacjaResponse && (
        <section className="space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('reklamacjaResponse')}
          </h4>
          <p className="whitespace-pre-wrap rounded-md border border-border bg-input p-3 text-sm">
            {claim.reklamacjaResponse}
          </p>
        </section>
      )}
    </div>
  );
}

function DiffRow({
  label,
  orig,
  current,
}: {
  label: string;
  orig: string;
  current: string;
}) {
  const changed = orig !== current;
  return (
    <div className="text-sm space-y-0.5">
      <p className="text-xs font-medium text-text-sub">{label}</p>
      <p className="text-text-sub">{changed ? <s>{orig}</s> : orig}</p>
      <p
        className={
          changed
            ? 'rounded-sm bg-warning/10 px-1.5 py-0.5 inline-block text-text font-semibold'
            : 'text-text'
        }
      >
        {current}
      </p>
    </div>
  );
}

// ── Autoryzacja section ─────────────────────────────────────────────

interface AuthFormValues {
  kwotaMaksima: number | undefined;
  comment: string;
}

const AUTH_COMMENT_MAX = 2_000;

function AuthorizationSection({
  claim,
  prog,
  onClose,
}: {
  claim: ClaimDto;
  /** Live authorization threshold (EUR) surfaced in the request form. */
  prog: number;
  onClose: () => void;
}) {
  const t = useTranslations('employee.claims.modal.auth');
  const tCommon = useTranslations('common');

  // Already pending — read-only summary.
  if (claim.status === 'OCZEKUJE_NA_AUTORYZACJE') {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-input p-3 space-y-1">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('pendingTitle')}
          </h4>
          <p className="text-xs text-text-sub">{t('alreadyPending')}</p>
          {claim.authorizationDescription && (
            <>
              <p className="text-xs text-text-sub pt-2">
                {t('pendingDescription')}
              </p>
              <p className="whitespace-pre-wrap text-sm text-text">
                {claim.authorizationDescription}
              </p>
            </>
          )}
        </div>

        {claim.amountMaximum != null && (
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-sub">
              {t('pendingMaximumLabel')}
            </p>
            <p className="text-sm font-semibold text-text tabular-nums">
              {formatEur(claim.amountMaximum)}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Pre-decision (NA_WERYFIKACJI) — request-authorization form (NO FileUpload).
  return (
    <RequestAuthorizationForm
      claim={claim}
      prog={prog}
      onClose={onClose}
      t={t}
      tCommon={tCommon}
    />
  );
}

function RequestAuthorizationForm({
  claim,
  prog,
  onClose,
  t,
  tCommon,
}: {
  claim: ClaimDto;
  /** Live authorization threshold (EUR) for this claim's driven-days band. */
  prog: number;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<'employee.claims.modal.auth'>>;
  tCommon: ReturnType<typeof useTranslations<'common'>>;
}) {
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(
      RequestAuthorizationSchema,
    ) as Resolver<AuthFormValues>,
    defaultValues: {
      kwotaMaksima:
        claim.amountMaximum ??
        (Number.isFinite(claim.paymentEur) ? claim.paymentEur : undefined),
      comment: '',
    },
  });

  const requestM = useRequestAuthorization(claim.nrZgl, {
    onSuccess: () => {
      toast.success(t('emailSent'));
      onClose();
    },
    onError: (err) => {
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tCommon('errorGeneric');
      toast.error(msg);
    },
  });

  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  // The parent surface already renders a <form> wrapper for the main edit
  // submit — nested <form>s are invalid HTML. We render the
  // request-authorization fields inside a plain <div> and trigger the
  // mutation from a type="button" handler via RHF's handleSubmit.
  const onValid: SubmitHandler<AuthFormValues> = (values) => {
    if (values.kwotaMaksima == null || !Number.isFinite(values.kwotaMaksima)) {
      return;
    }
    // zodResolver returns the TRANSFORMED values, so by the time `onValid`
    // runs `values.comment` is already a non-empty, trimmed string — the
    // schema's `.trim().min(1)` blocks empty comments BEFORE this callback and
    // surfaces the (localized) required error at the FormField. No `|| undefined`
    // dance: `RequestAuthorizationDto.comment` is a required `string`.
    const body: RequestAuthorizationDto = {
      kwotaMaksima: Number(values.kwotaMaksima),
      comment: values.comment,
    };
    void requestM.mutateAsync(body).catch(() => {
      // Error surfaced via onError — swallow to avoid unhandled rejection.
    });
  };

  const handleRequestClick = () => {
    void form.handleSubmit(onValid)();
  };

  const commentValue = form.watch('comment') ?? '';
  const commentLen = commentValue.length;
  const fieldId = useId();

  const submitDisabled =
    requestM.isPending ||
    form.watch('kwotaMaksima') == null ||
    !(Number(form.watch('kwotaMaksima')) > 0);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border bg-input p-3 space-y-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('requestTitle')}
        </h4>
        <p className="text-xs text-text-sub">{t('requestHelp')}</p>
        {/* Always-visible informational threshold line (soft hint, no gate). */}
        <p className="text-xs text-text-sub tabular-nums">
          {t('progLine', { prog: formatEur(prog) })}
        </p>
      </div>

      <FormField
        label={t('kwotaMaksimaLabel')}
        required
        description={t('kwotaMaksimaHelp')}
        error={errMsg('kwotaMaksima')}
        htmlFor={`${fieldId}-kwotaMaksima`}
      >
        <Input
          id={`${fieldId}-kwotaMaksima`}
          type="number"
          step="0.01"
          min={0}
          inputMode="decimal"
          {...form.register('kwotaMaksima', {
            setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)),
          })}
        />
      </FormField>

      <FormField
        label={t('commentLabel')}
        required
        error={errMsg('comment')}
        htmlFor={`${fieldId}-comment`}
      >
        <Textarea
          id={`${fieldId}-comment`}
          rows={4}
          maxLength={AUTH_COMMENT_MAX}
          placeholder={t('commentPlaceholder')}
          {...form.register('comment')}
        />
        <p className="text-xs text-text-sub text-right tabular-nums">
          {commentLen} / {AUTH_COMMENT_MAX}
        </p>
      </FormField>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={handleRequestClick}
          disabled={submitDisabled}
        >
          {requestM.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {t('submitting')}
            </>
          ) : (
            t('requestButton')
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function getDefaults(claim: ClaimDto): FormValues {
  return {
    // §6.5.5 / §6.5.10: never pre-select a decision. The select shows its
    // placeholder («wybierz decyzję»), so no conditional decision fields
    // (orderNumber/orderDate/amountApproved…) render and steal focus/scroll
    // on enter-edit. Required-field validation fires only on «Zapisz».
    targetStatus: '',
    dateStart: claim.dateStart.slice(0, 10),
    dateEnd: claim.dateEnd.slice(0, 10),
    timeFrom: claim.timeFrom,
    timeTo: claim.timeTo,
    mileage: claim.mileage,
    hoursAdjusted: claim.hoursAdjustedValue ?? 0,
    orderNumber: claim.orderNumber ?? '',
    orderDate: claim.orderDate ?? '',
    // Post-authorization accept (OCZEKUJE_NA_AUTORYZACJE) prefills the editable
    // kwota zatwierdzona with kwota Maksima so the verifier only tweaks it to
    // what Maksim approved by e-mail; amountMaximum is always set on the
    // request-authorization path, so paymentEur is a defensive fallback only.
    amountApproved:
      claim.status === 'OCZEKUJE_NA_AUTORYZACJE'
        ? claim.amountApproved ??
          claim.amountMaximum ??
          claim.paymentEur ??
          undefined
        : claim.amountApproved ?? claim.paymentEur ?? undefined,
    amountMaximum: claim.amountMaximum ?? undefined,
    comment: claim.comment ?? '',
    margin: claim.margin ?? undefined,
    authorizationDescription: claim.authorizationDescription ?? '',
    reklamacjaAmount: claim.reklamacjaAmount ?? undefined,
  };
}

export default ClaimModal;
