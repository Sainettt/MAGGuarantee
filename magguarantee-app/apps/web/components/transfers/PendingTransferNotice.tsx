'use client';

// docs/14 §17.2.2 — <PendingTransferNotice>: the compact plate under the
// locked «Planista» field of the vehicle form while a request is pending (E4).
// Neutral surface — a pending request is a normal process state, not a problem
// (§6.5.13 «locked ≠ error»); the tone comes from the status badge alone.
//
//   author → «Anuluj wniosek» (→ <CancelTransferDialog>, §17.5.6);
//   admin  → link «Rozpatrz w „Przekazania”»;
//   others → nothing.

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import type { PlannerTransferDto } from '@magguarantee/shared';

import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/format/numbers';
import { roleLabelKey } from '@/lib/roles';
import { personName } from '@/lib/transfers/transferUi';

import { CancelTransferDialog } from './CancelTransferDialog';
import { TransferStatusBadge } from './TransferStatusBadge';

export interface PendingTransferNoticeProps {
  transfer: PlannerTransferDto;
  /** The viewer is an admin → the «review in Przekazania» link. */
  viewerIsAdmin: boolean;
}

export default function PendingTransferNotice({
  transfer,
  viewerIsAdmin,
}: PendingTransferNoticeProps) {
  const t = useTranslations('transfers.form');
  const tRoot = useTranslations();
  const tCard = useTranslations('transfers.card');
  const [cancelTarget, setCancelTarget] = useState<PlannerTransferDto | null>(
    null,
  );

  const requester = transfer.requestedBy;

  return (
    <div className="mt-2 flex flex-col gap-1.5 rounded-lg border border-border bg-input/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <TransferStatusBadge status="pending" />
        <span className="font-medium text-text">
          {t('pendingTitle', { to: personName(transfer.toPlanner) })}
        </span>
      </div>
      <p className="text-xs text-text-sub">
        {t('pendingMeta', {
          name: personName(requester),
          role: tRoot(roleLabelKey(requester.role, requester.lider)),
          date: formatDateTime(transfer.createdAt),
        })}
      </p>
      <p
        className="line-clamp-3 whitespace-pre-line break-words text-sm text-text"
        title={transfer.reason}
      >
        <span className="sr-only">{tCard('reasonLabel')}: </span>
        {transfer.reason}
      </p>
      {transfer.viewerCanCancel ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-end min-h-[44px] sm:min-h-0"
          onClick={() => setCancelTarget(transfer)}
        >
          {tCard('cancel')}
        </Button>
      ) : viewerIsAdmin ? (
        <Link
          href="/employee/przekazania"
          className="self-end rounded-sm text-xs font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40"
        >
          {t('reviewLink')}
        </Link>
      ) : null}

      <CancelTransferDialog
        transfer={cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
      />
    </div>
  );
}

export { PendingTransferNotice };
