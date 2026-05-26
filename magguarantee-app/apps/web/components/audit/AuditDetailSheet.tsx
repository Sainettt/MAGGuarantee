'use client';

// Phase 4.5 — full-detail sheet for a single audit row.
//
// Shows the row metadata (actor, action, target, timestamp, IP) and a
// side-by-side `before` / `after` JSON diff. We don't pull a dedicated diff
// library — the volume per audit row is tiny and a plain pretty-print
// with `<pre>` blocks is enough for an admin to spot the change. Future
// iteration could overlay a colour-coded diff if power-users ask for it.

import { useTranslations } from 'next-intl';
import type { AuditLogDto } from '@magguarantee/shared';

import { AuditAvatar } from '@/components/audit/AuditRow';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { formatDateTime } from '@/lib/format/numbers';

interface AuditDetailSheetProps {
  open: boolean;
  row: AuditLogDto | null;
  onClose: () => void;
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function AuditDetailSheet({
  open,
  row,
  onClose,
}: AuditDetailSheetProps) {
  const t = useTranslations('audit.detail');

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent size="xl">
        <SheetHeader>
          <SheetTitle>
            {row ? `${row.action} · ${row.targetKey ?? '—'}` : t('title')}
          </SheetTitle>
        </SheetHeader>
        <SheetBody className="space-y-6">
          {row && (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('actor')}
                  </span>
                  <div className="flex items-center gap-2">
                    <AuditAvatar login={row.userLogin} />
                    <div className="flex flex-col text-sm">
                      <span className="font-mono">{row.userLogin ?? '—'}</span>
                      <span className="text-text-sub">
                        {row.userName ?? ''}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('target')}
                  </span>
                  <p className="text-sm font-mono break-all">
                    {row.targetType ?? '—'} · {row.targetKey ?? '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('action')}
                  </span>
                  <p className="text-sm">{row.action}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('createdAt')}
                  </span>
                  <p className="text-sm tabular-nums">
                    {formatDateTime(row.createdAt)}
                  </p>
                </div>
                {row.reason && (
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                      {t('reason')}
                    </span>
                    <p className="text-sm">{row.reason}</p>
                  </div>
                )}
                {row.ipAddress && (
                  <div className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                      {t('ip')}
                    </span>
                    <p className="text-sm font-mono">{row.ipAddress}</p>
                  </div>
                )}
              </section>

              <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('before')}
                  </span>
                  <pre className="mt-2 max-h-96 overflow-auto text-xs bg-input p-3 rounded-md whitespace-pre-wrap break-words">
                    {prettyJson(row.before)}
                  </pre>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('after')}
                  </span>
                  <pre className="mt-2 max-h-96 overflow-auto text-xs bg-input p-3 rounded-md whitespace-pre-wrap break-words">
                    {prettyJson(row.after)}
                  </pre>
                </div>
              </section>

              {row.metadata !== null && row.metadata !== undefined && (
                <section>
                  <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
                    {t('metadata')}
                  </span>
                  <pre className="mt-2 max-h-72 overflow-auto text-xs bg-input p-3 rounded-md whitespace-pre-wrap break-words">
                    {prettyJson(row.metadata)}
                  </pre>
                </section>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
