'use client';

// Phase 4.5 — `/diagnostics` DB tab.
//
// Three status pills (postgres, redis, MAGSpace) with latency in ms, and a
// table of table sizes (Postgres only) sorted desc. We don't render redis
// "keys" here — the backend response doesn't surface them in the current
// contract.
//
// The MAGSpace pill is the SSO's health line (docs/24 §A4). It has a third
// state the other two do not: "not configured", meaning this deployment has no
// directory token and the Google path is simply off. Showing that as a red
// "down" would send an admin chasing an outage that isn't happening.

import { Database } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateTime } from '@/lib/format/numbers';
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
  /** Renders grey instead of red/green — the service is switched off, not broken. */
  muted = false,
  /** Replaces the latency readout (e.g. "not configured", last sync time). */
  detail,
}: {
  label: string;
  ok: boolean;
  latencyMs: number;
  muted?: boolean;
  detail?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card shadow-card px-4 py-3',
        ok || muted ? 'border-border' : 'border-danger/40 dark:border-danger/30',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'inline-block h-2.5 w-2.5 rounded-full',
          muted ? 'bg-text-sub/40' : ok ? 'bg-success' : 'bg-danger',
        )}
      />
      <span className="font-semibold text-text">{label}</span>
      <span className="ml-auto text-xs text-text-sub tabular-nums">
        {detail ?? `${latencyMs.toFixed(1)} ms`}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Skeleton className="h-14 w-full" />
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

  const magspace = data.magspace;
  // What an admin actually needs during an incident: how stale the
  // directory-driven roles can currently be.
  const magspaceDetail = !magspace.configured
    ? t('magspaceNotConfigured')
    : magspace.ok
      ? magspace.lastReconcileAt
        ? t('magspaceLastSync', { at: formatDateTime(magspace.lastReconcileAt) })
        : t('magspaceNeverSynced')
      : t('magspaceDown');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <StatusPill
          label={t('magspace')}
          ok={magspace.ok}
          latencyMs={magspace.latencyMs}
          muted={!magspace.configured}
          detail={magspaceDetail}
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
