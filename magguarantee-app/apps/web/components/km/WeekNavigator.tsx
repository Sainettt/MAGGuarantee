'use client';

// <WeekNavigator> — prev / next / current-week controls + a week-picker popover
// (docs/14-design-system.md §7.7.5). The week param is the URL source of truth
// (`?week=YYYY-Www`); this component is controlled by the Monday `YYYY-MM-DD`
// and reports the new Monday back via `onChange`. The picker is a native
// `<input type="date">` inside the existing hand-rolled <Popover> — selecting
// any day snaps to that day's ISO-week Monday (no bespoke calendar built).

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/Popover';
import {
  addDays,
  addWeeks,
  formatDayMonth,
  isoWeekLabel,
  mondayOf,
  todayIso,
} from '@/lib/format/week';

interface WeekNavigatorProps {
  /** Monday `YYYY-MM-DD` of the visible week. */
  weekStart: string;
  /** Reports a new Monday `YYYY-MM-DD`. */
  onChange: (mondayIso: string) => void;
}

export function WeekNavigator({ weekStart, onChange }: WeekNavigatorProps) {
  const t = useTranslations('weryfikator.km.nav');
  const [pickerOpen, setPickerOpen] = useState(false);

  const currentMonday = mondayOf(todayIso());
  const isCurrentWeek = weekStart === currentMonday;
  const weekEnd = addDays(weekStart, 6);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t('prev')}
        onClick={() => onChange(addWeeks(weekStart, -1))}
      >
        <ChevronLeft size={16} aria-hidden="true" />
      </Button>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverAnchor>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="rounded-md px-2 py-1 text-sm font-semibold tabular-nums text-text hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {t('weekLabel', {
              week: isoWeekLabel(weekStart),
              from: formatDayMonth(weekStart),
              to: formatDayMonth(weekEnd),
            })}
          </button>
        </PopoverAnchor>
        <PopoverContent className="w-56 p-3">
          <p className="mb-1.5 text-xs font-semibold text-text-sub">
            {t('pickWeek')}
          </p>
          <Input
            type="date"
            value={weekStart}
            onChange={(e) => {
              if (!e.target.value) return;
              onChange(mondayOf(e.target.value));
              setPickerOpen(false);
            }}
            className="h-9"
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={t('next')}
        onClick={() => onChange(addWeeks(weekStart, 1))}
      >
        <ChevronRight size={16} aria-hidden="true" />
      </Button>

      {!isCurrentWeek ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange(currentMonday)}
        >
          {t('current')}
        </Button>
      ) : null}
    </div>
  );
}
