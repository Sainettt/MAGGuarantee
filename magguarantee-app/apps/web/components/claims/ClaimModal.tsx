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
//   ②a NOTATKI — who wrote what (UWAGI #4): «Komentarz przewoźnika» (the
//      carrier's submit note) + MAGTRANS's «Uzasadnienie decyzji» / «Powód
//      odrzucenia», each tagged with its author. Omitted when both are empty.
//   ②b MAKSIM-GATE — automatic over-threshold authorization block (§6.5.7),
//      rendered only while the claim sits in `OCZEKUJE_NA_AUTORYZACJE`.
//   ③ DECYZJA — targetStatus select + conditional fields (§6.5.5), at bottom.
//      On a mixed period with gaps on the km board, the amber «brak danych»
//      notice sits first inside it and `ZAAKCEPTOWANO` is not offered
//      (docs/14 §16.5.6, docs/20 §0⁵).
//   ④ Secondary Historia sub-panel (§6.5.7) — single section, omitted if empty.
//
// Authorization is ENTIRELY automatic (этап 4/5.1): the backend routes a claim
// into `OCZEKUJE_NA_AUTORYZACJE` when the dopłata exceeds Maksim's threshold at
// verification-save time, and rolls it back to `NA_WERYFIKACJI` if a later edit
// drops under the threshold. There is NO manual «request authorization» / «kwota
// Maksima» flow — the only authorization surface is `MaksimGateBlock` (upload
// Maksim's confirmation screenshot to unblock the decision).
//
// The form contract is unchanged from Phase 4: `UpdateClaimSchema`
// discriminated union, the custom `updateClaimResolver` + `cleanUpdatePayload`
// (strips sibling-variant keys so the strict union validates), `useUpdateClaim`,
// `useClaimPreviewExisting`. Only the surface and the layout order change.

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BadgeCheck,
  CalendarX,
  Download,
  Eye,
  Gavel,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Truck,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
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
  CLAIM_BOARD_CHANGED,
  CLAIM_BOARD_INCOMPLETE,
  UpdateClaimSchema,
  getAuthThreshold,
  isCompensationDue,
  resolveReklamacjaCap,
  type ClaimBoardSettlement,
  type ClaimDto,
  type ClaimStatus,
  type KmCalcBreakdown,
  type PreviewClaimDto,
  type Role,
  type UpdateClaimDto,
  type VerifyClaimDto,
} from '@magguarantee/shared';

import { BreakdownTable } from '@/components/carrier/BreakdownTable';
import { StatusBadge } from '@/components/carrier/StatusBadge';
import { AutoRecalcBadge } from '@/components/claims/AutoRecalcBadge';
import { HoursReadout } from '@/components/claims/HoursReadout';
import { RecalcBadge } from '@/components/claims/RecalcBadge';
import RecalcLimitsDialog from '@/components/claims/RecalcLimitsDialog';
import { ReklamacjaResolutionChip } from '@/components/claims/ReklamacjaResolutionChip';
import {
  deriveClaimPermissions,
  type ClaimModalMode,
  type ClaimPermissions,
} from '@/components/claims/claim-permissions';
import {
  decisionTargetsFor,
  type ClaimDecisionTarget,
} from '@/components/claims/claim-transitions';
import { FormDescription, FormField, FormGrid } from '@/components/forms/Form';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/Dialog';
import {
  FileUpload,
  type FileUploadItem,
  type FileUploadLabels,
} from '@/components/ui/FileUpload';
import { Input } from '@/components/ui/Input';
import { LockNotice } from '@/components/ui/LockNotice';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { Textarea } from '@/components/ui/Textarea';
import { downloadAuthorizationConfirmation } from '@/lib/api/claims';
import { ApiResponseError } from '@/lib/api/client';
import {
  formatBoardDate,
  isBoardIncomplete,
  isBoardSettled,
  isMissingDatesCollapsible,
  missesLastDay,
  sortMissingDates,
  visibleMissingDates,
} from '@/lib/claims/breakdownGuarantee';
import { boardSumHintKm } from '@/lib/claims/boardSumHint';
import { carrierNote, decisionNote } from '@/lib/claims/claimNotes';
import { verifierMovedAmount } from '@/lib/claims/money';
import {
  selectAmountSource,
  shortfallView,
  type ShortfallView,
} from '@/lib/claims/shortfall';
import { formatDateFull, formatEur } from '@/lib/format/numbers';
import {
  CLAIMS_KEY,
  useClaim,
  useClaimPreviewExisting,
  useUpdateClaim,
  useUploadAuthorizationConfirmation,
  useVerifyClaim,
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
  /**
   * Wire field `comment`; the server maps it per branch (UWAGI #4, 2026-10-22):
   * ZAAKCEPTOWANO / ODRZUCONO → `decisionComment`, REKLAMACJA_* →
   * `reklamacjaResponse`. Never the carrier's own `claim.comment`.
   */
  comment: string;
  /**
   * REKLAMACJA_ZAAKCEPTOWANO only — «Nr zlecenia» the uznana reklamacja is paid
   * under. An INDEPENDENT field: the wniosek's own `orderNumber` is never
   * touched (it only seeds this one). REWORK 2026-07-31 replaced the old
   * editable `reklamacjaAmount` — the paid amount IS the carrier's kwota and the
   * accept branch of `UpdateClaimSchema` is `.strict()` without it.
   */
  reklamacjaOrderNumber: string;
}

export type { ClaimModalMode };

