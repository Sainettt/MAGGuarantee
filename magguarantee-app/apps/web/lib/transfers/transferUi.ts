// Pure UI rules of the vehicle planner transfer (docs/14 §17.2, §17.4.3,
// §17.5.3, §17.5.4, §17.6.3) — kept out of the components so they are
// unit-tested without rendering.
//
// Rule of thumb: WHO may decide / cancel a request is never re-derived here —
// the api computes it per viewer (`viewerCanDecide`, `viewerBlockedReason`,
// `viewerCanCancel`) with the same rule as its 403s. This module only turns
// those flags + the viewer's role into "what to render".
//
// Since 2026-10-23 an admin files requests too (docs/14 §17.0 D9 — U1
// reversed): from the vehicle edit form, on any active vehicle (E2). He still
// never decides his own request — another admin or the current planner's
// lider does (R4); the api flags that row `viewerBlockedReason='requester'`.

import type { PlannerTransferDto, Role } from '@magguarantee/shared';

// ─── Nav counter (§17.4.3) ───────────────────────────────

/**
 * Pending requests the viewer can actually decide. Rows he may not decide (a
 * lider who is the author / the target, an admin's own request — R4) stay in
 * his list but do not count, otherwise the badge could never reach zero.
 */
export function decidableCount(items: readonly PlannerTransferDto[]): number {
  return items.filter((t) => t.status === 'pending' && t.viewerCanDecide).length;
}

// ─── Vehicle form «Planista» cell (§17.2.2, E1–E4) ───────

export type PlannerLockReason = 'locked' | 'lockedAdmin' | 'lockedInactive';

export interface PlannerCellInput {
  viewerRole: Role | undefined;
  /** The SAVED state of the vehicle (not the form's unsaved checkbox). */
  vehicleActive: boolean;
  /**
   * Where the history query stands: `loading` — no answer yet; `ready` — it
   * answered (with or without a pending request); `unavailable` — it failed
   * (the server re-checks everything on submit, so the action stays).
   */
  history: 'loading' | 'ready' | 'unavailable';
  /** A `pending` request exists for the vehicle. */
  hasPending: boolean;
}

export interface PlannerCellState {
  /** Which `transfers.form.*` sentence explains the lock (always shown). */
  reason: PlannerLockReason;
  /**
   * `request` — the «Poproś o zmianę planisty» button (E1 opiekun / E2 admin);
   * `skeleton` — the history is still loading, so we don't yet know whether
   * the button would be refused as «already pending»;
   * `null` — no action (E3 inactive / E4 pending / other roles).
   */
  action: 'request' | 'skeleton' | null;
}

export function plannerCellState({
  viewerRole,
  vehicleActive,
  history,
  hasPending,
}: PlannerCellInput): PlannerCellState {
  const reason: PlannerLockReason = !vehicleActive
    ? 'lockedInactive'
    : viewerRole === 'admin'
      ? 'lockedAdmin'
      : 'locked';
  // R2 + D9: both roles of the edit form file — the opiekun (E1) and, since
  // 2026-10-23, the admin on any vehicle (E2); nobody for a switched-off
  // vehicle (E3, A5 — the api would 422 anyway).
  const canFile =
    (viewerRole === 'opiekun' || viewerRole === 'admin') && vehicleActive;
  if (!canFile) return { reason, action: null };
  if (history === 'loading') return { reason, action: 'skeleton' };
  if (hasPending) return { reason, action: null };
  return { reason, action: 'request' };
}

// ─── Vehicle detail modal footer (§17.6.3, D3) ───────────

export interface DetailTransferInput {
  viewerRole: Role | undefined;
  viewerId: string | undefined;
  vehicle: { plannerId: string | null; active: boolean };
  /** The history query answered successfully. */
  historyReady: boolean;
  hasPending: boolean;
}

/**
 * «Przekaż ciągnik» in the detail-modal footer: only the vehicle's CURRENT
 * planista (R2). The opiekun and the admin file from the edit form instead
 * («Edytuj» → E1 / E2, D9 — one entry per role), so they get no CTA here.
 * Only for an enabled vehicle, only once the history confirmed there is no
 * pending request.
 */
