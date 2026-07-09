'use client';

// Admin CRUD — carriers.

import { Building2, Pencil, PlayCircle, Plus, SearchX, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { CarrierDto } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDeleteWithReasonDialog } from '@/components/ui/ConfirmDeleteWithReasonDialog';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { CarrierOnboardingWizard } from '@/components/carrier-onboarding/CarrierOnboardingWizard';
import {
  CarrierOnboardingProvider,
  useCarrierOnboarding,
} from '@/components/carrier-onboarding/useCarrierOnboarding';
import { CarrierDetailModal } from '@/components/carriers/CarrierDetailModal';
import { OnboardingMissingBadge } from '@/components/carriers/OnboardingMissingBadge';
import { useAuth } from '@/lib/hooks/useAuth';
import { useCarriers, useHardDeleteCarrier } from '@/lib/hooks/useCarriers';
import { useOpiekuni } from '@/lib/hooks/useLookups';

import { CarrierFormDialog } from './CarrierFormDialog';

export default function CarriersPage() {
  // The wizard's state lives in a Context so the page, the table cells
  // (Continue setup button), and the wizard itself all share the same store.
  return (
    <CarrierOnboardingProvider>
      <CarriersPageInner />
      <CarrierOnboardingWizard />
    </CarrierOnboardingProvider>
  );
}