interface ClaimModalProps {
  open: boolean;
  nrZgl: string | null;
  /** Initial mode on open. Row-click seeds `'view'`. */
  initialMode?: ClaimModalMode;
  /** Whether the «Edycja» affordance is shown (admin / pracownik only). For
   *  read-only roles the modal stays in `view` with no edit button. */
  canEdit?: boolean;
  /**
   * The viewer's role. Passed EXPLICITLY (never inferred from `canEdit`, which
   * collapses admin and pracownik into one boolean) because §6.5.13/§6.5.14
   * gate whole sections on admin-vs-pracownik — see `deriveClaimPermissions`.
   */
  role?: Role;
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
  // the server falls back to the claim's persisted mileage (no crash, just a
  // momentary fallback — NOT the board sum; that is `boardSumKm` on the
  // response). The verifier's mileage edit ALSO still flows through the PATCH
  // (UpdateClaimCorrectionFields.mileage) as before.
  const hoursAdjusted =
    v.hoursAdjusted !== undefined && Number.isFinite(v.hoursAdjusted)
      ? Number(v.hoursAdjusted)
      : 0;
  const mileageOverride =
    v.mileage !== undefined &&
    Number.isFinite(v.mileage) &&
    Number(v.mileage) >= 0
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
  // Validation runs against the payload shape WITH corrections — the resolver
  // has no access to the permission object and every correction field is
  // optional in the schema, so including them is the strictly safer check.
  const cleaned = cleanUpdatePayload(values, true);
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

/**
 * Drop empty / undefined values so Zod's `.strict()` doesn't choke.
 *
 * `includeCorrections` comes from `ClaimPermissions.payloadIncludesCorrections`
 * — the SAME flag that decides whether the fact block renders inputs. When the
 * fact block is read-only (pracownik @ OCZEKUJE_NA_AUTORYZACJE, §6.5.13 case 2)
 * the 6 correction fields are stripped, so the decision PATCH can never carry a
 * field the user was not allowed to touch.
 */
function cleanUpdatePayload(
  values: FormValues,
  includeCorrections: boolean,
): UpdateClaimDto {
  const out: Record<string, unknown> = { targetStatus: values.targetStatus };
  const include = (k: string, v: unknown) => {
    if (v === '' || v === undefined || v === null) return;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    out[k] = v;
  };
  // ZAAKCEPTOWANO is the ONLY branch of the strict union that still accepts the
  // 6 correction fields. Since the 2026-07-31 rework a reklamacja decision never
  // amends carrier data (no period / times / mileage / hoursAdjusted — km-calc
  // does not re-run, the amounts stay frozen), so sending them there is a 400.
  if (includeCorrections && values.targetStatus === 'ZAAKCEPTOWANO') {
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
      include('comment', values.comment);
      break;
    case 'ODRZUCONO':
      include('comment', values.comment);
      break;
    case 'REKLAMACJA_ZAAKCEPTOWANO':
      // `{ reklamacjaOrderNumber (required), comment? }` — and nothing else.
      // The paid amount is `claim.reklamacjaAmount`, server-side, verbatim.
      include('reklamacjaOrderNumber', values.reklamacjaOrderNumber);
      include('comment', values.comment);
      break;
    case 'REKLAMACJA_ODRZUCONO':
      // `{ comment (required) }` → persisted as `reklamacjaResponse`.
      include('comment', values.comment);
      break;
  }
  return out as UpdateClaimDto;
}

/**
 * Build the `PATCH /verification` body from the current correction form values.
 * Mirrors `cleanUpdatePayload`'s correction block exactly — omit empty / NaN so
 * the schema's `.strict()` doesn't choke. An all-empty result is the legal
 * "confirm as-is" body (`{}`).
 *
 * `dateStart` / `dateEnd` are always prefilled by `getDefaults` (from
 * `claim.date{Start,End}.slice(0, 10)`), so a bare emptiness check would send
 * them on every verify and make the API treat each confirm as a period edit.
 * They are therefore included only when the form value DIFFERS from that same
 * claim baseline — genuine date edits are still sent, unchanged dates omitted.
 */
function buildVerifyPayload(
  values: FormValues,
  claim: ClaimDto,
): VerifyClaimDto {
  const out: Record<string, unknown> = {};
  const include = (k: string, v: unknown) => {
    if (v === '' || v === undefined || v === null) return;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    out[k] = v;
  };
  // Same baseline `getDefaults` prefills the form with — compare against it so
  // only a real change gets sent.
  if (values.dateStart !== claim.dateStart.slice(0, 10)) {
    include('dateStart', values.dateStart);
  }
  if (values.dateEnd !== claim.dateEnd.slice(0, 10)) {
    include('dateEnd', values.dateEnd);
  }
  include('timeFrom', values.timeFrom);
  include('timeTo', values.timeTo);
  include('mileage', values.mileage);
  include('hoursAdjusted', values.hoursAdjusted);
  return out as VerifyClaimDto;
}

/** The correction fields the verification checkpoint gate watches for dirtiness. */
const CORRECTION_FIELDS = [
  'dateStart',
  'dateEnd',
  'timeFrom',
  'timeTo',
  'mileage',
  'hoursAdjusted',
] as const;

/**
 * Reads the machine-readable error code from an `ApiResponseError`'s RFC 7807
 * body (`data.extensions.code`) — the same access path the carrier flows use
 * (`carrier/delegations/new`, `carrier/claims/new`). Returns `undefined` when
 * the envelope carries no `extensions.code`.
 */
function problemCode(err: ApiResponseError): string | undefined {
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return undefined;
  const code = (extensions as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * `extensions.missingDates` of a 422 `CLAIM_BOARD_INCOMPLETE` (ISO dates). `[]`
 * when absent or malformed — the toast then takes its `=0` branch.
 */
function problemMissingDates(err: ApiResponseError): string[] {
  const extensions = (err.data as { extensions?: unknown } | undefined)
    ?.extensions;
  if (!extensions || typeof extensions !== 'object') return [];
  const dates = (extensions as { missingDates?: unknown }).missingDates;
  return Array.isArray(dates)
    ? dates.filter((d): d is string => typeof d === 'string')
    : [];
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
  role,
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
            role={role}
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
  role: Role | undefined;
  onClose: () => void;
}

function ModalBody({
  claim,
  initialMode,
  canEdit,
  role,
  onClose,
}: ModalBodyProps) {
  const t = useTranslations('employee.claims.modal');
  const tStatus = useTranslations('employee.claims.modal.targetStatus');
  const tUnified = useTranslations('employee.claims.modal.unified');
  const tEdit = useTranslations('employee.claims.modal.edit');
  const tReklamacja = useTranslations('employee.claims.modal.reklamacja');
  const tCommon = useTranslations('common');

  const qc = useQueryClient();

  const targets = useMemo(
    () => decisionTargetsFor(claim.status),
    [claim.status],
  );

  /** The claim sits in an open reklamacja — the decision decides the DISPUTE. */
  const isReklamacja = claim.status === 'REKLAMACJA';

  // ── In-place morph state. Non-editing roles are pinned to `view`. ──
  const [mode, setMode] = useState<ClaimModalMode>(
    canEdit ? initialMode : 'view',
  );

  // ── THE permission object (§6.5.12–§6.5.14) ──
  // Single derivation from (status, role, mode). Every section below reads from
  // `perms` — fact-block editability, the verify button, the amountApproved
  // branch, and the submit payload shape. Do NOT reintroduce ad-hoc
  // `status === …` / `role === …` checks at the call sites; they are what let
  // the gates drift out of sync with the rendered fields in the first place.
  const perms: ClaimPermissions = useMemo(
    () =>
      deriveClaimPermissions({
        status: claim.status,
        role,
        mode,
      }),
    [claim.status, role, mode],
  );
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<FormValues>({
    resolver: updateClaimResolver,
    defaultValues: getDefaults(claim),
  });

  const targetStatus = form.watch('targetStatus');

  // Unsaved corrections — RHF dirty state of the 6 fact fields, re-baselined by
  // `form.reset(form.getValues())` on a successful «Zapisz weryfikację». Read
  // by the verifier-checkpoint gate AND (mixed periods) the accept filter.
  const dirtyFields = form.formState.dirtyFields as Partial<
    Record<keyof FormValues, boolean>
  >;
  const correctionsDirty = CORRECTION_FIELDS.some((f) => dirtyFields[f]);

  // ── Live preview (debounced 300ms) — DECISION-INDEPENDENT (§6.5.4). ──
  // Recomputes whenever any of the 6 facts changes, regardless of the
  // selected targetStatus. Gated only on the vehicle being known (handled
  // inside buildPreviewBody) — the verifier sees the financial consequence
  // of their corrections BEFORE committing to a decision.
  // `mileage` IS watched: the verifier's manual km override drives the live
  // recalc. It's honored server-side only for pracownik/admin (ignored for
  // przewoznik and on the delegationId carrier path); buildPreviewBody sends
  // it only while it's a finite non-negative number, otherwise omits it so the
  // server falls back to the claim's persisted mileage. The PATCH still
  // carries mileage too.
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

  // ── Mixed period — settlement on the weryfikator's km board (docs/20 §0⁵,
  //    docs/14 §16.5.5–§16.5.6) ──
  //
  // `claimBoard` — the LIVE board settlement from `GET /claims/:nrZgl`,
  // computed from the claim's SAVED period / times / korekta (refetched on
  // every open). It is the ONE board reading on this surface: the breakdown
  // table (paired with `claim.breakdown`, the same DTO), the accept gate and
  // the «brak danych» notice all read it — the server's accept gate prices the
  // saved inputs against the board as it stands now. `null` for an all-active
  // period. Money figures do NOT come from it: its `paymentEur` is never shown.
  const claimBoard: ClaimBoardSettlement | null = claim.boardSettlement ?? null;
  const boardIncomplete = isBoardIncomplete(claimBoard);
  // The SAVED claim is a mixed period — only ever the server's flag, never the
  // rows. (A board settlement is only ever sent for a mixed period.)
  const mixedPeriod = claimBoard !== null || isBoardSettled(claim.breakdown);
  // The web sends every correction field WITH the decision, and on a mixed
  // period the server re-prices the accept on the board and answers 422
  // `CLAIM_BOARD_CHANGED` when the dopłata moved from the saved one. So while
  // corrections are unsaved, acceptance is not offered at all (same removal
  // mechanism as `metGuarantee`). Only reachable where the decision is not
  // already checkpoint-gated — admin @ OCZEKUJE_NA_AUTORYZACJE.
  const boardDirtyGate =
    mixedPeriod && perms.payloadIncludesCorrections && correctionsDirty;

  // ── The amount source (§16.5.9 p.1, §16.5.10) ──
  // ONE object feeds the dopłata field AND the niedojazd readout under it, so
  // «niedojazd × stawka» always matches the amount shown:
  //  - a DECIDED mixed period (mixed + ZAAKCEPTOWANO / ODRZUCONO) → the STORED
  //    claim: the preview re-prices it on the board as it stands now, which
  //    drifts from the decided dopłata once the weryfikator edits a day;
  //  - otherwise the live preview once it exists (retained across refetches
  //    by `placeholderData`), else the claim (before the first response and
  //    on error).
  const amountSrc = selectAmountSource(claim, previewQ.data);

  // The dopłata shown in the locked field.
  const liveDoplata = amountSrc.paymentEur;
  // Niedojazd readout under the field — same source, pre-formatted.
  const shortfall = shortfallView(amountSrc);

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
  // Hidden while the km board has gaps: saving the verification then SKIPS the
  // automatic move to `OCZEKUJE_NA_AUTORYZACJE` (docs/13, verification), so the
  // hint's promise would be false. The hint itself is computed from the live
  // preview (the verifier's current edits — what the save would price), so the
  // preview's board counts as well as the saved one: either incomplete ⇒ no
  // promise. (Not shown anywhere else; the table reads the claim's pair.)
  const showExceedsHint =
    exceedsProg &&
    claim.status === 'NA_WERYFIKACJI' &&
    !boardIncomplete &&
    !isBoardIncomplete(previewQ.data?.boardSettlement);

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
  // no payout due) acceptance is impossible: drop `ZAAKCEPTOWANO` from the
  // select, leaving only the rejection option. UI guard only — the backend
  // independently hard-rejects acceptance with 422.
  //
  // REWORK 2026-07-31 (§6.5.15 D) — the gate does NOT extend to
  // `REKLAMACJA_ZAAKCEPTOWANO`. An uznana reklamacja pays the carrier's own
  // `reklamacjaAmount` (frozen at submit and already capped there), NOT a
  // recalculated dopłata, so "guarantee met ⇒ nothing to pay" simply does not
  // transfer: the whole point of a reklamacja on a REJECTED wniosek is that
  // km-calc said no and the carrier disputes it. Coupling the two blocked every
  // such reklamacja from ever being upheld.
  const liveKmDiff = previewQ.data?.kmDifference ?? claim.kmDifference;
  const metGuarantee = !isCompensationDue(liveKmDiff);
  // Mixed-period acceptance gates (§16.5.6) — the SAME removal mechanism as
  // `metGuarantee`: `ZAAKCEPTOWANO` is dropped from the options, never shown
  // disabled. `REKLAMACJA_ZAAKCEPTOWANO` is untouched (an uznana reklamacja
  // pays its own frozen kwota, the board plays no part); `ODRZUCONO` and
  // «Zapisz weryfikację» stay available.
  const acceptBlockedByBoard = boardIncomplete || boardDirtyGate;
  const availableTargets = useMemo(
    () =>
      metGuarantee || acceptBlockedByBoard
        ? targets.filter((target) => target !== 'ZAAKCEPTOWANO')
        : targets,
    [metGuarantee, acceptBlockedByBoard, targets],
  );

  // Clear a stale acceptance selection once acceptance is no longer offered.
  // Guarded on the value of `targetStatus` (read via the watch above) —
  // `form.setValue` is stable, so no loop. The `metGuarantee` branch waits for
  // an in-flight recalc to settle (avoids flicker); the board gates come from
  // the claim DTO / the form's dirty state and clear at once.
  // Reklamacja targets are deliberately NOT cleared here (see above).
  useEffect(() => {
    if (targetStatus !== 'ZAAKCEPTOWANO') return;
    if (acceptBlockedByBoard || (metGuarantee && recalcState !== 'loading')) {
      form.setValue('targetStatus', '');
    }
  }, [acceptBlockedByBoard, metGuarantee, recalcState, targetStatus, form]);

  // Auto-populate `amountApproved` to the live dopłata for ZAAKCEPTOWANO
  // (decision-scoped — only fires when the accept branch is selected). The
  // field is always the locked/computed value (§6.5.4 / §6.5.14 REMOVED — no
  // «kwota Maksima» override any more), so this is the single source that keeps
  // it in sync with the recalc.
  useEffect(() => {
    if (targetStatus !== 'ZAAKCEPTOWANO') return;
    if (form.formState.dirtyFields.amountApproved) return;
    if (typeof liveDoplata === 'number') {
      form.setValue('amountApproved', liveDoplata, { shouldDirty: false });
    }
  }, [targetStatus, liveDoplata, form]);

  const tMaksim = useTranslations('employee.claims.modal.maksimGate');
  const tInTransit = useTranslations('employee.claims.modal.inTransitGate');
  const tLocked = useTranslations('employee.claims.modal.locked');
  const tBoard = useTranslations('employee.claims.modal.boardGate');

  // ── 422 CLAIM_BOARD_CHANGED latch (§16.5.6) ──
  // The accept was refused because the live board dopłata no longer matches
  // the one saved at verification. Without a latch the verifier repeats the
  // same decision, gets the same 422, and the toast reads like a loop — so the
  // decision stays closed (part of `decisionGated`) until a successful
  // «Zapisz weryfikację» re-prices it (`verifyM.onSuccess`). Purely client
  // state: the server still decides whether the next accept goes through.
  const [boardChanged, setBoardChanged] = useState(false);

  // ── Linked-outing in-transit gate (in-transit-verifier-gate feature) ──
  // When the wniosek is filed against an outing that is still `w_trasie`, the
  // pracownik may VIEW the claim but EVERY mutating action is hard-blocked:
  // verify («Zapisz weryfikację») AND the accept/reject decision. The server
  // independently enforces this with 422
  // `CLAIM_DELEGATION_IN_TRANSIT`; this derives the SAME gate from the DTO's
  // embedded `delegationStatus` so the UI disables the actions and shows a
  // read-only banner up front. A `'zjechal'` outing (or no linked outing) passes
  // through unchanged. Carrier submit is NOT affected — that's a separate,
  // intended soft-warning path.
  const inTransitGated =
    claim.delegationId !== null && claim.delegationStatus === 'w_trasie';

  // ── Maksim authorization gate (maksim-authorization-gate feature) ──
  // Derived DIRECTLY from the DTO — never a client-inferred cleared state.
  // Active ⇔ armed AND not cleared. When active the accept/reject decision is
  // HARD-BLOCKED until the verifier uploads Maksim's confirmation screenshot,
  // which flips `maksimGateClearedAt` on the refetched claim. Drives the gate
  // banner, the `decisionGated` disable, and the gate-hint copy. The submit
  // error handler does NOT read this (the stale-state 422 keys on the server's
  // machine code instead — see `updateM.onError`).
  const maksimGateActive =
    claim.maksimGateRequired && claim.maksimGateClearedAt == null;

  const updateM = useUpdateClaim({
    onSuccess: () => {
      toast.success(tEdit('savedToast'));
      onClose();
    },
    onError: (err) => {
      // Defensive: the server independently HARD-BLOCKS accept/reject while the
      // Maksim gate is armed (422 `extensions.code === CLAIM_AUTHORIZATION_
      // REQUIRED`). The TARGET scenario is a STALE DTO that says "not gated"
      // (buttons enabled locally, `maksimGateActive === false`) → the verifier
      // submits → the server 422s. So we CANNOT key on `maksimGateActive` (it's
      // false in exactly this case); we key on the machine code lifted from the
      // RFC 7807 `extensions` bag — the same `err.data.extensions.code` access
      // the carrier flows use. Then we invalidate the claim detail so the gate
      // re-derives from the FRESH DTO (which flips the buttons back to gated) and
      // surface the localized copy rather than the raw server detail.
      if (
        err instanceof ApiResponseError &&
        problemCode(err) === 'CLAIM_AUTHORIZATION_REQUIRED'
      ) {
        qc.invalidateQueries({
          queryKey: [...CLAIMS_KEY, 'detail', claim.nrZgl],
        });
        toast.error(tMaksim('decisionBlockedToast'));
        return;
      }
      // Stale-modal safety net for the in-transit gate: the outing transitioned
      // to `w_trasie` after the modal opened (DTO still says otherwise, buttons
      // enabled locally) → the server 422s with `CLAIM_DELEGATION_IN_TRANSIT`.
      // Same access path as the Maksim gate: key on the machine code from the
      // RFC 7807 `extensions` bag, refetch the claim detail so `inTransitGated`
      // re-derives from the FRESH DTO (disabling the actions + showing the
      // banner), and surface the localized copy.
      if (
        err instanceof ApiResponseError &&
        problemCode(err) === 'CLAIM_DELEGATION_IN_TRANSIT'
      ) {
        qc.invalidateQueries({
          queryKey: [...CLAIMS_KEY, 'detail', claim.nrZgl],
        });
        toast.error(tInTransit('blockedToast'));
        return;
      }
      // Mixed-period accept gates (docs/20 §0⁵) — same pattern: key on the
      // machine code, refetch the claim detail, localized toast (the server
      // `detail` is Polish only). INCOMPLETE: the fresh `boardSettlement`
      // removes `ZAAKCEPTOWANO` (the effect above clears the stale choice),
      // brings up the «brak danych» notice and refreshes the table's board
      // columns. CHANGED: latch the decision closed until the verification is
      // saved again.
      if (
        err instanceof ApiResponseError &&
        problemCode(err) === CLAIM_BOARD_INCOMPLETE
      ) {
        qc.invalidateQueries({
          queryKey: [...CLAIMS_KEY, 'detail', claim.nrZgl],
        });
        toast.error(
          tBoard('incompleteToast', {
            count: problemMissingDates(err).length,
          }),
        );
        return;
      }
      if (
        err instanceof ApiResponseError &&
        problemCode(err) === CLAIM_BOARD_CHANGED
      ) {
        qc.invalidateQueries({
          queryKey: [...CLAIMS_KEY, 'detail', claim.nrZgl],
        });
        setBoardChanged(true);
        toast.error(tBoard('changedToast'));
        return;
      }
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tEdit('errorToast');
      toast.error(msg);
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    if (!values.targetStatus) return;
    // Corrections ride along ONLY when the fact block was actually editable.
    const payload = cleanUpdatePayload(
      values,
      perms.payloadIncludesCorrections,
    );
    updateM.mutate({ nrZgl: claim.nrZgl, body: payload });
  };

  // ── Verifier checkpoint (verifier-checkpoint feature) ──
  // A claim in NA_WERYFIKACJI must be «zweryfikowany» before the verifier may
  // take a decision or request Maksim authorization (server gate:
  // 422 CLAIM_NOT_VERIFIED). This mirrors that gate in the UI so the verifier
  // can't select a decision until they save the checkpoint.
  // NOTE: this is the CHECKPOINT gate only — «must be verified before deciding».
  // Whether the «Zapisz weryfikację» BUTTON exists is a different question
  // (`perms.showVerifyButton`), because admin may re-save the checkpoint at
  // OCZEKUJE_NA_AUTORYZACJE where the decision is not checkpoint-gated. Fusing
  // the two into one `needsVerification` boolean was the original bug.
  const needsVerification = perms.requiresVerifiedCheckpoint;
  const isVerified = claim.verifiedAt != null;
  // (`correctionsDirty` is derived near the top of the component.)
  // Gate is live only for NA_WERYFIKACJI; other statuses behave as before.
  // The in-transit gate is ADDITIVE: it blocks the verify + request-
  // authorization actions (both keyed off `verifyGated`) regardless of the
  // verification-checkpoint state, so a `w_trasie` outing keeps them disabled
  // even once the checkpoint would otherwise clear.
  const verifyGated =
    inTransitGated || (needsVerification && (!isVerified || correctionsDirty));

  // The decyzja is blocked while ANY gate is armed: the verifier checkpoint
  // (verifyGated, which now also folds in the linked-outing in-transit gate) OR
  // the Maksim over-threshold gate (maksimGateActive, derived above from the
  // DTO) OR the `CLAIM_BOARD_CHANGED` latch. The Maksim gate only meaningfully
  // arms once the claim is verified (the api arms it on the verification save),
  // so all gates compose cleanly — each a HARD gate ADDITIVE to the checkpoint.
  // `inTransitGated` is spelled out here too (belt-and-braces) so the
  // accept/reject buttons stay disabled while the outing is `w_trasie` even if
  // the `verifyGated` composition ever changes.
  const decisionGated =
    inTransitGated || verifyGated || maksimGateActive || boardChanged;

  // The ONE gate-hint line under the decyzja select — first match wins:
  // in-transit → board changed (422 latch) → verifier checkpoint → Maksim →
  // unsaved corrections on a mixed period (accept removed, reject still open).
  // `boardIncomplete` has no line here: its amber notice sits right above the
  // select, a third repetition would be noise (§16.5.6).
  // The latch's remedy is «Zapisz weryfikację» — so when THIS user has no such
  // button (`perms.showVerifyButton`: pracownik @ OCZEKUJE_NA_AUTORYZACJE), the
  // hint names who can do it instead of telling them to do the impossible.
  const decisionHint: string | null = inTransitGated
    ? tInTransit('actionsBlockedHint')
    : boardChanged
      ? perms.showVerifyButton
        ? tBoard('changedHint')
        : tBoard('changedHintNoEdit')
      : verifyGated
        ? correctionsDirty
          ? tEdit('verifyDirtyHint')
          : tEdit('verifyRequiredHint')
        : maksimGateActive
          ? tMaksim('decisionBlockedHint')
          : boardDirtyGate
            ? tBoard('changedHint')
            : null;

  // «Brak danych» notice on the km board (§16.5.6) — see the render site.
  const showBoardGapNotice =
    boardIncomplete &&
    !metGuarantee &&
    !inTransitGated &&
    !isReklamacja &&
    (claim.status === 'NA_WERYFIKACJI' ||
      claim.status === 'OCZEKUJE_NA_AUTORYZACJE');

  const verifyM = useVerifyClaim(claim.nrZgl, {
    onSuccess: () => {
      toast.success(tEdit('verifiedToast'));
      // The verification re-priced the board dopłata — the accept may be tried
      // again (the server re-checks it).
      setBoardChanged(false);
      // Re-baseline the form to its current values so the correction fields go
      // clean and the decyzja gate (correctionsDirty) unlocks. The detail-query
      // invalidation refetches the claim (now carrying the fresh verifiedAt),
      // but ModalBody is keyed on claim.id and won't re-mount, so the mount-time
      // getDefaults won't re-baseline — do it explicitly here.
      form.reset(form.getValues());
    },
    onError: (err) => {
      // ROLE refusal — distinct from the STATUS refusal below. The server
      // 422s with the machine code `CLAIM_VERIFY_ADMIN_ONLY` when a pracownik
      // saves a checkpoint at OCZEKUJE_NA_AUTORYZACJE. Reachable only from a
      // STALE modal (the claim moved into that status after open), since
      // `perms.showVerifyButton` removes the button otherwise — so refetch the
      // detail, which re-derives `perms` and takes the button away.
      // The status refusal carries NO machine code and falls through to the
      // generic 4xx branch, which surfaces the server's own message.
      if (
        err instanceof ApiResponseError &&
        problemCode(err) === 'CLAIM_VERIFY_ADMIN_ONLY'
      ) {
        qc.invalidateQueries({
          queryKey: [...CLAIMS_KEY, 'detail', claim.nrZgl],
        });
        toast.error(tEdit('verifyAdminOnlyToast'));
        return;
      }
      // Stale-modal safety net (mirrors updateM.onError): the outing flipped to
      // `w_trasie` after open → the server 422s the verify with
      // `CLAIM_DELEGATION_IN_TRANSIT`. Refetch the claim detail so
      // `inTransitGated` re-derives and disables the actions + shows the banner.
      if (
        err instanceof ApiResponseError &&
        problemCode(err) === 'CLAIM_DELEGATION_IN_TRANSIT'
      ) {
        qc.invalidateQueries({
          queryKey: [...CLAIMS_KEY, 'detail', claim.nrZgl],
        });
        toast.error(tInTransit('blockedToast'));
        return;
      }
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : tCommon('errorGeneric');
      toast.error(msg);
    },
  });

  const handleVerifyClick = () => {
    verifyM.mutate(buildVerifyPayload(form.getValues(), claim));
  };

  // ── Board-sum hint (verifier-checkpoint feature) ──
  // «Wg tablicy przebiegów: N km» + «Zastosuj» under the km input. Source: the
  // MAIN live preview's `boardSumKm` — the staff-only Σ `drove` km on the
  // weryfikator's daily-km board over the period being edited (the preview
  // body's `[dateStart, dateEnd]`), so it tracks date edits and picks up days
  // the weryfikator filled after submit. It does not depend on `mileage`, so
  // «Zastosuj» (→ `setValue('mileage')`) re-runs the preview without moving
  // the hint. `null` (no vehicle / missing or invalid date / board
  // unavailable) hides the hint; a real 0 shows «0 km».
  // Scoped to `perms.factsEditable` (not the raw status) — the hint exists to
  // feed the km INPUT, so it belongs wherever that input is actually editable,
  // which includes admin @ OCZEKUJE_NA_AUTORYZACJE.
  // (Replaces a second preview sent without `mileage`: for an existing claim
  // the server answers that with the carrier's persisted mileage, not the
  // board, so the hint went stale.)
  const boardSum = boardSumHintKm(previewQ.data, perms.factsEditable);

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
    recalcState === 'loading' ||
    decisionGated;

  const errs = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const errMsg = (key: string): string | undefined => errs[key]?.message;

  const isEdit = mode === 'edit';

  // ── Secondary sub-panel applicability (§6.5.7) ──
  // Historia only — the manual Autoryzacja sub-panel is gone (authorization is
  // now the automatic Maksim-gate rendered as its own block above Decyzja).
  const hasHistory = claimHasHistory(claim);

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

        {/* Verification stamp — visible once the checkpoint is saved. Vanishes
            on its own when the delegation auto-recalc resets verifiedAt to
            null (no extra state to manage). */}
        {claim.verifiedAt && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success-dark dark:bg-success/15 dark:text-success">
            <BadgeCheck size={13} aria-hidden className="shrink-0" />
            {t('unified.verifiedBadge', {
              date: formatDateFull(claim.verifiedAt),
              name:
                claim.verifiedBy?.name ??
                claim.verifiedBy?.login ??
                claim.verifiedById ??
                '—',
            })}
          </p>
        )}
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

        {/* In-transit gate banner — read-only explainer shown whenever the
            linked outing is still `w_trasie`. Rendered in BOTH view and edit
            mode (the actions it explains — verify / decision — are disabled in
            both). Sits at the top of the actions region so the reason every
            mutating control is disabled is adjacent to them. */}
        {inTransitGated && <InTransitGateBlock />}

        {/* ① Fact pairs — `editable` (NOT `mode`) drives the static⇄input flip,
            so a pracownik in `edit` still gets the read-only rendering while the
            wniosek awaits Maksim (§6.5.13 case 2, Tier B). */}
        <FactPairs
          claim={claim}
          form={form}
          editable={perms.factsEditable}
          lockNotice={perms.factsNotice}
          firstInputRef={firstInputRef}
          livePreviewBreakdown={livePreviewBreakdown}
          previewNotYetLoaded={previewNotYetLoaded}
          errMsg={errMsg}
          tUnified={tUnified}
          tEdit={tEdit}
          tLocked={tLocked}
          showBoardSum={perms.factsEditable}
          boardSum={boardSum}
        />

        {/* ② Dopłata — locked / computed, live, ABOVE decyzja */}
        <DoplataBlock
          claim={claim}
          recalcState={recalcState}
          liveDoplata={liveDoplata}
          shortfall={shortfall}
          prog={prog}
          liveDrivenDays={liveDrivenDays}
          showExceedsHint={showExceedsHint}
          showRecalcLimits={perms.showRecalcLimitsButton}
          tUnified={tUnified}
        />

        {/* ②a Notes — the carrier's submit note and MAGTRANS's decision
            justification, each tagged with its author (UWAGI #4). Same in view
            and edit; placed before the Maksim gate so that gate stays directly
            above Decyzja, and before the reklamacja so the record reads in
            order: note → decision → dispute. */}
        <ClaimNotesBlock claim={claim} />

        {/* ②b Maksim authorization gate — POST-verification hard block. The
            banner (armed) or the confirmed affordance (cleared) sits directly
            above Decyzja so the reason the accept/reject buttons are disabled is
            adjacent to them. The claim reaches `OCZEKUJE_NA_AUTORYZACJE` only
            automatically (over-threshold dopłata at verification-save time), so
            the status is the primary render gate; the block itself picks the
            armed vs cleared state from `maksimGateClearedAt`. Edit mode only —
            view mode has no decision controls to gate. */}
        {isEdit && claim.status === 'OCZEKUJE_NA_AUTORYZACJE' && (
          <MaksimGateBlock claim={claim} active={maksimGateActive} />
        )}

        {/* ②c Reklamacja — read-only submission block (§6.5.15 A). Visible
            whenever a reklamacja was ever filed, independent of status and of
            mode: the claim status no longer records the outcome, so this block is
            the only staff-side trace besides Historia. Position is locked —
            facts → dopłata → what the carrier disputes → decision. */}
        {claim.reklamacjaSubmitted && <ReklamacjaBlock claim={claim} />}

        {/* ③ Decyzja — the CONTAINED commitment panel (§6.5.12). Everything
            above is a flat divided "reading" step; this is the irreversible
            one, so it gets a box (brand-red top rule) instead of a hairline
            divider. The shell is identical across all three branches — it must
            not appear/disappear across `mode`. */}
        <DecisionPanel
          tUnified={tUnified}
          subtitle={
            isReklamacja
              ? tUnified('decyzjaSubtitleReklamacja')
              : tUnified('decyzjaSubtitle')
          }
        >
          {/* «Brak danych» on the km board (§16.5.6) — FIRST inside the panel,
              directly above the select that no longer offers acceptance, in
              view AND edit (the reader learns why acceptance won't be offered
              before morphing to edit). Gated on status, not role. Suppressed
              when the guarantee is already met (missing days can only ADD km,
              so "acceptable once filled" would be false), while the outing is
              in transit (gaps are expected, the red banner already blocks
              everything) and on a reklamacja (the board plays no part). */}
          {showBoardGapNotice && claimBoard && (
            <BoardGapNotice board={claimBoard} dateEnd={claim.dateEnd} />
          )}
          {targets.length === 0 ? (
            <p className="rounded-md bg-input/40 p-3 text-sm text-text-sub">
              {/* A decided reklamacja is terminal too — say WHICH terminal
                  state this is, since the status badge above cannot. */}
              {claim.reklamacjaResolution != null
                ? tReklamacja('alreadyResolved')
                : tUnified('terminalState')}
            </p>
          ) : !isEdit ? (
            // In view mode the decyzja inputs are hidden — the verifier
            // morphs to edit to make a decision.
            <p className="rounded-md bg-input/40 p-3 text-sm text-text-sub">
              {tUnified('decisionRequired')}
            </p>
          ) : (
            <>
              <DecisionFields
                claim={claim}
                form={form}
                targets={availableTargets}
                targetStatus={targetStatus}
                decisionGated={decisionGated}
                errMsg={errMsg}
                tEdit={tEdit}
                tStatus={tStatus}
              />
              {/* Gate hint under the decyzja select — one line, priority in
                  `decisionHint`. The verifier-checkpoint gate precedes the
                  Maksim gate (it's the first thing to clear). */}
              {decisionHint && (
                <p className="text-xs text-text-sub" role="status">
                  {decisionHint}
                </p>
              )}
              {/* Acceptance gate hint — shown while recalc reports the
                  guarantee was met (no payout due ⇒ `ZAAKCEPTOWANO` removed).
                  Suppressed at REKLAMACJA: the gate does not apply there, so the
                  hint would claim a restriction that is not in force. */}
              {metGuarantee && !isReklamacja && (
                <p className="text-xs text-text-sub">
                  {tUnified('guaranteeMetHint')}
                </p>
              )}
            </>
          )}
        </DecisionPanel>

        {/* ④ Secondary sub-panel — Historia only (§6.5.7). Render ONLY in edit
            mode — view mode shows no bottom section. */}
        {isEdit && <SecondaryPanel claim={claim} hasHistory={hasHistory} />}
      </div>

      {/* ── Footer (non-scrolling) ── */}
      <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-border px-6 py-3 sm:px-8">
        {isEdit ? (
          <>
            {/* «Zapisz weryfikację» — verifier-checkpoint stamp. Sits in the
                footer's LEFT slot (`mr-auto`, §6.5.12): two save buttons in one
                right-hand cluster with near-identical labels are unreadable.
                REMOVED (not disabled) when the role cannot verify in this
                status — its reason is already carried by the fact block's
                <LockNotice> (§6.5.13 hard rule). */}
            {perms.showVerifyButton && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mr-auto"
                title={tEdit('verifyButtonHint')}
                onClick={handleVerifyClick}
                disabled={
                  verifyM.isPending ||
                  recalcState === 'loading' ||
                  inTransitGated
                }
              >
                {verifyM.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    {tEdit('submitting')}
                  </>
                ) : (
                  <>
                    <BadgeCheck size={14} aria-hidden />
                    {tEdit('verifyButton')}
                  </>
                )}
              </Button>
            )}
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
              ) : targets.length > 0 ? (
                // §6.5.12: a bare «Zapisz» next to «Zapisz weryfikację» is
                // unresolvable — name what this button actually commits.
                tEdit('submitDecision')
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
                    origDateEnd: formatDateFull(
                      claim.origDateEnd ?? claim.dateEnd,
                    ),
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
  /**
   * Leaf controls render as inputs. NOT the same as `mode === 'edit'` — a
   * pracownik at OCZEKUJE_NA_AUTORYZACJE is in `edit` (the decyzja panel below
   * is live) while THIS block stays static (§6.5.13 Tier B).
   */
  editable: boolean;
  /** Which block-level lock notice to render above the block, if any. */
  lockNotice: ClaimPermissions['factsNotice'];
  firstInputRef: React.RefObject<HTMLInputElement | null>;
  /** Live km-calc breakdown from `previewQ.data` — recomputed from the
   *  verifier's CURRENT working times. `null` until the first preview lands. */
  livePreviewBreakdown: KmCalcBreakdown | null;
  /** `true` only before the first preview response — drives the persisted
   *  breakdown fallback so the readout never renders "—" / NaN. */
  previewNotYetLoaded: boolean;
  errMsg: (key: string) => string | undefined;
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
  tEdit: ReturnType<typeof useTranslations<'employee.claims.modal.edit'>>;
  tLocked: ReturnType<typeof useTranslations<'employee.claims.modal.locked'>>;
  /** Show the board-sum hint under the km input (editable fact block only). */
  showBoardSum: boolean;
  /** Live board sum (`boardSumKm` of the main preview) over the dates being
   *  edited — `undefined` hides the hint (no preview yet / no board figure). */
  boardSum: number | undefined;
}

function FactPairs({
  claim,
  form,
  editable,
  lockNotice,
  firstInputRef,
  livePreviewBreakdown,
  previewNotYetLoaded,
  errMsg,
  tUnified,
  tEdit,
  tLocked,
  showBoardSum,
  boardSum,
}: FactPairsProps) {
  const isEdit = editable;
  const noticeId = useId();
  // Only the `locked` variant actually disables anything; `adminInfo` is a pure
  // explainer ("you CAN still edit"), so it must not claim aria-disabled.
  const isLocked = lockNotice === 'locked';

  // Declared (carrier) sources — fall back to the live value for legacy
  // claims where the orig* snapshot is null (§6.5.3).
  const declared = {
    dateStart: claim.origDateStart ?? claim.dateStart,
    dateEnd: claim.origDateEnd ?? claim.dateEnd,
    timeFrom: claim.origTimeFrom ?? claim.timeFrom,
    timeTo: claim.origTimeTo ?? claim.timeTo,
    mileage: claim.origMileage ?? claim.mileage,
  };

  // Weryfikator sources (REWORK 2026-07-30) — the actual departure/return the
  // weryfikator recorded on the outing plus the daily-km board sum over that
  // window. `undefined` per field ⇒ that column is dropped from the row (no
  // linked outing, an outing without both actual datetimes, or no board data).
  //
  // Since the carrier now declares its own figures and the two systems draw on
  // different sources, this side-by-side IS the verification task: the
  // pracownik sees at a glance where the declaration and the recorded trip
  // disagree, and decides.
  const weryfikator = {
    dateStart: claim.delegationActualDepartureAt ?? undefined,
    dateEnd: claim.delegationActualReturnAt ?? undefined,
    timeFrom: hhMmFromIso(claim.delegationActualDepartureAt),
    timeTo: hhMmFromIso(claim.delegationActualReturnAt),
    mileage: claim.verifierMileage ?? undefined,
  };
  const showWeryfikatorColumn = Object.values(weryfikator).some(
    (v) => v !== undefined,
  );

  return (
    <section className="space-y-3">
      {/* §6.5.13 Tier B — ONE block-level notice above the headers, never N
          greyed inputs with N lock glyphs. The `adminInfo` variant explains why
          the surface feels different WITHOUT locking anything. */}
      {lockNotice && (
        <LockNotice id={noticeId}>
          {tLocked(
            lockNotice === 'locked'
              ? 'factsPendingAuthorization'
              : 'factsPendingAuthorizationAdmin',
          )}
        </LockNotice>
      )}

      {/* The locked BLOCK. `role="group"` (not the outer <section>, whose
          implicit `region` role does not support `aria-disabled`) carries the
          state + the pointer to the one <LockNotice> that explains it. */}
      <div
        role="group"
        aria-describedby={lockNotice ? noticeId : undefined}
        aria-disabled={isLocked || undefined}
        className="space-y-3"
      >
        {/* Section headers — two columns, or three once the weryfikator's own
            figures are available (REWORK 2026-07-30). Verifier column is only
            labelled in edit mode. */}
        <div
          className={cn(
            'grid gap-x-4',
            isEdit
              ? showWeryfikatorColumn
                ? 'grid-cols-1 md:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2'
              : 'grid-cols-1',
          )}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {tUnified('declaredHeader')}
          </h3>
          {isEdit && showWeryfikatorColumn && (
            <div className="hidden md:block">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
                {tUnified('weryfikatorHeader')}
              </h3>
              <p className="text-xs text-text-sub font-normal normal-case tracking-normal">
                {tUnified('weryfikatorHint')}
              </p>
            </div>
          )}
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
            weryfikatorText={
              weryfikator.dateStart ? formatDateFull(weryfikator.dateStart) : undefined
            }
            weryfikatorCaption={tUnified('weryfikatorCaption')}
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
            weryfikatorText={
              weryfikator.dateEnd ? formatDateFull(weryfikator.dateEnd) : undefined
            }
            weryfikatorCaption={tUnified('weryfikatorCaption')}
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
            weryfikatorText={weryfikator.timeFrom}
            weryfikatorCaption={tUnified('weryfikatorCaption')}
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
            weryfikatorText={weryfikator.timeTo}
            weryfikatorCaption={tUnified('weryfikatorCaption')}
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
            weryfikatorText={
              weryfikator.mileage !== undefined
                ? `${Math.round(weryfikator.mileage).toLocaleString('pl-PL')} km`
                : undefined
            }
            weryfikatorCaption={tUnified('weryfikatorCaption')}
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
            extra={
              // Board-sum hint — the live board sum (`boardSumKm` of the main
              // preview) over the dates being edited. Lets the pracownik pull in
              // daily-km rows the weryfikator added after submit. Only where the
              // km input is editable, and only when the server has a figure.
              showBoardSum && boardSum !== undefined ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-sub">
                  <span className="tabular-nums">
                    {tEdit('boardSumHint', {
                      km: Math.round(boardSum).toLocaleString('pl-PL'),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[12px] font-semibold"
                    onClick={() =>
                      form.setValue('mileage', Math.round(boardSum), {
                        shouldDirty: true,
                      })
                    }
                  >
                    {tEdit('boardSumApply')}
                  </Button>
                </div>
              ) : undefined
            }
          />

          {/* 6 — hoursAdjusted — INPUT ONLY (no declared cell, never `0`). */}
          <HoursAdjustedFact
            claim={claim}
            form={form}
            editable={editable}
            livePreviewBreakdown={livePreviewBreakdown}
            previewNotYetLoaded={previewNotYetLoaded}
            errMsg={errMsg}
            tUnified={tUnified}
          />
        </div>
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
  weryfikatorText,
  weryfikatorCaption,
  verifierDisplay,
  input,
  error,
  extra,
}: {
  label: string;
  isEdit: boolean;
  declaredCaption: string;
  declaredText: string;
  declaredNumeric?: boolean;
  /**
   * The weryfikator's own figure for this fact (REWORK 2026-07-30). `undefined`
   * ⇒ the column is not rendered at all (no linked outing / no board data), so
   * the row silently falls back to the historical two-column layout.
   *
   * The two systems disagree by design — the carrier is paid on SpedTrans
   * mileage while these come from elsewhere — so a difference is INFORMATION,
   * not an error: it is highlighted, never flagged as invalid.
   */
  weryfikatorText?: string;
  weryfikatorCaption: string;
  verifierDisplay: string;
  input: React.ReactNode;
  error?: string;
  /** Optional slot rendered under the verifier input (edit mode only). */
  extra?: React.ReactNode;
}) {
  const hasWeryfikator = weryfikatorText !== undefined;
  const differs = hasWeryfikator && weryfikatorText !== declaredText;

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

  // Edit mode — declared (muted) [+ weryfikator (muted)] + verifier input.
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-x-4 gap-y-1.5',
        hasWeryfikator ? 'md:grid-cols-3' : 'md:grid-cols-2',
      )}
    >
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
      {/* Weryfikator's own figure — reference only, never an input. A value
          that differs from the declaration is what the pracownik is here to
          look at, so it is tinted (warning tone, no icon, no error role). */}
      {hasWeryfikator && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-sub md:invisible md:select-none">
            {label}
          </span>
          <div
            className={cn(
              'flex h-10 w-full items-center rounded-[10px] border px-3.5 text-[14px]',
              declaredNumeric && 'tabular-nums',
              differs
                ? 'border-warning/40 bg-warning/10 font-semibold text-warning-dark dark:text-warning'
                : 'border-border bg-input/40 text-text-sub',
            )}
            aria-readonly="true"
            title={weryfikatorCaption}
          >
            {weryfikatorText}
          </div>
        </div>
      )}
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
        {extra}
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
  editable,
  livePreviewBreakdown,
  previewNotYetLoaded,
  errMsg,
  tUnified,
}: {
  claim: ClaimDto;
  form: UseFormReturn<FormValues>;
  /** Mirrors `FactPairs.editable` — see the note there on why not `mode`. */
  editable: boolean;
  livePreviewBreakdown: KmCalcBreakdown | null;
  previewNotYetLoaded: boolean;
  errMsg: (key: string) => string | undefined;
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
}) {
  const isEdit = editable;
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
            setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)),
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

// ── ② Niedojazd readout (§16.5.10) ─────────────────────────────────
//
// Two lines under the dopłata field: a plain sentence («pojazd przejechał o
// 2 180 km mniej, niż gwarantowano») + the formula to check it. The sign is
// always carried by words («mniej» / «więcej»), never by a minus. No semantic
// colour and no icon (an amount due is not "bad", its absence not "good"), no
// aria-live (it re-renders on every keystroke; <RecalcBadge> already announces
// recalculation). Carrier screens never render this.

function ShortfallReadout({ view }: { view: ShortfallView }) {
  const t = useTranslations('employee.claims.modal.shortfall');

  switch (view.kind) {
    case 'none':
      return null;
    case 'shortfall':
      return (
        <div className="space-y-0.5">
          <p className="text-sm text-text">
            {t.rich('line', {
              scope: view.scope,
              km: view.km,
              b: (chunks) => (
                <strong className="font-semibold tabular-nums">{chunks}</strong>
              ),
            })}
          </p>
          <p className="text-xs tabular-nums text-text-sub">
            {t('formula', {
              scope: view.scope,
              guaranteed: view.guaranteed,
              driven: view.driven,
              km: view.km,
              rate: view.rate,
            })}
          </p>
        </div>
      );
    case 'metEqual':
      return (
        <p className="text-sm text-text-sub">
          {t('metEqual', { scope: view.scope, guaranteed: view.guaranteed })}
        </p>
      );
    case 'metOver':
      return (
        <p className="text-sm text-text-sub">
          {t('metOver', {
            scope: view.scope,
            driven: view.driven,
            guaranteed: view.guaranteed,
            km: view.km,
          })}
        </p>
      );
  }
}

// ── ② Dopłata block ─────────────────────────────────────────────────

function DoplataBlock({
  claim,
  recalcState,
  liveDoplata,
  shortfall,
  prog,
  liveDrivenDays,
  showExceedsHint,
  showRecalcLimits,
  tUnified,
}: {
  claim: ClaimDto;
  recalcState: 'idle' | 'loading' | 'success' | 'error';
  liveDoplata: number;
  /** Niedojazd readout (§16.5.10) — from the SAME source as `liveDoplata`. */
  shortfall: ShortfallView;
  /** Live authorization threshold (EUR) for this claim's driven-days band. */
  prog: number;
  /** Driven working days the threshold band is derived from (for the hint). */
  liveDrivenDays: number;
  /** `true` when dopłata > próg AND the claim is still pre-decision. */
  showExceedsHint: boolean;
  /**
   * §16.6 — «Przelicz wg aktualnych limitów» belongs to the AMOUNT, so it
   * lives here and never in the footer (the footer belongs to the verdict; a
   * third button next to Zaakceptuj / Odrzuć would read as a third verdict).
   * Removed, never disabled, when the role or the status forbids it.
   */
  showRecalcLimits: boolean;
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
}) {
  const tEdit = useTranslations('employee.claims.modal.edit');
  const tRecalcLimits = useTranslations(
    'employee.claims.modal.recalcLimits',
  );
  const [recalcLimitsOpen, setRecalcLimitsOpen] = useState(false);

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {tUnified('doplataSection')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          {/* The badge is the LIVE debounced recalc of the verifier's own
              edits; the button pulls a DIFFERENT set of limits. They coexist
              deliberately and never conflict. */}
          <RecalcBadge
            state={recalcState}
            baseAmount={claim.paymentEur}
            previewAmount={liveDoplata}
          />
          {showRecalcLimits && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              title={tRecalcLimits('buttonHint')}
              onClick={() => setRecalcLimitsOpen(true)}
            >
              <RefreshCw size={14} aria-hidden />
              {tRecalcLimits('button')}
            </Button>
          )}
        </div>
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
      {/* Niedojazd (§16.5.10) — WHY the amount is what it is, directly under
          it and above «wyliczana automatycznie»: amount → reason → automatic. */}
      <ShortfallReadout view={shortfall} />
      <FormDescription className="flex items-center gap-1">
        <Lock aria-hidden className="size-3 shrink-0" />
        {tEdit('amountApprovedAuto')}
      </FormDescription>

      {/* Without this line the button above is inexplicable: the amounts are a
          SNAPSHOT of the limits in force at submission, not a live figure. */}
      {showRecalcLimits && (
        <p className="text-xs text-text-sub">
          {tRecalcLimits('snapshotNote', {
            date: formatDateFull(claim.createdAt),
          })}
        </p>
      )}

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

      {/* The claim's SAVED pair — breakdown and board settlement from the same
          DTO, for every role and mode (§16.5.5). `boardSettlement` is `null` for
          an all-active period, so that table is exactly the pre-feature one. */}
      {claim.breakdown && (
        <div className="pt-1">
          <BreakdownTable
            breakdown={claim.breakdown}
            boardSettlement={claim.boardSettlement ?? null}
          />
        </div>
      )}

      {showRecalcLimits && (
        <RecalcLimitsDialog
          open={recalcLimitsOpen}
          onOpenChange={setRecalcLimitsOpen}
          claim={claim}
        />
      )}
    </section>
  );
}

