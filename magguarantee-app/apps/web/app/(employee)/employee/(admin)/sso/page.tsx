'use client';

// Admin screen for the Google SSO (docs/24 §A5).
//
// Two sections, because an admin arriving here has one of two questions:
//
//   1. **"Which positions get which role?"** — the mapping table. Every
//      stanowisko MAGSpace publishes, each with a role select or "no access".
//   2. **"Who is waiting for me?"** — recent refused sign-ins. Four positions
//      (HANDEL_*, CONTROLLING) are deliberately left unmapped because the
//      people holding them need different roles; those employees are approved
//      one at a time right from this list («Nadaj dostęp», one step — see
//      GrantAccessDialog), which is also how an admin sees them without
//      relying on the notification e-mail arriving.
//
// The table degrades rather than fails when MAGSpace is unreachable: saved rows
// are still shown, with a banner saying the list may be incomplete. Hiding the
// current mapping during an outage would be exactly backwards.

import { AlertTriangle, KeyRound, ShieldQuestion, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AssignableRole,
  type SsoAccessDenialDto,
  type StanowiskoRoleDto,
} from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { formatDateTime } from '@/lib/format/numbers';
import {
  useDeleteStanowiskoRole,
  useSetStanowiskoRole,
  useSsoAccessDenials,
  useStanowiskoRoles,
} from '@/lib/hooks/useSso';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { SUPPRESS_GLOBAL_ERROR } from '@/lib/query/globalErrors';

import { GrantAccessDialog } from './GrantAccessDialog';

/** Sentinel for the "no access" option — an empty <option> value. */
const NO_ROLE = '';

export default function SsoPage() {
  const t = useTranslations('sso');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');

  const listQ = useStanowiskoRoles();
  const { data, isLoading } = listQ;
  const { data: denials } = useSsoAccessDenials();
  const setM = useSetStanowiskoRole({ meta: SUPPRESS_GLOBAL_ERROR });
  const deleteM = useDeleteStanowiskoRole({ meta: SUPPRESS_GLOBAL_ERROR });
  const [grantTarget, setGrantTarget] = useState<SsoAccessDenialDto | null>(
    null,
  );

  const busy = setM.isPending || deleteM.isPending;

  // Memoised so it does not re-create the column definitions on every render.
  const onRoleChange = useCallback(
    async (row: StanowiskoRoleDto, value: string) => {
      try {
        if (value === NO_ROLE) {
          // Clearing the select removes the mapping entirely — "no access".
          await deleteM.mutateAsync(row.code);
        } else {
          await setM.mutateAsync({
            code: row.code,
            role: value as StanowiskoRoleDto['role'] & string,
          });
        }
        toast.success(tCommon('saved'));
      } catch {
        toast.error(tCommon('errorGeneric'));
      }
    },
    [deleteM, setM, tCommon],
  );

  const columns = useMemo<DataTableColumn<StanowiskoRoleDto>[]>(
    () => [
      {
        id: 'name',
        header: t('fields.stanowisko'),
        width: 'flex',
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold">{row.name}</span>
            <span className="font-mono text-xs text-text-sub">{row.code}</span>
          </div>
        ),
      },
      {
        id: 'role',
        header: t('fields.role'),
        width: 260,
        cell: (row) => (
          <Select
            aria-label={t('fields.role')}
            value={row.role ?? NO_ROLE}
            disabled={busy}
            // The row itself is not clickable on this page — stop the change
            // from bubbling into any future row handler.
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => void onRoleChange(row, e.target.value)}
          >
            <option value={NO_ROLE}>{t('noAccess')}</option>
            {AssignableRole.options.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </Select>
        ),
      },
      {
        id: 'state',
        header: t('fields.state'),
        width: 'tight',
        cell: (row) =>
          !row.knownToMagspace ? (
            <Badge variant="warning">{t('unknownToMagspace')}</Badge>
          ) : row.role ? (
            <Badge variant="success">{t('mapped')}</Badge>
          ) : (
            <Badge variant="muted">{t('unmapped')}</Badge>
          ),
      },
      {
        id: 'updatedAt',
        header: t('fields.updatedAt'),
        width: 'tight',
        cell: (row) => (
          <span className="text-text-sub tabular-nums">
            {row.updatedAt ? formatDateTime(row.updatedAt) : '—'}
          </span>
        ),
      },
    ],
    [t, tRoles, busy, onRoleChange],
  );

  const denialRows = denials?.items ?? [];

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="mt-1 text-[13px] text-text-sub max-w-2xl">
            {t('subtitle')}
          </p>
        </div>
        {data && (
          <div className="text-right text-[13px] text-text-sub">
            <div className="flex items-center gap-2 sm:justify-end">
              <span
                aria-hidden
                className={
                  'inline-block h-2 w-2 rounded-full ' +
                  (data.magspaceOk ? 'bg-success' : 'bg-danger')
                }
              />
              {data.magspaceOk ? t('magspaceOk') : t('magspaceDown')}
            </div>
            <div className="tabular-nums">
              {data.lastReconcileAt
                ? t('lastSync', { at: formatDateTime(data.lastReconcileAt) })
                : t('neverSynced')}
            </div>
          </div>
        )}
      </div>

      {data && !data.magspaceOk && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-[13px] text-text">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{t('magspaceDownHint')}</p>
        </div>
      )}

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.code}
        isLoading={isLoading}
        {...queryErrorProps(listQ)}
        empty={
          <EmptyState
            icon={KeyRound}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
          />
        }
      />

      <section className="mt-10">
        <h2 className="text-lg font-extrabold tracking-tight text-text">
          {t('denials.title')}
        </h2>
        <p className="mt-1 mb-4 text-[13px] text-text-sub max-w-2xl">
          {t('denials.subtitle')}
        </p>

        {denialRows.length === 0 ? (
          <EmptyState
            icon={ShieldQuestion}
            title={t('denials.emptyTitle')}
            message={t('denials.emptyMessage')}
          />
        ) : (
          <ul className="rounded-xl border border-border bg-card shadow-card divide-y divide-border">
            {denialRows.map((d) => (
              // One row per person — the api collapses repeated refusals of
              // the same address into the latest one.
              <li
                key={d.email}
                className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-text">{d.email}</span>
                <span className="font-mono text-xs text-text-sub">
                  {d.stanowiskoCode ?? t('denials.noStanowisko')}
                </span>
                <span className="sm:ml-auto text-xs text-text-sub tabular-nums">
                  {formatDateTime(d.at)}
                </span>
                {d.status === 'granted' ? (
                  <Badge variant="success">{t('denials.granted')}</Badge>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setGrantTarget(d)}
                  >
                    <UserPlus size={14} aria-hidden />
                    {t('denials.grant')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <GrantAccessDialog
        target={grantTarget}
        onClose={() => setGrantTarget(null)}
      />
    </section>
  );
}
