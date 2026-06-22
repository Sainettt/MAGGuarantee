'use client';

// Phase 7 — shared filter strip for the eksport / weryfikator delegation
// boards (docs/14-design-system.md §7, Phase 6.3 read-only panel pattern).
//
// Two controls, both lifted to the parent:
//   • status   — <Select> over the four DelegationStatus values + "all",
//   • history  — a checkbox that drives `includeHistory`. Off (default) the
//                board shows only the ACTIVE statuses (zgloszony + w_trasie);
//                on, the API widens to all statuses incl. zjechal/anulowany.
//
// An explicit `status` filter still narrows on top of the toggle (server
// honours the explicit status regardless of `includeHistory`).

import { useTranslations } from 'next-intl';
import type { DelegationStatus } from '@magguarantee/shared';

import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';

// §7.10.1 — 5-status lifecycle; `gotowy` slots between `zgloszony` and
// `w_trasie` in the status filter.
const STATUSES: readonly DelegationStatus[] = [
  'zgloszony',
  'gotowy',
  'w_trasie',
  'zjechal',
  'anulowany',
];

interface Props {
  /** i18n namespace exposing `filters.*` (e.g. `eksport.delegations`). */
  namespace: string;
  status: DelegationStatus | '';
  onStatusChange: (status: DelegationStatus | '') => void;
  includeHistory: boolean;
  onIncludeHistoryChange: (next: boolean) => void;
}

export function DelegationsBoardFilters({
  namespace,
  status,
  onStatusChange,
  includeHistory,
  onIncludeHistoryChange,
}: Props) {
  const t = useTranslations(`${namespace}.filters`);
  const tStatus = useTranslations('carrier.delegations.status');

  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 p-3 border border-border bg-input rounded-lg">
      <Select
        className="h-10 sm:max-w-[12rem] flex-1 min-w-[160px]"
        value={status}
        onChange={(e) => onStatusChange(e.target.value as DelegationStatus | '')}
        aria-label={t('status')}
      >
        <option value="">{t('allStatuses')}</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {tStatus(s)}
          </option>
        ))}
      </Select>

      <label className="flex items-center gap-2 text-sm text-text cursor-pointer select-none">
        <Checkbox
          checked={includeHistory}
          onChange={(e) => onIncludeHistoryChange(e.target.checked)}
        />
        {t('includeHistory')}
      </label>
    </div>
  );
}
