'use client';

// Phase 4.5 — `/diagnostics` DB tab.
//
// Two status pills (postgres + redis) with latency in ms, and a table of
// table sizes (Postgres only) sorted desc. We don't render redis "keys"
// here — the backend response doesn't surface them in the current contract.

import { Database } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/Skeleton';
import { useDiagnosticsDb } from '@/lib/hooks/useDiagnostics';
import { cn } from '@/lib/utils';

/** Pretty-print byte sizes as KiB/MiB/GiB. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function StatusPill({
  label,
  ok,
  latencyMs,
}: {
  label: string;
  ok: boolean;
  latencyMs: number;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card shadow-card px-4 py-3',
        ok ? 'border-border' : 'border-danger/40 dark:border-danger/30',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-2.5 w-2.5 rounded-full',
          ok ? 'bg-success' : 'bg-danger',
        )}
      />
      <span className="font-semibold text-text">{label}</span>
      <span className="ml-auto text-xs text-text-sub tabular-nums">
        {latencyMs.toFixed(1)} ms
      </span>
    </div>
  );
}

export function DbHealthSection() {
  const t = useTranslations('diagnostics.db');
  const { data, isLoading } = useDiagnosticsDb();

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const tablesSorted = [...data.postgres.tables].sort(
    (a, b) => b.sizeBytes - a.sizeBytes,
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatusPill
          label={t('postgres')}
          ok={data.postgres.ok}
          latencyMs={data.postgres.latencyMs}
        />
        <StatusPill
          label={t('redis')}
          ok={data.redis.ok}
          latencyMs={data.redis.latencyMs}
        />
      </div>

      <section className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Database size={14} className="text-text-sub" aria-hidden />
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('tablesTitle')}
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bg">
              <tr>
                <th
                  scope="col"
                  className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('tableName')}
                </th>
                <th
                  scope="col"
                  className="px-3 py-2 text-right text-xs font-bold uppercase tracking-wider text-text-sub border-b border-border"
                >
                  {t('tableSize')}
                </th>
              </tr>
            </thead>
            <tbody>
              {tablesSorted.map((row) => (
                <tr
                  key={row.name}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                  <td className="px-3 py-2 text-right text-text-sub tabular-nums">
                    {formatBytes(row.sizeBytes)}
                  </td>
                </tr>
              ))}
              {tablesSorted.length === 0 && (
                <tr>
                  <td
                    colSpan={2}
                    className="px-3 py-8 text-center text-sm text-text-sub"
                  >
                    {t('tablesEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