// ── ②b Maksim authorization gate block ──────────────────────────────
//
// POST-verification hard gate (maksim-authorization-gate feature). Two visual
// states, both driven DIRECTLY off the DTO (never a client-inferred cleared
// state):
//   - active  (`maksimGateRequired && maksimGateClearedAt == null`): a danger
//     banner + the confirmation-screenshot uploader. The decision buttons are
//     disabled elsewhere (`decisionGated`); this block explains why and offers
//     the unblock affordance.
//   - cleared (`maksimGateClearedAt != null`): a confirmed affordance + a link
//     to open the uploaded confirmation via the auth'd download proxy.
//
// The uploader reuses the shared <FileUpload> primitive (single-file mode) — the
// same component the carrier/vehicle attachment flows use. On upload success the
// hook invalidates the claim detail so `maksimGateClearedAt` flips and the
// decision re-enables; we never guess the cleared state locally.

// ── ②a Linked-outing in-transit gate block ─────────────────────────
//
// Read-only explainer (in-transit-verifier-gate feature). Rendered whenever the
// wniosek's linked outing is still `w_trasie` (`inTransitGated`). Purely
// informational — it carries NO action affordance; its whole job is to explain
// why the verify / accept / reject controls are all disabled. Mirrors
// MaksimGateBlock's ACTIVE (danger) visual language: same
// rounded danger surface, same leading icon + title/body layout — just no
// uploader. When the outing later flips to `zjechal`, `inTransitGated` goes
// false, this block unmounts, and the actions re-enable.