export function canTransferFromDetail({
  viewerRole,
  viewerId,
  vehicle,
  historyReady,
  hasPending,
}: DetailTransferInput): boolean {
  return (
    viewerRole === 'planista' &&
    viewerId !== undefined &&
    vehicle.plannerId === viewerId &&
    vehicle.active &&
    historyReady &&
    !hasPending
  );
}

// ─── Request card actions (§17.5.3) ──────────────────────

export type CardActions =
  | { kind: 'decide' }
  | { kind: 'blocked'; reason: 'target' | 'requester' }
  | { kind: 'cancel' }
  | { kind: 'none' };

/**
 * What the action row of a `<TransferRequestCard>` offers besides «Historia
 * planistów»:
 *   decider list — decide buttons, or a <LockNotice> with the reason (R4);
 *   author list  — «Anuluj wniosek» on the author's pending request;
 *   decided rows — nothing.
 */
export function cardActions(
  transfer: Pick<
    PlannerTransferDto,
    'status' | 'viewerCanDecide' | 'viewerBlockedReason' | 'viewerCanCancel'
  >,
  mode: 'decider' | 'author',
): CardActions {
  if (transfer.status !== 'pending') return { kind: 'none' };
  if (mode === 'decider') {
    if (transfer.viewerCanDecide) return { kind: 'decide' };
    if (transfer.viewerBlockedReason) {
      return { kind: 'blocked', reason: transfer.viewerBlockedReason };
    }
    return { kind: 'none' };
  }
  return transfer.viewerCanCancel ? { kind: 'cancel' } : { kind: 'none' };
}

/** `transfers.card.*` sentence of the decider's <LockNotice> (§17.5.4). */
export type BlockedNoticeKey =
  | 'blockedTarget'
  | 'blockedRequester'
  | 'blockedRequesterAdmin';

/**
 * Why the viewer may not decide a row of his «Do decyzji» list. The admin
 * variant of «it is your request» names who DOES decide (another admin or the
 * current planner's lider); a lider-author is told «an administrator».
 */
export function blockedNoticeKey(
  reason: 'target' | 'requester',
  viewerRole: Role | undefined,
): BlockedNoticeKey {
  if (reason === 'target') return 'blockedTarget';
  return viewerRole === 'admin' ? 'blockedRequesterAdmin' : 'blockedRequester';
}

// ─── Pending notice under the locked field (§17.2.2 E4) ──

export interface PendingNoticeState {
  /**
   * `transfers.card.blockedRequesterAdmin` above the cancel button — only for
   * an admin who filed the request: he gets «Anuluj» instead of the usual
   * «Rozpatrz» link and must learn why he can't decide it.
   */
  showAdminAuthorNote: boolean;
  /** `cancel` — «Anuluj wniosek»; `review` — the «Rozpatrz w „Przekazania”» link. */
  action: 'cancel' | 'review' | null;
}

/**
 * Author first (cancel, admin included), otherwise an admin gets the review
 * link — never both. Cancelling follows the api flag `viewerCanCancel`; the
 * author check by id (docs/14 §17.12 A9: the UI mirrors it, the server is
 * final) only keeps an admin-author from ever getting the link to a row he is
 * blocked on.
 */
export function pendingNoticeState(
  transfer: Pick<PlannerTransferDto, 'viewerCanCancel' | 'requestedBy'>,
  viewer: { role: Role | undefined; id: string | undefined },
): PendingNoticeState {
  const isAdmin = viewer.role === 'admin';
  const isAuthor =
    transfer.viewerCanCancel ||
    (viewer.id !== undefined && transfer.requestedBy.id === viewer.id);
  if (isAuthor) {
    return {
      showAdminAuthorNote: isAdmin,
      action: transfer.viewerCanCancel ? 'cancel' : null,
    };
  }
  return { showAdminAuthorNote: false, action: isAdmin ? 'review' : null };
}

// ─── Display helpers ─────────────────────────────────────

/** `name ?? login` — the one way a person is shown across §17. */
export function personName(
  p: { name: string | null; login: string } | null | undefined,
): string {
  if (!p) return '—';
  const name = p.name?.trim();
  return name ? name : p.login;
}
