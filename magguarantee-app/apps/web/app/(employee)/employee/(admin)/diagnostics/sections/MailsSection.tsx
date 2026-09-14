'use client';

// Phase 4.5 — `/diagnostics` mails tab.
//
// Lists every mail job (BullMQ backed; ring-buffer in Phase 4.5 dev) with
// the columns required by the brief. Resend button per row → confirm
// dialog → POST resend → toast.

import { Mail, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { DiagnosticsMailJob } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/format/numbers';
import {
  useDiagnosticsMails,
  useResendMail,
} from '@/lib/hooks/useDiagnostics';
import { queryErrorProps } from '@/lib/query/queryErrorProps';

type State = DiagnosticsMailJob['state'];

const STATE_VARIANT: Record<State, 'success' | 'danger' | 'info' | 'warning' | 'muted'> = {
  completed: 'success',
  failed: 'danger',
  active: 'info',
  waiting: 'warning',
  delayed: 'warning',
  unknown: 'muted',
};

export function MailsSection() {
  const t = useTranslations('diagnostics.mails');
  const tCommon = useTranslations('common');
  const listQ = useDiagnosticsMails();
  const { data, isLoading } = listQ;

  const [confirm, setConfirm] = useState<DiagnosticsMailJob | null>(null);
  const resendM = useResendMail({
    onSuccess: () => {
      toast.success(t('resentToast'));
      setConfirm(null);
    },
    onError: () => {
      toast.error(t('resendError'));
      setConfirm(null);
    },
  });

  const columns = useMemo<DataTableColumn<DiagnosticsMailJob>[]>(
    () => [
      {
        id: 'id',
        header: t('columns.id'),
        width: 'tight',
        cell: (row) => (
          <span className="font-mono text-xs">{row.id}</span>
        ),
      },
      {
        id: 'state',
        header: t('columns.state'),
        width: 'tight',
        cell: (row) => (
          <Badge variant={STATE_VARIANT[row.state]}>{row.state}</Badge>
        ),
      },
      {
        id: 'attempts',
        header: t('columns.attempts'),
        width: 'tight',
        align: 'right',
        cell: (row) => (
          <span className="tabular-nums">{row.attemptsMade}</span>
        ),
      },
      {
        id: 'subject',
        header: t('columns.subject'),
        width: 'flex',
        className: 'min-w-[200px]',
        truncate: 'ellipsis',
        cell: (row) => row.data.subject,
      },
      {
        id: 'to',
        header: t('columns.to'),
        width: 'auto',
        cell: (row) => (
          <span className="font-mono text-xs">{row.data.to}</span>
        ),
      },
      {
        id: 'createdAt',
        header: t('columns.createdAt'),
        width: 'tight',
        cell: (row) => (
          <span className="text-text-sub tabular-nums">
            {formatDateTime(row.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: <span className="sr-only">{tCommon('actions')}</span>,
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={(e) => {
              e.stopPropagation();
              setConfirm(row);
            }}
            aria-label={`${t('resend')} ${row.id}`}
          >
            <RefreshCw size={14} aria-hidden />
            <span className="hidden lg:inline">{t('resend')}</span>
          </Button>
        ),
      },
    ],
    [t, tCommon],
  );

  return (
    <>
      <DataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        isLoading={isLoading}
        {...queryErrorProps(listQ)}
        empty={
          <EmptyState
            icon={Mail}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <DialogContent>
          {confirm && (
            <>
              <DialogHeader>
                <DialogTitle>{t('confirmTitle')}</DialogTitle>
                <DialogDescription>
                  {t('confirmBody', { subject: confirm.data.subject })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirm(null)}
                  disabled={resendM.isPending}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => resendM.mutate(confirm.id)}
                  disabled={resendM.isPending}
                >
                  {t('resend')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