function InTransitGateBlock() {
  const t = useTranslations('employee.claims.modal.inTransitGate');
  return (
    <section
      role="status"
      className="rounded-lg border border-danger/40 bg-danger-bg p-4 dark:bg-danger/10"
    >
      <div className="flex items-start gap-3">
        <Truck size={20} className="mt-0.5 flex-none text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-danger">{t('bannerTitle')}</h3>
          <p className="mt-1 text-sm text-text">{t('bannerBody')}</p>
        </div>
      </div>
    </section>
  );
}

// ── ③a «Brak danych» on the km board (mixed period, §16.5.6) ────────
//
// Warning, not danger: the action needed is someone else's (the weryfikator
// fills the board), nothing is broken, and the claim can still be rejected. It
// lives INSIDE the decision panel, directly above the select that no longer
// offers `ZAAKCEPTOWANO` — it removes one option, it does not block the whole
// decision like the Maksim / in-transit blocks do. Surface recipe of
// `progExceededHint` (0 new tokens). Dates come from the TOP-LEVEL
// `missingDates` (guaranteed months only), sorted defensively, formatted as
// LOCAL calendar days with the year.

function BoardGapNotice({
  board,
  dateEnd,
}: {
  board: ClaimBoardSettlement;
  /** The claim's (saved) period end — the return-day hint keys on it. */
  dateEnd: string;
}) {
  const t = useTranslations('employee.claims.modal.boardGate');
  const locale = useLocale();
  const titleId = useId();
  const listId = useId();
  const [expanded, setExpanded] = useState(false);

  const dates = sortMissingDates(board.missingDates ?? []);
  const shown = visibleMissingDates(dates, expanded);
  const collapsible = isMissingDatesCollapsible(dates.length);

  return (
    <section
      role="status"
      aria-labelledby={titleId}
      className="rounded-md border border-warning/40 bg-warning-bg px-3 py-3 dark:bg-warning/15"
    >
      <div className="flex items-start gap-2">
        <CalendarX
          size={16}
          aria-hidden
          className="mt-0.5 shrink-0 text-warning-dark dark:text-warning"
        />
        <div className="min-w-0 flex-1">
          {/* The count is always the full one, even while collapsed. `=0`
              (incomplete but no dates — defensive) reads «Brak danych na
              tablicy km». */}
          <h4
            id={titleId}
            className="text-sm font-bold text-warning-dark dark:text-warning"
          >
            {t('title', { count: dates.length })}
          </h4>
          <p className="mt-1 text-sm text-text">{t('body')}</p>
          {dates.length > 0 && (
            <>
              <ul
                id={listId}
                aria-label={t('datesLabel')}
                className="mt-2 flex flex-wrap gap-1.5"
              >
                {shown.map((iso) => (
                  <li
                    key={iso}
                    className="rounded border border-warning/40 bg-card px-1.5 py-0.5 text-xs tabular-nums text-text"
                  >
                    {formatBoardDate(iso, locale)}
                  </li>
                ))}
              </ul>
              {collapsible && (
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={listId}
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1.5 py-1 text-xs font-semibold text-text underline-offset-2 hover:underline"
                >
                  {expanded
                    ? t('showLess')
                    : t('showAll', { count: dates.length })}
                </button>
              )}
            </>
          )}
          {missesLastDay(dates, dateEnd) && (
            <p className="mt-2 text-xs text-text-sub">{t('returnDayHint')}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function MaksimGateBlock({
  claim,
  active,
}: {
  claim: ClaimDto;
  /** `maksimGateRequired && maksimGateClearedAt == null` — decision blocked. */
  active: boolean;
}) {
  const t = useTranslations('employee.claims.modal.maksimGate');
  const tFile = useTranslations('fileUpload');

  // The confirmation attachment (if any) — filter the AUTORYZACJA_MAKSIMA
  // category out of the existing attachments[] array.
  const confirmation = useMemo(
    () => claim.attachments.find((a) => a.category === 'AUTORYZACJA_MAKSIMA'),
    [claim.attachments],
  );

  // ── Upload — single freshly-picked file staged in <FileUpload>, then POSTed
  //    to the confirmation endpoint. On success the mutation invalidates the
  //    claim detail so the fresh DTO (with maksimGateClearedAt set) flows in and
  //    this block swaps to the cleared state.
  const [picked, setPicked] = useState<FileUploadItem[]>([]);
  const uploadM = useUploadAuthorizationConfirmation(claim.nrZgl, {
    onSuccess: () => {
      toast.success(t('uploadedToast'));
      setPicked([]);
    },
    onError: (err) => {
      const msg =
        err instanceof ApiResponseError && err.status >= 400 && err.status < 500
          ? err.message
          : t('uploadErrorToast');
      toast.error(msg);
    },
  });

  const pickedFile = useMemo(() => {
    const item = picked.find(
      (it): it is Extract<FileUploadItem, { kind: 'new' }> =>
        it.kind === 'new' && it.error === undefined,
    );
    return item?.file ?? null;
  }, [picked]);

  const handleUpload = () => {
    if (!pickedFile || uploadM.isPending) return;
    uploadM.mutate(pickedFile);
  };

  // ── Download — fetch authenticated bytes, open via an object-URL anchor. ──
  const [downloading, setDownloading] = useState(false);
  const handleDownload = useCallback(async () => {
    if (!confirmation) return;
    setDownloading(true);
    try {
      const blob = await downloadAuthorizationConfirmation(
        claim.nrZgl,
        confirmation.id,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t('downloadError'));
    } finally {
      setDownloading(false);
    }
  }, [confirmation, claim.nrZgl, t]);

  const fileLabels = useMemo<FileUploadLabels>(
    () => ({
      prompt: tFile('prompt'),
      promptCompact: tFile('promptCompact'),
      constraints: t('uploadHint'),
      errTooLarge: tFile('errTooLarge'),
      errWrongType: tFile('errWrongType'),
      errUploadFailed: tFile('errUploadFailed'),
      retry: tFile('retry'),
      dropzoneAria: t('uploadHeading'),
      removeAria: (name: string) => tFile('removeAria', { name }),
    }),
    [tFile, t],
  );

  // ── Cleared state — confirmed affordance + open-confirmation link. ──
  if (!active) {
    return (
      <section
        className="rounded-lg border border-success/40 bg-success/10 p-4 dark:bg-success/10"
        aria-live="polite"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck
            size={20}
            className="mt-0.5 flex-none text-success-dark dark:text-success"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-success-dark dark:text-success">
              {t('clearedTitle')}
            </h3>
            {claim.maksimGateClearedAt && (
              <p className="mt-0.5 text-xs text-text-sub">
                {t('clearedAt', {
                  date: formatDateFull(claim.maksimGateClearedAt),
                })}
              </p>
            )}
            {confirmation && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-xs font-medium text-text-sub">
                  {t('confirmationFile')}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={downloading}
                  aria-busy={downloading}
                  onClick={() => void handleDownload()}
                >
                  {downloading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                      {t('downloading')}
                    </>
                  ) : (
                    <>
                      <Download size={14} aria-hidden />
                      {t('openConfirmation')}
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ── Active state — danger banner + confirmation uploader. ──
  return (
    <section
      role="alert"
      className="space-y-4 rounded-lg border border-danger/40 bg-danger-bg p-4 dark:bg-danger/10"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          size={20}
          className="mt-0.5 flex-none text-danger"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-danger">{t('bannerTitle')}</h3>
          <p className="mt-1 text-sm text-text">{t('bannerBody')}</p>
          <p className="mt-1 text-xs text-text-sub">
            {claim.maksimGateNotifiedAt
              ? t('notifiedAt', {
                  date: formatDateFull(claim.maksimGateNotifiedAt),
                })
              : t('notifiedPending')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('uploadHeading')}
        </p>
        <FileUpload
          value={picked}
          onChange={setPicked}
          labels={fileLabels}
          multiple={false}
          disabled={uploadM.isPending}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={!pickedFile || uploadM.isPending}
          >
            {uploadM.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" aria-hidden />
                {t('uploading')}
              </>
            ) : (
              <>
                <ShieldCheck size={14} aria-hidden />
                {t('uploadHeading')}
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── ②a Notes — who wrote what (UWAGI #4, 2026-10-22) ────────────────
//
// The wniosek's two free-text fields, each tagged with its AUTHOR so the
// verifier can never mistake one for the other:
//   «Komentarz przewoźnika»  — `claim.comment`, the carrier's submit note.
//   «Uzasadnienie decyzji» / «Powód odrzucenia» — `claim.decisionComment`,
//     MAGTRANS's justification; label by verdict (the pre-reklamacja verdict
//     while the claim sits in REKLAMACJA, see `lib/claims/claimNotes.ts`).
// The reklamacja answer (`reklamacjaResponse`) is NOT here — <ReklamacjaBlock>.
//
// Same flat chrome and the same muted quoted surface (`bg-input/40`) as the
// reklamacja treść / odpowiedź rows, so free text reads as quoted reference,
// never as an input. Rendered in BOTH modes: a decision note only exists on a
// decided claim, and the only decided claim that can be in `edit` is one in
// REKLAMACJA — exactly where the verifier deciding the dispute needs the
// original justification in view (and the morph must not drop content).

function ClaimNotesBlock({ claim }: { claim: ClaimDto }) {
  const t = useTranslations('employee.claims.modal.notes');

  const carrier = carrierNote(claim);
  const decision = decisionNote(claim);
  if (carrier == null && decision == null) return null;

  return (
    <section className="border-t border-border pt-5">
      <dl className="grid grid-cols-1 gap-4 text-sm">
        {carrier != null && (
          <NoteRow
            label={t('carrierComment')}
            author={t('carrierAuthor')}
            icon={<Truck size={12} aria-hidden className="shrink-0" />}
            text={carrier}
          />
        )}
        {decision != null && (
          <NoteRow
            label={t(decision.labelKey)}
            author={t('magtransAuthor')}
            icon={<Gavel size={12} aria-hidden className="shrink-0" />}
            text={decision.text}
          />
        )}
      </dl>
    </section>
  );
}

/** One quoted free-text row: micro-label + author tag, then the text. */
function NoteRow({
  label,
  author,
  icon,
  text,
}: {
  label: string;
  /** Who wrote it — «przewoźnik» / «MAGTRANS». */
  author: string;
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div>
      <dt className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
        <span className="text-[11px] uppercase tracking-wider text-text-sub">
          {label}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-text-sub">
          {icon}
          {author}
        </span>
      </dt>
      <dd className="mt-1 whitespace-pre-wrap rounded-md bg-input/40 p-3 text-text">
        {text}
      </dd>
    </div>
  );
}

// ── ②c Reklamacja block — read-only submission record (§6.5.15 A) ───
//
// Rendered whenever `claim.reklamacjaSubmitted` — independent of status, of mode
// and of the resolution. A decided reklamacja stays visible forever because the
// claim status no longer records it (both outcomes roll the wniosek back to
// `statusBeforeReklamacja`), making this the only staff-side trace besides
// Historia.
//
// Flat section chrome (`border-t` + micro-label), NOT the boxed <DecisionPanel>
// treatment: this is a READING step, and the box is reserved for the commitment.
// No banner, no section tint — the chip carries the tone (a work surface, not the
// carrier's emotional readout).

/**
 * The status the reklamacja ceiling must be computed against.
 *
 * While the dispute is open the claim's own status is `REKLAMACJA`, which the
 * shared cap helper would read as "nothing was paid" — overstating the ceiling
 * for a wniosek that WAS accepted. `statusBeforeReklamacja` is the frozen
 * pre-reklamacja verdict, i.e. exactly the status the api evaluated at submit
 * time. The `amountApproved`-based fallback mirrors the shared/api defensive
 * fallback for rows whose column is somehow NULL.
 */
function reklamacjaCapStatus(claim: ClaimDto): ClaimStatus {
  if (claim.status !== 'REKLAMACJA') return claim.status;
  return (
    claim.statusBeforeReklamacja ??
    (claim.amountApproved != null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO')
  );
}

function ReklamacjaBlock({ claim }: { claim: ClaimDto }) {
  const t = useTranslations('employee.claims.modal.reklamacja');

  const capStatus = reklamacjaCapStatus(claim);
  const requested = claim.origPaymentEur ?? claim.paymentEur;
  // THE ceiling formula lives in `@magguarantee/shared` (the api calls the same
  // function) — display-only here, never re-validated client-side.
  const maxAtSubmit = resolveReklamacjaCap({
    status: capStatus,
    origPaymentEur: claim.origPaymentEur,
    paymentEur: claim.paymentEur,
    amountApproved: claim.amountApproved,
  });
  // Derived by subtraction so the printed arithmetic always adds up, whichever
  // branch the shared helper took.
  const paid = requested - maxAtSubmit;
  const decided = claim.reklamacjaResolution != null;

  return (
    <section className="space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
          {t('title')}
        </h3>
        <ReklamacjaResolutionChip resolution={claim.reklamacjaResolution} />
      </div>

      <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        {/* 1 — the kwota that WILL be paid on UZNANA. Nothing recomputes it. */}
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-text-sub">
            {t('amount')}
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums text-text">
            {formatEur(claim.reklamacjaAmount)}
          </dd>
        </div>

        {/* 2 — the reviewer's sanity check: was the ask within the ceiling? */}
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-text-sub">
            {t('maxAtSubmit')}
          </dt>
          <dd className="mt-0.5 tabular-nums text-text-sub">
            {t('maxAtSubmitValue', {
              max: formatEur(maxAtSubmit),
              requested: formatEur(requested),
              paid: formatEur(paid),
            })}
            {capStatus === 'ODRZUCONO' && (
              <span className="ml-1 text-text-sub">
                {t('maxAtSubmitRejectedClause')}
              </span>
            )}
          </dd>
        </div>

        {/* 3 — zgłoszono */}
        {claim.reklamacjaSubmittedAt && (
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-text-sub">
              {t('submittedAt')}
            </dt>
            <dd className="mt-0.5 tabular-nums text-text">
              {formatDateFull(claim.reklamacjaSubmittedAt)}
            </dd>
          </div>
        )}

        {/* 4 — treść, on the muted read-only surface (§6.5.3) so a long carrier
            paragraph reads as quoted reference material, not as an input. */}
        {claim.reklamacjaText && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wider text-text-sub">
              {t('text')}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-md bg-input/40 p-3 text-text">
              {claim.reklamacjaText}
            </dd>
          </div>
        )}

        {/* 5–7 — the POST-decision half. Omitted (never «—») until they exist. */}
        {claim.reklamacjaResolution === 'UZNANA' &&
          claim.reklamacjaOrderNumber && (
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-text-sub">
                {t('orderNumber')}
              </dt>
              <dd className="mt-0.5 font-mono text-text">
                {claim.reklamacjaOrderNumber}
              </dd>
            </div>
          )}

        {decided && claim.reklamacjaDecidedAt && (
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-text-sub">
              {t('decidedAt')}
            </dt>
            <dd className="mt-0.5 tabular-nums text-text">
              {formatDateFull(claim.reklamacjaDecidedAt)}
            </dd>
          </div>
        )}

        {claim.reklamacjaResponse && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wider text-text-sub">
              {t('response')}
            </dt>
            <dd className="mt-1 whitespace-pre-wrap rounded-md bg-input/40 p-3 text-text">
              {claim.reklamacjaResponse}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}

// ── ③ Decision panel — the contained commitment step (§6.5.12) ──────
//
// Everything above the decyzja is a flat `border-t` divided section: those are
// all READING steps of one narrative. The decyzja is the single irreversible,
// state-changing block, so it is CONTAINERISED rather than merely divided —
// «a hairline rule says "same family, next item"; a card says "different kind
// of thing"». The 3px brand-red top rule reuses the <LoginCard> brand anchor:
// brand red = "this is the moment that matters".
//
// Surface stays `bg-card` (NOT `bg-input`) deliberately: the panel holds
// editable inputs, which would lose their surface contrast against a filled
// panel AND collide with the `bg-input/40` locked-field language (§6.5.13).
// Containment is carried by border + radius + padding, not by a fill. No
// shadow — the panel is already inside a `shadow-modal` dialog.
//
// The shell renders IDENTICALLY in all three branches (terminal note, view-mode
// hint, edit-mode fields) — the container must never appear/disappear across
// `mode` (§6.5.6 no-jump rule).

function DecisionPanel({
  tUnified,
  subtitle,
  children,
}: {
  tUnified: ReturnType<typeof useTranslations<'employee.claims.modal.unified'>>;
  /** Panel subtitle — swapped for the reklamacja copy at `status === REKLAMACJA`
   *  (§6.5.15 B), so the verifier reads what they are actually deciding. */
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 space-y-4 rounded-xl border border-border border-t-[3px] border-t-brand bg-card p-4 sm:p-5">
      <div>
        {/* Promoted OUT of the `text-xs uppercase text-text-sub` section-label
            class used above — that class is for field-group labels, and using
            it here is exactly why decyzja read as "just another group". */}
        <div className="flex items-center gap-2">
          <Gavel size={16} aria-hidden className="shrink-0 text-brand" />
          <h3 className="text-sm font-bold text-text">
            {tUnified('decyzjaSection')}
          </h3>
        </div>
        <p className="mt-0.5 text-xs text-text-sub">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

// ── ③ Decision fields ───────────────────────────────────────────────

function DecisionFields({
  claim,
  form,
  targets,
  targetStatus,
  decisionGated,
  errMsg,
  tEdit,
  tStatus,
}: {
  /** Needed by the reklamacja branches: the carrier's kwota (read-only echo) and
   *  the status the wniosek will roll back to. */
  claim: ClaimDto;
  form: UseFormReturn<FormValues>;
  targets: ClaimDecisionTarget[];
  targetStatus: FormValues['targetStatus'];
  /** True when the verifier-checkpoint gate is active (NA_WERYFIKACJI and not
   *  yet verified / has unsaved corrections) — disables the decyzja select. */
  decisionGated: boolean;
  errMsg: (key: string) => string | undefined;
  tEdit: ReturnType<typeof useTranslations<'employee.claims.modal.edit'>>;
  tStatus: ReturnType<
    typeof useTranslations<'employee.claims.modal.targetStatus'>
  >;
}) {
  // <StatusBadge>'s own label map — reused so the «status will return to X»
  // hint names the status exactly as the badge will render it.
  const tClaimStatus = useTranslations('carrier.claims.status');

  // The status the wniosek returns to after EITHER reklamacja outcome (both roll
  // back to `statusBeforeReklamacja`). The `amountApproved` fallback mirrors the
  // shared/api defensive fallback for rows whose column is somehow NULL.
  const returnStatus: ClaimStatus =
    claim.statusBeforeReklamacja ??
    (claim.amountApproved != null ? 'ZAAKCEPTOWANO' : 'ODRZUCONO');
  const isReklamacjaTarget =
    targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO' ||
    targetStatus === 'REKLAMACJA_ODRZUCONO';

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
              disabled={decisionGated}
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
            {/* §6.5.13 Tier A recipe — VERBATIM, the only field-level lock style
                in the modal. `readOnly` (never `disabled`) keeps the field
                RHF-registered and part of the submitted payload. Since этап 5.1
                (§6.5.14 REMOVED) there is no «kwota Maksima» override branch —
                the approved amount is ALWAYS the server-computed locked value. */}
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
          </FormField>
          {/* MAGTRANS's justification → `decisionComment` (the wire field is
              still `comment`). Never the carrier's note: that is shown,
              read-only and author-tagged, in <ClaimNotesBlock> above. */}
          <FormField
            label={tEdit('decisionCommentAccepted')}
            error={errMsg('comment')}
            htmlFor="claim-comment-accept"
            className="col-span-2"
          >
            <Textarea
              id="claim-comment-accept"
              rows={3}
              aria-describedby="claim-comment-accept-hint"
              {...form.register('comment')}
            />
            <FormDescription
              id="claim-comment-accept-hint"
              className="flex items-center gap-1"
            >
              <Eye aria-hidden className="size-3 shrink-0" />
              {tEdit('decisionCommentVisibleHint')}
            </FormDescription>
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
            aria-describedby="claim-comment-reject-hint"
            {...form.register('comment')}
          />
          <FormDescription
            id="claim-comment-reject-hint"
            className="flex items-center gap-1"
          >
            <Eye aria-hidden className="size-3 shrink-0" />
            {tEdit('decisionCommentVisibleHint')}
          </FormDescription>
        </FormField>
      )}

      {/* ── Uznaj reklamację (§6.5.15 B) ──
          The pracownik no longer types an amount: the paid figure IS the
          carrier's `reklamacjaAmount`, already validated against the ceiling at
          submit time. Per §6.5.13 the impossible input is REMOVED, not greyed —
          what stays is a read-only echo, because the verifier is authorising
          exactly that figure and must see it inside the commitment box. */}
      {targetStatus === 'REKLAMACJA_ZAAKCEPTOWANO' && (
        <FormGrid cols={2}>
          <FormField
            label={tEdit('reklamacjaOrderNumber')}
            required
            error={errMsg('reklamacjaOrderNumber')}
            htmlFor="claim-reklamacjaOrderNumber"
            description={tEdit('reklamacjaOrderNumberHint')}
          >
            {/* Prefilled ONCE from `claim.orderNumber` (see `getDefaults`) —
                fully editable, and legitimately empty on a rejected wniosek that
                never had one. Never re-prefilled after the user types. */}
            <Input
              id="claim-reklamacjaOrderNumber"
              className="font-mono"
              {...form.register('reklamacjaOrderNumber')}
            />
          </FormField>
          <FormField
            label={tEdit('reklamacjaPayoutAmount')}
            htmlFor="claim-reklamacjaPayoutAmount"
          >
            {/* Muted declared-value treatment (§6.5.3) — NO <Lock> glyph: this
                is not a locked input, it is a value being quoted. Deliberately
                NOT RHF-registered: the amount is never part of the payload. A
                real <input readOnly> (not a styled <div>) so the <FormField>
                label associates with it and screen readers announce both. */}
            <Input
              id="claim-reklamacjaPayoutAmount"
              readOnly
              tabIndex={-1}
              aria-readonly="true"
              value={formatEur(claim.reklamacjaAmount)}
              className="bg-input/40 font-semibold tabular-nums text-text-sub cursor-not-allowed focus:border-border focus:ring-0"
            />
          </FormField>
          <FormField
            label={tEdit('comment')}
            error={errMsg('comment')}
            htmlFor="claim-comment-rek-accept"
            className="col-span-2"
          >
            <Textarea
              id="claim-comment-rek-accept"
              rows={3}
              placeholder={tEdit('reklamacjaCommentPlaceholder')}
              {...form.register('comment')}
            />
          </FormField>
        </FormGrid>
      )}

      {/* ── Odrzuć reklamację ── required reason → `reklamacjaResponse`, read
          VERBATIM by the carrier in <ReklamacjaOutcome>. No order number, no
          amount. The wire field is `comment`, hence the `comment` error path. */}
      {targetStatus === 'REKLAMACJA_ODRZUCONO' && (
        <FormField
          label={tEdit('reklamacjaResponse')}
          required
          error={errMsg('comment')}
          htmlFor="claim-comment-rek-reject"
        >
          <Textarea
            id="claim-comment-rek-reject"
            rows={4}
            placeholder={tEdit('reklamacjaResponsePlaceholder')}
            {...form.register('comment')}
          />
        </FormField>
      )}

      {/* Status-after-decision — INFORMATIONAL, never a warning (§7.7.1a "a
          state is not an error"). Without it the verifier reads the status
          snapping back to «Odrzucono» as their decision having been lost. */}
      {isReklamacjaTarget && (
        <p className="text-xs text-text-sub" role="status">
          {tEdit('reklamacjaStatusReturnHint', {
            status: tClaimStatus(returnStatus),
          })}
        </p>
      )}
    </div>
  );
}

// ── ④ Secondary sub-panel (Historia, §6.5.7) ────────────────────────
//
// Authorization is no longer a manual sub-panel — it is the automatic Maksim-
// gate block rendered above Decyzja. So this collapses to a single «Historia»
// section, shown only when the claim actually carries history; otherwise the
// whole block is omitted (no Tabs chrome).

function SecondaryPanel({
  claim,
  hasHistory,
}: {
  claim: ClaimDto;
  hasHistory: boolean;
}) {
  const t = useTranslations('employee.claims.modal.unified');

  if (!hasHistory) return null;

  return (
    <section className="border-t border-border pt-5 space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-text-sub">
        {t('secondaryHistory')}
      </h3>
      <HistorySection claim={claim} />
    </section>
  );
}

/** True when the claim carries an orig* snapshot, a reklamacja, or a decision. */
function claimHasHistory(claim: ClaimDto): boolean {
  return (
    claim.origDateStart !== null ||
    claim.origDateEnd !== null ||
    claim.origMileage !== null ||
    verifierMovedAmount(claim) ||
    (claim.origHoursAdjusted !== null &&
      claim.origHoursAdjusted !== claim.hoursAdjustedValue) ||
    claim.reklamacjaSubmitted ||
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
    // Money moved — the single most important thing the verifier can change,
    // and until now the ONLY correction this block did not surface (the
    // authorization email to Maksim has carried this diff all along).
    verifierMovedAmount(claim) ||
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
            {/* Dopłata — rendered only when it actually moved, so the row does
                not print the same number twice on the common case. `current` is
                `paymentEur`, NOT `amountApproved`: this block is about what the
                VERIFIER changed, and the approved amount is the separate
                decision recorded above. */}
            {verifierMovedAmount(claim) && (
              <DiffRow
                label={t('origPaymentEur')}
                orig={`${formatEur(claim.origPaymentEur)} €`}
                current={`${formatEur(claim.paymentEur)} €`}
              />
            )}
          </div>
        </section>
      )}

      {/* Reklamacja record (§6.5.15 C) — the four scalar facts of the dispute,
          each rendered only when present. Read-only, no diff emphasis: nothing
          here was ever corrected, so a «Pierwotnie / Aktualnie» pair would be
          two copies of one value. */}
      {claim.reklamacjaSubmitted && (
        <section className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('reklamacjaRecord')}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {claim.reklamacjaAmount != null && (
              <RecordRow
                label={t('reklamacjaAmount')}
                value={formatEur(claim.reklamacjaAmount)}
              />
            )}
            {claim.reklamacjaOrderNumber && (
              <RecordRow
                label={t('reklamacjaOrderNumber')}
                value={claim.reklamacjaOrderNumber}
                mono
              />
            )}
            {claim.reklamacjaSubmittedAt && (
              <RecordRow
                label={t('reklamacjaSubmittedAt')}
                value={formatDateFull(claim.reklamacjaSubmittedAt)}
              />
            )}
            {claim.reklamacjaDecidedAt && (
              <RecordRow
                label={t('reklamacjaDecidedAt')}
                value={formatDateFull(claim.reklamacjaDecidedAt)}
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

/** A single-value record row — the DiffRow typography without the diff. */
function RecordRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="text-sm space-y-0.5">
      <p className="text-xs font-medium text-text-sub">{label}</p>
      <p className={cn('text-text', mono ? 'font-mono' : 'tabular-nums')}>
        {value}
      </p>
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

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Wall-clock `HH:mm` of an ISO datetime, read straight off the `T`-part — the
 * SAME slice the api uses when it stores a claim's time window, so a
 * weryfikator figure and a carrier declaration are always compared in the same
 * clock. `null`/`undefined` in ⇒ `undefined` out (column dropped).
 */
function hhMmFromIso(iso: string | null | undefined): string | undefined {
  return iso ? iso.slice(11, 16) : undefined;
}

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
    // Kwota zatwierdzona — always the server-computed value (§6.5.14 REMOVED, no
    // «kwota Maksima» override). The ZAAKCEPTOWANO effect keeps it in sync with
    // the live dopłata; `paymentEur` is the prefill / fallback.
    amountApproved: claim.amountApproved ?? claim.paymentEur ?? undefined,
    // The decision textarea writes MAGTRANS's justification (`decisionComment`),
    // so it is seeded from THAT — never from `claim.comment`, the carrier's own
    // note (UWAGI #4: prefilling it re-sent the carrier's words as MAGTRANS's
    // decision). On a REKLAMACJA the field feeds `reklamacjaResponse` instead —
    // prefilling it with the old decision text would silently republish it to
    // the carrier as the reklamacja answer, so it starts empty there.
    comment:
      claim.status === 'REKLAMACJA' ? '' : (claim.decisionComment ?? ''),
    // Seeded ONCE (mount / «Anuluj» re-baseline) from the wniosek's own order
    // number, per §6.5.15 B: a convenience prefill, never a lock, and
    // legitimately empty when the wniosek was rejected.
    reklamacjaOrderNumber: claim.orderNumber ?? '',
  };
}

export default ClaimModal;
