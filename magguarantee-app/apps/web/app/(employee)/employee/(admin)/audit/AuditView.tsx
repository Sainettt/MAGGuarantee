'use client';

// Phase 4.5 — admin audit-log view.
//
// Filter bar: targetType select, user autocomplete, free-text `action`,
// date-range pair. Cursor pagination identical to the claims list (Phase
// 4.1) — we maintain a manual stack of cursors for forward/back navigation.
// Row click opens `<AuditDetailSheet>` (large variant) with side-by-side
// JSON diff between `before` and `after`.

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import type {
  AuditFilters,
  AuditLogDto,
  LookupUserAdminDto,
} from '@magguarantee/shared';

import { AuditAvatar } from '@/components/audit/AuditRow';
import { AuditDetailSheet } from '@/components/audit/AuditDetailSheet';
import { UserAutocomplete } from '@/components/audit/UserAutocomplete';
import { Button } from '@/components/ui/Button';
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

// Known target types — surfaced by Phase 4.5 backend tagging conventions.
// Keep as a static list so the dropdown is stable even when the table is
// empty (an autocomplete-style dropdown for target types would be overkill).
const TARGET_TYPES = [
  'claim',
  'user',
  'carrier',
  'vehicle',
  'driver',
  'trailer',
  'trailerType',
  'delegation',
  'limits',
  'diagnostics',
  'auth',
] as const;

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

  const resetCursor = () => {
    setCursor(undefined);
    setCursorStack([]);
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
          {TARGET_TYPES.map((tt) => (
            <option key={tt} value={tt}>
              {tt}
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
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        }
      />

      {(data?.nextCursor || cursorStack.length > 0) && (
        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={prevPage}
            disabled={cursorStack.length === 0}
          >
            ←
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={nextPage}
            disabled={!data?.nextCursor}
          >
            →
          </Button>
        </div>
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
