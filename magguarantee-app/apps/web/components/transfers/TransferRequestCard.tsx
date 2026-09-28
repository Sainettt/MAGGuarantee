'use client';

// docs/14 §17.5.2 — <TransferRequestCard>: one planner-transfer request.
//
// A card, not a table row (D7): the free text (reason, comment, rejection
// reason) is what the decision is about, so it is shown in FULL. Buttons come
// from the viewer flags the api computed (`cardActions`, §17.5.3) — never
// re-derived here. A decider who may not decide a row (he is its author /
// target, R4) gets the REASON in a <LockNotice> instead of the buttons (not
// disabled buttons — §6.5.13).
//
// `compact` — the rejected / cancelled rows under the history timeline
// (§17.6.2): same anatomy, `p-3`, no action row.

import { ArrowRight, History } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import type { PlannerTransferDto } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { LockNotice } from '@/components/ui/LockNotice';
import { formatDateTime } from '@/lib/format/numbers';
import { roleLabelKey } from '@/lib/roles';
import { cardActions, personName } from '@/lib/transfers/transferUi';
import { cn } from '@/lib/utils';

import { TransferStatusBadge } from './TransferStatusBadge';

export interface TransferRequestCardProps {
  transfer: PlannerTransferDto;
  mode: 'decider' | 'author';
  /** Admin inbox: the «Lider planisty: …» line (who else could decide). */
  showLeader?: boolean;
  /** History-timeline variant: `p-3`, no action row. */
  compact?: boolean;
  onApprove?: (t: PlannerTransferDto) => void;
  onReject?: (t: PlannerTransferDto) => void;
  onCancel?: (t: PlannerTransferDto) => void;
  onShowHistory?: (t: PlannerTransferDto) => void;
}

/** The small caption above a free-text block. */
function Caption({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-text-sub">
      {children}
    </p>
  );
}

export default function TransferRequestCard({
  transfer,
  mode,
  showLeader = false,
  compact = false,
  onApprove,
  onReject,
  onCancel,
  onShowHistory,
}: TransferRequestCardProps) {
  const t = useTranslations('transfers.card');
  const tRoot = useTranslations();
  const plateId = useId();
  const fromToId = useId();
  const lockId = useId();

  const roleOf = (p: { role: PlannerTransferDto['requestedBy']['role']; lider: boolean }) =>
    tRoot(roleLabelKey(p.role, p.lider));

  const actions = compact ? { kind: 'none' as const } : cardActions(transfer, mode);
  const { vehicle, fromPlanner, toPlanner, requestedBy, decidedBy } = transfer;

  // Decision block (decided rows) — who closed it, when, and the text.
  let decisionLine: string | null = null;
  if (transfer.status !== 'pending') {
    const date = formatDateTime(transfer.decidedAt ?? transfer.updatedAt);
    if (transfer.status === 'cancelled') {
      // Normally the author withdrew it; a vehicle switched off / deleted
      // cancels it on behalf of whoever did that (docs/29 U6).
      decisionLine =
        !decidedBy || decidedBy.id === requestedBy.id
          ? t('cancelledAt', { date })
          : t('cancelledBy', {
              name: personName(decidedBy),
              role: roleOf(decidedBy),
              date,
            });
    } else if (decidedBy) {
      decisionLine = t(transfer.status === 'approved' ? 'approvedBy' : 'rejectedBy', {
        name: personName(decidedBy),
        role: roleOf(decidedBy),
        date,
      });
    }
  }

  // Plain join — `cn`/tailwind-merge would mangle React ids like ":r1:".
  const describedBy = [fromToId, actions.kind === 'blocked' ? lockId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <article
      aria-labelledby={plateId}
      aria-describedby={describedBy}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-border bg-card',
        compact ? 'p-3' : 'p-4 sm:p-5',
      )}
    >
      {/* Row 1 — plate · side · status · filed at */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span id={plateId} className="font-mono font-semibold text-text">
          {vehicle.plateNumber}
        </span>
        {vehicle.sideNumber ? (
          <span className="text-xs text-text-sub">
            {t('side', { side: vehicle.sideNumber })}
          </span>
        ) : null}
        <TransferStatusBadge status={transfer.status} />
        <time
          dateTime={transfer.createdAt}
          className="ml-auto text-xs text-text-sub tabular-nums"
        >
          {formatDateTime(transfer.createdAt)}
        </time>
      </div>

      <div className="flex flex-col gap-1">
        {/* Row 2 — carrier */}
        {vehicle.carrier ? (
          <p className="text-sm text-text-sub">{personName(vehicle.carrier)}</p>
        ) : null}

        {/* Row 3 — from → to. The target is bolder: it is WHAT is approved. */}
        <p id={fromToId} className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-text">{personName(fromPlanner)}</span>
          <ArrowRight size={14} aria-hidden="true" className="text-text-sub" />
          <span className="sr-only">{t('fromToSr')}</span>
          <span className="font-semibold text-text">{personName(toPlanner)}</span>
        </p>

        {/* Row 4 — who filed it */}
        <p className="text-xs text-text-sub">
          {t('requestedBy', {
            name: personName(requestedBy),
            role: roleOf(requestedBy),
          })}
        </p>

        {showLeader ? (
          <p className="text-xs text-text-sub">
            {fromPlanner.leader
              ? t('liderOf', { name: personName(fromPlanner.leader) })
              : t('noLider')}
          </p>
        ) : null}
      </div>

      {/* Reason — in full, never clamped (it is what the decision is about). */}
      <div className="flex flex-col gap-1">
        <Caption>{t('reasonLabel')}</Caption>
        <p className="whitespace-pre-line break-words text-sm text-text">
          {transfer.reason}
        </p>
      </div>

      {decisionLine ? (
        <div
          className={cn(
            'flex flex-col gap-1 border-l-2 pl-3 text-sm',
            transfer.status === 'approved'
              ? 'border-l-success'
              : transfer.status === 'rejected'
                ? 'border-l-danger'
                : 'border-l-border',
          )}
        >
          <p className="text-xs text-text-sub">{decisionLine}</p>
          {transfer.decisionComment ? (
            <>
              <Caption>
                {transfer.status === 'rejected'
                  ? t('rejectionLabel')
                  : t('commentLabel')}
              </Caption>
              <p className="whitespace-pre-line break-words text-sm text-text">
                {transfer.decisionComment}
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      {!compact ? (
        <div className="flex flex-col-reverse gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center">
          {onShowHistory ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
              onClick={() => onShowHistory(transfer)}
            >
              <History size={14} aria-hidden="true" />
              {t('history')}
            </Button>
          ) : null}

          {actions.kind === 'decide' ? (
            <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
                onClick={() => onReject?.(transfer)}
              >
                {t('reject')}
              </Button>
              <Button
                type="button"
                size="sm"
                className="min-h-[44px] w-full sm:min-h-0 sm:w-auto"
                onClick={() => onApprove?.(transfer)}
              >
                {t('approve')}
              </Button>
            </div>
          ) : actions.kind === 'blocked' ? (
            <LockNotice id={lockId} className="sm:ml-auto sm:max-w-md">
              {actions.reason === 'target' ? t('blockedTarget') : t('blockedRequester')}
            </LockNotice>
          ) : actions.kind === 'cancel' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-[44px] w-full sm:ml-auto sm:min-h-0 sm:w-auto"
              onClick={() => onCancel?.(transfer)}
            >
              {t('cancel')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export { TransferRequestCard };
