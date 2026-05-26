'use client';

// Phase 4.3 — main-area charts for the employee dashboard.
//
// Two charts side-by-side on lg+, stacked on smaller widths:
//   - Bar: monthly series (count + sumEur) for the last 12 months.
//   - Pie: status distribution from the KPI bucket counts.
//
// Recharts is the chosen dep (stack rule). We use CSS variables resolved at
// runtime so dark mode picks up the right tones without re-painting on
// theme toggle (the stroke/fill colors come from CSS tokens via `currentColor`
// where possible, and from the brand palette otherwise).

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardDto, DashboardMonthlyPoint } from '@magguarantee/shared';

import { formatEur } from '@/lib/format/numbers';

interface DashboardChartsProps {
  monthlySeries: DashboardMonthlyPoint[];
  kpi: DashboardDto['kpi'];
}

// Brand-aligned palette using existing tokens. Recharts wants colour strings
// (hex / rgb / CSS var), so we read computed `--color-*` values at render
// time. Keeping the var names in one place makes a future palette swap a
// no-op for the charts.
const COLORS = {
  // bar
  count: 'var(--color-info)',
  sumEur: 'var(--color-brand)',
  // pie
  naWeryfikacji: 'var(--color-info)',
  zaakceptowano: 'var(--color-success)',
  odrzucono: 'var(--color-danger)',
  oczekujeNaAutoryzacje: 'var(--color-warning)',
  grid: 'var(--color-border)',
  tickFill: 'var(--color-text-sub)',
};

export function DashboardCharts({
  monthlySeries,
  kpi,
}: DashboardChartsProps) {
  const t = useTranslations('dashboard.charts');

  const pieData = [
    {
      name: t('naWeryfikacji'),
      value: kpi.naWeryfikacji,
      fill: COLORS.naWeryfikacji,
    },
    {
      name: t('zaakceptowano'),
      value: kpi.zaakceptowano,
      fill: COLORS.zaakceptowano,
    },
    { name: t('odrzucono'), value: kpi.odrzucono, fill: COLORS.odrzucono },
    {
      name: t('oczekujeNaAutoryzacje'),
      value: kpi.oczekujeNaAutoryzacje,
      fill: COLORS.oczekujeNaAutoryzacje,
    },
  ].filter((d) => d.value > 0);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-4">
      <section className="rounded-xl border border-border bg-card shadow-card p-4">
        <header className="mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('monthlyTitle')}
          </h2>
        </header>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={monthlySeries}
              margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
            >
              <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" />
              <XAxis
                dataKey="yearMonth"
                tick={{ fill: COLORS.tickFill, fontSize: 11 }}
                stroke={COLORS.grid}
              />
              <YAxis
                yAxisId="count"
                orientation="left"
                tick={{ fill: COLORS.tickFill, fontSize: 11 }}
                stroke={COLORS.grid}
                allowDecimals={false}
              />
              <YAxis
                yAxisId="eur"
                orientation="right"
                tick={{ fill: COLORS.tickFill, fontSize: 11 }}
                stroke={COLORS.grid}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  color: 'var(--color-text)',
                  fontSize: 12,
                }}
                formatter={(value: number, name: string) =>
                  name === t('sumEur')
                    ? [formatEur(value), name]
                    : [value, name]
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="count"
                dataKey="count"
                name={t('count')}
                fill={COLORS.count}
                radius={[4, 4, 0, 0]}
              />
              <Bar
                yAxisId="eur"
                dataKey="sumEur"
                name={t('sumEur')}
                fill={COLORS.sumEur}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card shadow-card p-4">
        <header className="mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-sub">
            {t('statusTitle')}
          </h2>
        </header>
        <div className="h-72">
          {pieData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-sub">
              {t('statusEmpty')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="50%"
                  outerRadius="80%"
                  paddingAngle={2}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    color: 'var(--color-text)',
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </div>
  );
}
