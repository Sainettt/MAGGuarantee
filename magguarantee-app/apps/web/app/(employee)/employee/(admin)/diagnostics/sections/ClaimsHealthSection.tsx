'use client';

// Phase 4.5 — `/diagnostics` claims tab.
//
// Grid of health-metric cards. Each row from the backend is `{name, count,
// sampleIds}` — we render one card per metric. Zero counts get a calm
// "OK" look; non-zero counts surface in `danger`/`warning` tone so the
// admin notices.

import { Activity, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { DiagnosticsClaimsHealthRow } from '@magguarantee/shared';

import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDiagnosticsClaims } from '@/lib/hooks/useDiagnostics';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { cn } from '@/lib/utils';

function HealthCard({ row }: { row: DiagnosticsClaimsHealthRow }) {
  const t = useTranslations('diagnostics.claims');
  const healthy = row.count === 0;
  const Icon = healthy ? CheckCircle2 : AlertTriangle;
  return (
    <article
      className={cn(
        'rounded-xl border bg-card shadow-card p-4 flex flex-col gap-2',
        healthy
          ? 'border-border'
          : 'border-warning/40 dark:border-warning/30',
      )}
    >
      <div className="flex items-center gap-2">
        <Icon
          size={16}
          className={healthy ? 'text-success' : 'text-warning'}
          aria-hidden
        />
        <h3 className="text-sm font-bold text-text">{row.name}</h3>
      </div>
      <span className="text-3xl font-bold text-text tabular-nums">
        {row.count}
      </span>
      {row.sampleIds.length > 0 && (
        <div className="mt-1">
          <span className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('samples')}
          </span>
          <ul className="mt-1 space-y-0.5 text-xs font-mono text-text-sub">
            {row.sampleIds.slice(0, 5).map((id) => (
              <li key={id} className="truncate" title={id}>
                {id}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function ClaimsHealthSection() {
  const t = useTranslations('diagnostics.claims');
  const claimsHealthQ = useDiagnosticsClaims();
  const { data, isLoading } = claimsHealthQ;

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!data && claimsHealthQ.isError) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-card">
        <ErrorState {...queryErrorProps(claimsHealthQ)} />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card shadow-card">
        <EmptyState
          icon={Activity}
          title={t('emptyTitle')}
          message={t('emptyMessage')}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {data.map((row) => (
        <HealthCard key={row.name} row={row} />
      ))}
    </div>
  );
}
