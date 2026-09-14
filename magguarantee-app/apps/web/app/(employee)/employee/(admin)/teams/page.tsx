'use client';

// Phase 11 — Admin CRUD «Zespoły prowadzące» (dispatch teams). A numbered team
// (code `1.1.13`) that vehicles are assigned to; every dispatcher in the team
// sees the vehicle. Admin-only (lives under the `(admin)` route group) — an
// explicit replacement for the external "raport DAF" Excel.
//
// `Team` uses an `active` flag (NOT a soft-delete). Hard-delete is guarded
// server-side (409 if referenced by users/vehicles) — deactivate via the
// `active=false` toggle instead. The row's member roster renders via the
// shared <TeamMembers showCode={false}> (the row already prints the code, so
// the chip is deduped — docs/14 §7.9.6).

import {
  CheckCircle2,
  Pencil,
  Plus,
  SearchX,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { TeamDto } from '@magguarantee/shared';

import { TeamMembers } from '@/components/teams/TeamMembers';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import {
  useDeactivateTeam,
  useHardDeleteTeam,
  useReactivateTeam,
  useTeams,
} from '@/lib/hooks/useTeams';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { SUPPRESS_GLOBAL_ERROR } from '@/lib/query/globalErrors';

import { TeamSheet } from './TeamSheet';

export default function TeamsPage() {
  const t = useTranslations('teams');
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const [search, setSearch] = useState('');

  const listQ = useTeams({
    q: search.length >= 2 ? search : undefined,
  });
  const { data, isLoading } = listQ;

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<TeamDto | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamDto | null>(null);
  const hardDeleteM = useHardDeleteTeam({ meta: SUPPRESS_GLOBAL_ERROR });

  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<TeamDto | null>(null);
  const deactivateM = useDeactivateTeam({ meta: SUPPRESS_GLOBAL_ERROR });
  const reactivateM = useReactivateTeam({ meta: SUPPRESS_GLOBAL_ERROR });

  const hasActiveFilters = search.length >= 2;
  const clearFilters = () => setSearch('');

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = (row: TeamDto) => {
    setTarget(row);
    setSheetOpen(true);
  };
  const openHardDelete = useCallback((row: TeamDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);
  const openToggle = useCallback((row: TeamDto) => {
    setToggleTarget(row);
    setToggleOpen(true);
  }, []);

  const columns = useMemo<DataTableColumn<TeamDto>[]>(
    () => [
      {
        id: 'code',
        header: t('fields.code'),
        cell: (row) => (
          <span className="font-mono font-semibold tabular-nums">
            {row.code}
          </span>
        ),
      },
      {
        id: 'name',
        header: t('fields.name'),
        cell: (row) =>
          row.name ? (
            <span className="text-text">{row.name}</span>
          ) : (
            <span className="text-text-sub">—</span>
          ),
      },
      {
        id: 'dispatchers',
        header: t('fields.dispatchers'),
        // The row already prints the code → suppress the chip (showCode=false),
        // but the name + member roster still render (docs/14 §7.9.6).
        cell: (row) => (
          <TeamMembers
            team={row}
            variant="list"
            size="md"
            showCode={false}
          />
        ),
      },
      {
        id: 'vehicleCount',
        header: t('fields.vehicleCount'),
        align: 'right',
        cell: (row) => (
          <span className="tabular-nums">{row.vehicleCount}</span>
        ),
      },
      {
        id: 'active',
        header: t('fields.active'),
        cell: (row) =>
          row.active ? (
            <Badge variant="success">{tCommon('active')}</Badge>
          ) : (
            <Badge variant="muted">{tCommon('inactive')}</Badge>
          ),
      },
      {
        id: 'actions',
        header: <span className="sr-only">{tCommon('actions')}</span>,
        align: 'right',
        width: 'tight',
        cell: (row) => {
          const actions: RowAction[] = [
            {
              key: 'edit',
              label: tCommon('edit'),
              icon: Pencil,
              onSelect: () => openEdit(row),
            },
            row.active
              ? {
                  key: 'deactivate',
                  label: t('actions.deactivate'),
                  icon: XCircle,
                  destructive: true,
                  onSelect: () => openToggle(row),
                }
              : {
                  key: 'reactivate',
                  label: t('actions.reactivate'),
                  icon: CheckCircle2,
                  onSelect: () => openToggle(row),
                },
            {
              key: 'delete',
              label: tConfirm('confirm'),
              icon: Trash2,
              destructive: true,
              onSelect: () => openHardDelete(row),
            },
          ];
          return (
            <div className="flex items-center justify-end">
              <RowActionsMenu
                label={`${tCommon('actions')} — ${row.code}`}
                actions={actions}
              />
            </div>
          );
        },
      },
    ],
    [t, tCommon, tConfirm, openHardDelete, openToggle],
  );

  const isToggleActive = toggleTarget?.active === true;

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-text">
            {t('title')}
          </h1>
          <p className="mt-1 text-sm text-text-sub">{t('subtitle')}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newTeam')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="search"
          className="sm:max-w-xs"
          placeholder={t('filters.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <DataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        {...queryErrorProps(listQ)}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={Users}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} />
                {t('newTeam')}
              </Button>
            }
          />
        }
        emptyFiltered={
          <EmptyState
            icon={SearchX}
            title={t('emptyFiltered.title')}
            message={t('emptyFiltered.message')}
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clearFilters}
              >
                {tCommon('clearFilters')}
              </Button>
            }
          />
        }
      />

      <TeamSheet
        open={sheetOpen}
        team={target}
        onClose={() => setSheetOpen(false)}
      />

      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        title={
          isToggleActive
            ? t('confirmToggle.deactivateTitle')
            : t('confirmToggle.reactivateTitle')
        }
        body={
          isToggleActive
            ? t('confirmToggle.deactivateBody', { code: toggleTarget?.code ?? '' })
            : t('confirmToggle.reactivateBody', { code: toggleTarget?.code ?? '' })
        }
        confirmLabel={
          isToggleActive
            ? t('actions.deactivate')
            : t('actions.reactivate')
        }
        cancelLabel={tCommon('cancel')}
        onConfirm={async () => {
          if (!toggleTarget) return;
          try {
            if (isToggleActive) {
              await deactivateM.mutateAsync(toggleTarget.id);
            } else {
              await reactivateM.mutateAsync(toggleTarget.id);
            }
            toast.success(tCommon('saved'));
          } catch (err) {
            toast.error(tCommon('errorGeneric'));
            throw err;
          }
        }}
      />

      <ConfirmDeleteWithReasonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityLabel={tConfirm('entityLabel.team')}
        entityName={deleteTarget?.code ?? ''}
        isLoading={hardDeleteM.isPending}
        onConfirm={async (reason) => {
          if (!deleteTarget) return;
          try {
            await hardDeleteM.mutateAsync({
              id: deleteTarget.id,
              body: { reason },
            });
            toast.success(tConfirm('deletedToast'));
          } catch (err) {
            // The API 409s when the team is still referenced by users/vehicles
            // — surface the guard message so the admin knows to reassign first.
            toast.error(tConfirm('errorToast'));
            throw err;
          }
        }}
      />
    </section>
  );
}