function CarriersPageInner() {
  const t = useTranslations('carriers');
  const tWizard = useTranslations();
  const tCommon = useTranslations('common');
  const tConfirm = useTranslations('confirmDelete');
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  // Opiekun's list endpoint is auto-scoped to their own carriers (Phase 5.1
  // backend), so the "filter by opiekun" select is meaningless for them —
  // they would only ever see themselves in the dropdown.
  const isOpiekun = user?.role === 'opiekun';
  // Phase 5.1 — opiekun has CRUD on their own entities (docs/03-roles.md#opiekun),
  // which includes the hard-delete-with-powod button. Backend re-verifies
  // ownership and 403s any foreign id.
  const canHardDelete = isAdmin || isOpiekun;
  const [search, setSearch] = useState('');
  const [opiekunId, setOpiekunId] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  // Onboarding-completeness filter — single boolean (replaces the old
  // enum-backed multi-select). Maps directly to the API's `onboardingComplete`
  // query param (see CarrierFiltersSchema in @magguarantee/shared).
  const [onboardingFilter, setOnboardingFilter] = useState<
    '' | 'true' | 'false'
  >('');

  const { data, isLoading } = useCarriers({
    q: search.length >= 2 ? search : undefined,
    opiekunId: opiekunId || undefined,
    active: activeFilter === '' ? undefined : activeFilter === 'true',
    onboardingComplete:
      onboardingFilter === '' ? undefined : onboardingFilter === 'true',
    limit: 50,
  });

  const opiekuniQ = useOpiekuni();

  const wizard = useCarrierOnboarding();

  // Edit-mode sheet stays separate from the wizard — they have different
  // success semantics (edit toasts + closes; wizard chains forward).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<CarrierDto | null>(null);

  // Phase 6 — read-only detail modal. A plain row click opens this; its
  // «Edytuj» action closes it and opens the edit Sheet (docs/14 §6.11). It
  // mirrors the sheetOpen/target pair and is never open at the same time as
  // the Sheet (the modal closes before the Sheet opens).
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<CarrierDto | null>(null);

  // Phase 4.4 — hard-delete dialog. The action button is gated to admin in
  // the column renderer below; we still set up the target/open state at the
  // page level so the same dialog handles every row.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CarrierDto | null>(null);
  const hardDeleteM = useHardDeleteCarrier();

  const openCreate = () => {
    // The "+ Add carrier" button opens the wizard, NOT the standalone create
    // sheet — the wizard guides the operator through vehicle/trailer/driver
    // right after. The wizard's CarrierFormDialog handles step 1 internally.
    wizard.start();
  };
  const openEdit = (row: CarrierDto) => {
    setTarget(row);
    setSheetOpen(true);
  };
  // A plain row click opens the read-only detail modal (not the edit Sheet);
  // the action-column pencil button still jumps straight to edit.
  const openDetail = (row: CarrierDto) => {
    setDetailTarget(row);
    setDetailOpen(true);
  };
  // Detail modal «Edytuj» — the modal has already closed itself; open the
  // existing edit Sheet for the same carrier.
  const editFromDetail = () => {
    if (detailTarget) openEdit(detailTarget);
  };
  // Memoised so the `columns` useMemo can list it as a dep without churning
  // on every render. The wizard methods are themselves stable.
  const resumeOnboarding = useCallback(
    (row: CarrierDto) => {
      // Mirror the create-flow label format (`login — name`) so steps 2..4
      // can render it without depending on the carriers list query.
      const carrierLabel = row.login + (row.name ? ` — ${row.name}` : '');
      wizard.resume({
        carrierId: row.id,
        carrierLabel,
        onboarding: row.onboarding,
      });
    },
    [wizard],
  );

  const openHardDelete = useCallback((row: CarrierDto) => {
    setDeleteTarget(row);
    setDeleteOpen(true);
  }, []);

  const hasActiveFilters = Boolean(
    search.length >= 2 || opiekunId || activeFilter || onboardingFilter,
  );
  const clearFilters = () => {
    setSearch('');
    setOpiekunId('');
    setActiveFilter('');
    setOnboardingFilter('');
  };

  const columns = useMemo<DataTableColumn<CarrierDto>[]>(
    () => [
      {
        id: 'login',
        header: t('fields.login'),
        width: 'tight',
        cell: (row) => <span className="font-mono">{row.login}</span>,
      },
      {
        id: 'name',
        header: t('fields.name'),
        // Flex column — name + missing-onboarding chips stack vertically
        // (chips wrap below the name) so the row breathes when up to 3 chips
        // are present. min-w-[200px] keeps short names readable.
        width: 'flex',
        className: 'min-w-[200px]',
        cell: (row) => (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-semibold truncate">{row.name ?? '—'}</span>
            <OnboardingMissingBadge onboarding={row.onboarding} />
          </div>
        ),
      },
      {
        id: 'company',
        header: t('fields.company'),
        // Polish business names can be 60+ chars — clamp to 2 lines, expose
        // the full string on hover via the native `title` attribute.
        width: 'flex',
        className: 'min-w-[220px]',
        cell: (row) => (
          <span
            className="line-clamp-2 break-words"
            title={row.company ?? undefined}
          >
            {row.company ?? '—'}
          </span>
        ),
      },
      {
        id: 'nip',
        header: t('fields.nip'),
        width: 'tight',
        cell: (row) => (
          <span className="font-mono tabular-nums">{row.nip ?? '—'}</span>
        ),
      },
      {
        id: 'opiekun',
        header: t('fields.opiekun'),
        width: 'tight',
        truncate: 'ellipsis',
        className: 'max-w-[18ch]',
        cell: (row) => row.opiekun?.name ?? row.opiekun?.login ?? '—',
      },
      {
        id: 'active',
        header: t('fields.active'),
        width: 'tight',
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
          const actions: RowAction[] = [];
          if (!row.onboarding.isComplete) {
            actions.push({
              key: 'resume',
              label: tWizard('onboardingStatus.resumeAction'),
              icon: PlayCircle,
              onSelect: () => resumeOnboarding(row),
            });
          }
          actions.push({
            key: 'edit',
            label: tCommon('edit'),
            icon: Pencil,
            onSelect: () => openEdit(row),
          });
          if (canHardDelete) {
            actions.push({
              key: 'delete',
              label: tConfirm('confirm'),
              icon: Trash2,
              destructive: true,
              onSelect: () => openHardDelete(row),
            });
          }
          return (
            <div className="flex items-center justify-end">
              <RowActionsMenu
                label={`${tCommon('actions')} — ${row.login}`}
                actions={actions}
              />
            </div>
          );
        },
      },
    ],
    [t, tCommon, tConfirm, tWizard, resumeOnboarding, canHardDelete, openHardDelete],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newCarrier')}
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
        {!isOpiekun && (
          <Select
            className="sm:max-w-xs"
            value={opiekunId}
            onChange={(e) => setOpiekunId(e.target.value)}
          >
            <option value="">{t('filters.allOpiekun')}</option>
            {(opiekuniQ.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.login}
              </option>
            ))}
          </Select>
        )}
        <Select
          className="sm:max-w-xs"
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as '' | 'true' | 'false')
          }
        >
          <option value="">{t('filters.allActive')}</option>
          <option value="true">{t('filters.onlyActive')}</option>
          <option value="false">{t('filters.onlyInactive')}</option>
        </Select>
        <Select
          className="sm:max-w-xs"
          value={onboardingFilter}
          onChange={(e) =>
            setOnboardingFilter(e.target.value as '' | 'true' | 'false')
          }
          aria-label={t('filters.onboardingLabel')}
        >
          <option value="">{t('filters.allOnboarding')}</option>
          <option value="false">{t('filters.onlyIncomplete')}</option>
          <option value="true">{t('filters.onlyCompleteOnboarding')}</option>
        </Select>
      </div>

      <DataTable
        rows={data?.items ?? []}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openDetail}
        isLoading={isLoading}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={Building2}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} />
                {t('newCarrier')}
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

      <CarrierDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        carrier={detailTarget}
        onEdit={editFromDetail}
      />

      <CarrierFormDialog
        open={sheetOpen}
        carrier={target}
        onClose={() => setSheetOpen(false)}
      />

      <ConfirmDeleteWithReasonDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entityLabel={tConfirm('entityLabel.carrier')}
        entityName={
          deleteTarget
            ? `${deleteTarget.login}${deleteTarget.name ? ` — ${deleteTarget.name}` : ''}`
            : ''
        }
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
            toast.error(tConfirm('errorToast'));
            throw err;
          }
        }}
      />
    </section>
  );
}
