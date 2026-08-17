'use client';

// Phase 4.5 — admin audit-log view.
//
// Filter bar: targetType select, user autocomplete, free-text `action`,
// date-range pair. Cursor pagination identical to the claims list (Phase
// 4.1) — we maintain a manual stack of cursors for forward/back navigation.
// Row click opens `<AuditDetailSheet>` (large variant) with side-by-side
// JSON diff between `before` and `after`.

import { ScrollText, SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AUDIT_TARGET_TYPES } from '@magguarantee/shared';
import type {
  AuditFilters,
  AuditLogDto,
  LookupUserAdminDto,
} from '@magguarantee/shared';

import { AuditAvatar } from '@/components/audit/AuditRow';
import { AuditDetailSheet } from '@/components/audit/AuditDetailSheet';
import { UserAutocomplete } from '@/components/audit/UserAutocomplete';
import { Button } from '@/components/ui/Button';
import { CursorPager } from '@/components/ui/CursorPager';
import {
  DataTable,
  type DataTableColumn,
} from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useAudit } from '@/lib/hooks/useAudit';
import { useDebouncedValue } from '@/lib/hooks/useDebouncedValue';
import { formatDateTime } from '@/lib/format/numbers';
import { relativeTimeKey } from '@/lib/format/relative-time';

// Target-type options come from `AUDIT_TARGET_TYPES` in the shared package —
// the same list the backend's `@Audit({ targetType })` tags are drawn from.
// Do NOT re-declare them here: the filter matches `target_type` with exact,
// case-sensitive equality, so a local lowercase copy silently matches nothing.
// Static (not derived from the visible rows) so the dropdown stays stable even
// when the current page is empty.

