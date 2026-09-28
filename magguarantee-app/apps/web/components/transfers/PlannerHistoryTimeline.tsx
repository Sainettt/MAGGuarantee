'use client';

// docs/14 §17.6 — <PlannerHistoryTimeline>: who planned the vehicle, from when
// to when, from whom to whom, who asked and who approved. Newest first, on the
// §6.4.1a stepper spine (dot + hairline).
//
//   ◍ pending request (always first, amber dot)
//   ● current assignment («Obecnie», green dot)
//   ● closed assignments (neutral dot)
//   ▸ <details> rejected / cancelled requests (the planista never changed)
//
// Presentational: the caller owns the query (`useVehiclePlannerHistory`) and
// passes its state in, so the vehicle modal can also read the pending request
// from the same cache entry. A 403 is not rendered here — callers omit the
// whole section for viewers outside U11 (§17.6.1).

import { useTranslations } from 'next-intl';
import type {
  PlannerAssignmentDto,
  PlannerTransferDto,
  VehiclePlannerHistoryDto,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateFull, formatDateTime } from '@/lib/format/numbers';
import { roleLabelKey } from '@/lib/roles';
import { marker, splitMarked } from '@/lib/transfers/interpolateNodes';
import { buildPlannerTimeline } from '@/lib/transfers/plannerTimeline';
import { isHistoryForbidden } from '@/lib/transfers/transferErrors';
import { personName } from '@/lib/transfers/transferUi';
import { cn } from '@/lib/utils';

import { TransferRequestCard } from './TransferRequestCard';
import { TransferStatusBadge } from './TransferStatusBadge';

export interface PlannerHistoryTimelineProps {
  plate: string;
  history: VehiclePlannerHistoryDto | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  isRetrying?: boolean;
}

/** Spine: every item but the last draws the hairline down to the next dot. */
const ITEM =
  'relative pl-5 before:absolute before:left-[3px] before:top-3 before:bottom-[-1rem] before:w-px before:bg-border last:before:hidden';
const DOT = 'absolute left-0 top-1.5 h-2 w-2 rounded-full';
const QUOTE =
  'mt-1 border-l-2 border-border pl-2 text-sm text-text whitespace-pre-line break-words';

function When({ iso, dateOnly = false }: { iso: string; dateOnly?: boolean }) {
  return (
    <time dateTime={iso}>{dateOnly ? formatDateFull(iso) : formatDateTime(iso)}</time>
  );
}

export function PlannerHistorySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="mt-1.5 h-2 w-2 rounded-full" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PlannerHistoryTimeline({
  plate,
  history,
  isLoading,
  error,
  onRetry,
  isRetrying = false,
}: PlannerHistoryTimelineProps) {
  const t = useTranslations('transfers');
  const tRoot = useTranslations();
  const roleOf = (p: { role: PlannerTransferDto['requestedBy']['role']; lider: boolean }) =>
    tRoot(roleLabelKey(p.role, p.lider));

  if (isLoading) return <PlannerHistorySkeleton />;

  if (!history) {
    if (error && isHistoryForbidden(error)) {
      return <p className="text-sm text-text-sub">{t('history.forbidden')}</p>;
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-text-sub">{t('history.error')}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {t('history.retry')}
        </Button>
      </div>
    );
  }

  const { pending, assignments, closed } = buildPlannerTimeline(history);

  const renderAssignment = (a: PlannerAssignmentDto) => {
    const current = a.validTo === null;
    const backfill = a.source === 'backfill';
    let who: React.ReactNode = null;
    if (a.source === 'create') {
      who = t('history.createdBy', { name: personName(a.actor) });
    } else if (a.source === 'transfer') {
      const requester = a.transfer?.requestedBy ?? null;
      const approver = a.transfer?.decidedBy ?? a.actor;
      who = [
        requester
          ? t('history.requestedBy', {
              name: personName(requester),
              role: roleOf(requester),
            })
          : null,
        approver
          ? t('history.approvedBy', {
              name: personName(approver),
              role: roleOf(approver),
            })
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
    } else {
      who = t('history.backfillNote');
    }

    return (
      <li key={a.id} className={ITEM}>
        <span
          aria-hidden="true"
          className={cn(DOT, current ? 'bg-success' : 'bg-border')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-text">
            {personName(a.planner)}
          </span>
          {current ? <Badge variant="success">{t('history.current')}</Badge> : null}
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-sub tabular-nums">
          <span>
            {/* «od {from}» / «{from} – {to}» with real <time> elements in the
                slots; the locale keeps control of the word order. */}
            {splitMarked(
              current
                ? t('history.since', { from: marker('from') })
                : t('history.range', { from: marker('from'), to: marker('to') }),
            ).map((part, i) =>
              typeof part === 'string' ? (
                part
              ) : part.name === 'from' ? (
                // Backfill start = the vehicle's creation, its time means nothing.
                <When key={i} iso={a.validFrom} dateOnly={backfill} />
              ) : (
                <When key={i} iso={a.validTo ?? a.validFrom} />
              ),
            )}
          </span>
          <Badge variant="muted">{t(`history.source.${a.source}`)}</Badge>
        </p>
        {who ? <p className="mt-0.5 text-xs text-text-sub">{who}</p> : null}
        {a.source === 'transfer' && a.transfer ? (
          <>
            <p className={QUOTE}>{a.transfer.reason}</p>
            {a.transfer.decisionComment ? (
              <p className={QUOTE}>
                <span className="font-semibold">{t('card.commentLabel')}: </span>
                {a.transfer.decisionComment}
              </p>
            ) : null}
          </>
        ) : null}
      </li>
    );
  };

  const empty = !pending && assignments.length === 0;

  return (
    <div>
      {empty ? (
        <p className="text-sm text-text-sub">—</p>
      ) : (
        <ol
          aria-label={t('history.listAria', { plate })}
          className="relative flex flex-col gap-4"
        >
          {pending ? (
            <li className={ITEM}>
              <span aria-hidden="true" className={cn(DOT, 'bg-warning')} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-text">
                  {t('history.pendingNode', { to: personName(pending.toPlanner) })}
                </span>
                <TransferStatusBadge status="pending" />
              </div>
              <p className="mt-0.5 text-xs text-text-sub">
                {t('history.pendingMeta', {
                  date: formatDateTime(pending.createdAt),
                  name: personName(pending.requestedBy),
                  role: roleOf(pending.requestedBy),
                })}
              </p>
              <p className={QUOTE}>{pending.reason}</p>
            </li>
          ) : null}
          {assignments.map(renderAssignment)}
        </ol>
      )}

      {closed.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer rounded-sm text-xs font-semibold text-text-sub hover:text-text focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40">
            {t('history.closedRequests', { count: closed.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {closed.map((tr) => (
              <li key={tr.id}>
                <TransferRequestCard transfer={tr} mode="author" compact />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export { PlannerHistoryTimeline };
