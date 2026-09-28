// Pure UI rules of the vehicle planner transfer (docs/14 §17.2, §17.4.3,
// §17.5.3, §17.6.3) — kept out of the components so they are unit-tested
// without rendering.
//
// Rule of thumb: WHO may decide / cancel a request is never re-derived here —
// the api computes it per viewer (`viewerCanDecide`, `viewerBlockedReason`,
// `viewerCanCancel`) with the same rule as its 403s. This module only turns
// those flags + the viewer's role into "what to render".

import type { PlannerTransferDto, Role } from '@magguarantee/shared';

// ─── Nav counter (§17.4.3) ───────────────────────────────

/**
 * Pending requests the viewer can actually decide. A lider's rows he may not
 * decide (he is the author / the target — R4) stay in his list but do not
 * count, otherwise the badge could never reach zero.
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
   * `request` — the «Poproś o zmianę planisty» button (E1);
   * `skeleton` — the history is still loading, so we don't yet know whether
   * the button would be refused as «already pending»;
   * `null` — no action (E2 admin / E3 inactive / E4 pending / other roles).
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
  // R2 + U1: of the form's two roles only the opiekun files; never for a
  // switched-off vehicle (A5 — the api would 422 anyway).
  const canFile = viewerRole === 'opiekun' && vehicleActive;
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
 * planista (R2; admin never files — U1; the opiekun goes through «Edytuj»),
 * only for an enabled vehicle, only once the history confirmed there is no
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

// ─── Display helpers ─────────────────────────────────────

/** `name ?? login` — the one way a person is shown across §17. */
export function personName(
  p: { name: string | null; login: string } | null | undefined,
): string {
  if (!p) return '—';
  const name = p.name?.trim();
  return name ? name : p.login;
}
