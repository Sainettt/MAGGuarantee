// «Tydz. 23 · 03.06–07.06» — the label of one ISO week of a claim (docs/14
// §18.7.1, §18.8). Shared by `<BreakdownTable>` (wide rows and collapsed rows)
// and `<RecalcLimitsDialog>` (changed weeks), so a week reads the same
// everywhere.
//
// The visible range is CLIPPED to the claim period: the first and last week
// show only their own days, because a carrier thinks in departure dates. So
// that «03.06–07.06» is not read as a whole week, the full Monday–Sunday range
// is in the native `title` and — only when the week is actually clipped — in an
// sr-only suffix (`common.isoWeek.fullWeekTitle`). A week whose part of the
// period is one day is labelled with that day alone (`withDay`), never
// «31.05–31.05». A date outside the week's ISO year carries its year (W01 /
// W53). Dates are parsed as local calendar days (`lib/format/weekLabel`).

import { useLocale, useTranslations } from 'next-intl';

import { isoWeekLabelParts } from '@/lib/format/weekLabel';
import { cn } from '@/lib/utils';

export interface IsoWeekLabelProps {
  /** `YYYY-Www`. */
  isoWeek: string;
  /** First day of the week inside the claim period, `YYYY-MM-DD`. */
  periodStart: string;
  /** Last day of the week inside the claim period, `YYYY-MM-DD`. */
  periodEnd: string;
  className?: string;
}

export default function IsoWeekLabel({
  isoWeek,
  periodStart,
  periodEnd,
  className,
}: IsoWeekLabelProps) {
  const t = useTranslations('common.isoWeek');
  const locale = useLocale();
  const parts = isoWeekLabelParts({ isoWeek, periodStart, periodEnd }, locale);

  // Defensive: a key that is not `YYYY-Www` is shown as it came.
  if (!parts) {
    return <span className={cn('whitespace-nowrap', className)}>{isoWeek}</span>;
  }

  const label = parts.singleDay
    ? t('withDay', { week: parts.week, day: parts.from })
    : t('withRange', { week: parts.week, from: parts.from, to: parts.to });
  const fullWeek = t('fullWeekTitle', { from: parts.fullFrom, to: parts.fullTo });

  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)} title={fullWeek}>
      {label}
      {parts.clipped && <span className="sr-only">, {fullWeek}</span>}
    </span>
  );
}