export function AuditView() {
  const t = useTranslations('audit');
  const tCommon = useTranslations('common');

  const [targetType, setTargetType] = useState<string>('');
  const [actionFilter, setActionFilter] = useState('');
  const [user, setUser] = useState<LookupUserAdminDto | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [cursorStack, setCursorStack] = useState<string[]>([]);

  const debouncedAction = useDebouncedValue(actionFilter, 300);

  // Localized dropdown labels, sorted by the label the admin actually reads.
  // A type without a translation falls back to its raw PascalCase name so a
  // newly tagged entity still shows up (and still filters) before the message
  // files catch up.
  const targetTypeOptions = useMemo(
    () =>
      AUDIT_TARGET_TYPES.map((value) => {
        const key = `targetTypes.${value}`;
        return { value, label: t.has(key) ? t(key) : value };
      }).sort((a, b) => a.label.localeCompare(b.label)),
    [t],
  );

  const filters: Partial<AuditFilters> = useMemo(
    () => ({
      limit: 50,
      targetType: targetType || undefined,
      userId: user?.id,
      action:
        debouncedAction.trim().length >= 2
          ? debouncedAction.trim()
          : undefined,
      from: from || undefined,
      to: to || undefined,
      cursor,
    }),
    [targetType, user, debouncedAction, from, to, cursor],
  );

  const { data, isLoading } = useAudit(filters);

  const hasActiveFilters = Boolean(
    targetType || user || from || to || debouncedAction.trim().length >= 2,
  );

  const resetCursor = () => {
    setCursor(undefined);
    setCursorStack([]);
  };

  const clearFilters = () => {
    setTargetType('');
    setActionFilter('');
    setUser(null);
    setFrom('');
    setTo('');
    resetCursor();
  };

  const nextPage = () => {
    if (!data?.nextCursor) return;
    setCursorStack((s) => [...s, cursor ?? '']);
    setCursor(data.nextCursor);
  };
  const prevPage = () => {
    setCursorStack((s) => {
      if (s.length === 0) return s;
      const next = [...s];
      const prev = next.pop();
      setCursor(prev || undefined);
      return next;
    });
  };

  const [selected, setSelected] = useState<AuditLogDto | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openRow = (r: AuditLogDto) => {
    setSelected(r);
    setSheetOpen(true);
  };

  const columns = useMemo<DataTableColumn<AuditLogDto>[]>(
    () => [
      {
        id: 'createdAt',
        header: t('columns.createdAt'),
        width: 'tight',
        cell: (row) => {
          const { key, vars } = relativeTimeKey(row.createdAt);
          return (
            <span
              className="text-text-sub tabular-nums"
              title={formatDateTime(row.createdAt)}
            >
              <RelativeTimeText keyName={key} vars={vars} />
            </span>
          );
        },
      },
      {
        id: 'actor',
        header: t('columns.actor'),
        width: 'tight',
        cell: (row) => (
          <div className="flex items-center gap-2">
            <AuditAvatar login={row.userLogin} />
            <div className="flex flex-col text-xs">
              <span className="font-mono text-text">
                {row.userLogin ?? '—'}
              </span>
              {row.userName && (
                <span className="text-text-sub truncate max-w-[160px]">
                  {row.userName}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        id: 'action',
        header: t('columns.action'),
        width: 'auto',
        cell: (row) => <span className="font-semibold">{row.action}</span>,
      },
      {
        id: 'target',
        header: t('columns.target'),
        width: 'auto',
        cell: (row) => (
          <span className="font-mono text-xs">
            {row.targetType ?? '—'}
            {row.targetKey ? (
              <span className="text-text-sub"> · {row.targetKey}</span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'reason',
        header: t('columns.reason'),
        width: 'flex',
        className: 'min-w-[200px]',
        truncate: 'ellipsis',
        cell: (row) => row.reason ?? '—',
      },
    ],
    [t],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
      </header>

      <div className="flex flex-wrap gap-3 mb-4 p-3 border border-border bg-input rounded-lg">
        <Select
          className="h-10 sm:max-w-[12rem] flex-1 min-w-[160px]"
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.targetType')}
        >
          <option value="">{t('filters.allTargetTypes')}</option>
          {targetTypeOptions.map((tt) => (
            <option key={tt.value} value={tt.value}>
              {tt.label}
            </option>
          ))}
        </Select>
        <div className="w-full sm:w-auto sm:min-w-[260px] sm:max-w-sm flex-1">
          <UserAutocomplete
            value={user?.id ?? null}
            selectedUser={user}
            onChange={(u) => {
              setUser(u);
              resetCursor();
            }}
            ariaLabel={t('filters.userPlaceholder')}
          />
        </div>
        <Input
          type="search"
          className="h-10 sm:max-w-[14rem] flex-1 min-w-[160px]"
          placeholder={t('filters.actionPlaceholder')}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            resetCursor();
          }}
        />
        <Input
          type="date"
          className="h-10 sm:max-w-[10rem]"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.dateFrom')}
        />
        <Input
          type="date"
          className="h-10 sm:max-w-[10rem]"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            resetCursor();
          }}
          aria-label={t('filters.dateTo')}
        />
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openRow}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={ScrollText}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
        emptyFiltered={
          <EmptyState
            icon={SearchX}
            title={t('emptyFiltered.title')}
            message={t('emptyFiltered.message')}
            action={
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                {tCommon('clearFilters')}
              </Button>
            }
          />
        }
      />

      {(data?.nextCursor || cursorStack.length > 0) && (
        <CursorPager
          onPrev={prevPage}
          onNext={nextPage}
          canPrev={cursorStack.length > 0}
          canNext={Boolean(data?.nextCursor)}
        />
      )}

      <AuditDetailSheet
        open={sheetOpen}
        row={selected}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  );
}

/** Tiny helper component for the createdAt column — calling `useTranslations`
 * inside `useMemo`'s `cell` factory would re-instantiate the hook each
 * render; pulling the call here keeps the cell render lean. */
function RelativeTimeText({
  keyName,
  vars,
}: {
  keyName: ReturnType<typeof relativeTimeKey>['key'];
  vars: { n: number } | undefined;
}) {
  const t = useTranslations();
  return <>{t(keyName, vars)}</>;
}
