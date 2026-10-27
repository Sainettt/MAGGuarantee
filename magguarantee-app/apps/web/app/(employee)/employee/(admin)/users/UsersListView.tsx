'use client';

// Phase 4.4 — admin user-management list view. Mirrors the
// carriers screen layout (server-component page → client list view), with
// three row-actions: Edit / Reset password / Deactivate-reactivate.
// Bulk actions are out of scope.

import {
  Check,
  Copy,
  CornerDownRight,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  SearchX,
  Users as UsersIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ResetPasswordModeDto, Role, UserDtoFull } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ResetPasswordDialog } from '@/components/users/ResetPasswordDialog';
import { formatDateShort } from '@/lib/format/numbers';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import {
  useDeactivateUser,
  useReactivateUser,
  useResetUserPassword,
  useUsers,
} from '@/lib/hooks/useUsers';
import { queryErrorProps } from '@/lib/query/queryErrorProps';
import { roleLabelKey } from '@/lib/roles';
import { overridesMarker } from '@/lib/users/permissionOverrides';

import { UserSheet } from './UserSheet';

// Roles offered in the filter dropdown. Mirrors the schema's RoleSchema but
// keeps przewoznik visible (admins may want to browse carrier-side users
// even though they can't be created here — the list endpoint still returns
// them).
const FILTERABLE_ROLES: Role[] = [
  'admin',
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'eksport',
  'weryfikator',
  'przewoznik',
];

/**
 * Per-role badge variant — keeps the role chip legible against the
 * MAGTRANS palette without inventing a new colour token. Admin gets the
 * brand-red (`danger` palette is the closest existing chip variant);
 * everyone else gets a calm `info` / `muted` tone.
 */
const ROLE_VARIANT: Record<Role, 'danger' | 'info' | 'warning' | 'success' | 'muted'> = {
  admin: 'danger',
  pracownik: 'info',
  opiekun: 'info',
  planista: 'success',
  dyspozytor: 'success',
  eksport: 'warning',
  weryfikator: 'warning',
  przewoznik: 'muted',
};

export function UsersListView() {
  const t = useTranslations('users');
  const tCommon = useTranslations('common');
  const tRoles = useTranslations('roles');
  const tAll = useTranslations();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');
  const [onlyLiders, setOnlyLiders] = useState(false);

  const listQ = useUsers({
    // The UserFiltersSchema doesn't support `q`, so we filter client-side.
    role: (role || undefined) as Role | undefined,
    active:
      activeFilter === '' ? undefined : activeFilter === 'true',
    // Off = no filter at all (`undefined`), never `false` — `?lider=false`
    // would mean "everyone EXCEPT the leaders".
    lider: onlyLiders ? true : undefined,
    limit: 200,
  });
  const { data, isLoading } = listQ;

  // Client-side substring filter — list endpoint doesn't expose `q` per the
  // current schema, but 200 rows is comfortable to filter in-memory.
  const filtered = useMemo(() => {
    const rows = data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (q.length < 2) return rows;
    return rows.filter(
      (u) =>
        u.login.toLowerCase().includes(q) ||
        (u.name ?? '').toLowerCase().includes(q),
    );
  }, [data, search]);

  const hasActiveFilters = Boolean(
    search.trim().length >= 2 || role || activeFilter || onlyLiders,
  );
  const clearFilters = () => {
    setSearch('');
    setRole('');
    setActiveFilter('');
    setOnlyLiders(false);
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<UserDtoFull | null>(null);

  const openCreate = () => {
    setTarget(null);
    setSheetOpen(true);
  };
  const openEdit = useCallback((row: UserDtoFull) => {
    setTarget(row);
    setSheetOpen(true);
  }, []);

  // ── Reset-password — Dialog A (choose generate/custom + confirm) →
  //    mutate → Dialog B (result, shows the temp password once).
  //
  //  `resetTarget` drives Dialog A. `resetInfo` drives Dialog B. Backend
  //  returns the password once; we keep it in component state, never persist.
  const [resetTarget, setResetTarget] = useState<UserDtoFull | null>(null);
  const [resetInfo, setResetInfo] = useState<{
    login: string;
    password: string;
  } | null>(null);

  const resetM = useResetUserPassword({
    onSuccess: (created, { id }) => {
      // Find the row by id to show its login alongside the password.
      const row = (data?.items ?? []).find((u) => u.id === id);
      setResetTarget(null);
      setResetInfo({
        login: row?.login ?? created.login,
        password: created.temporaryPassword,
      });
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const onResetConfirm = useCallback(
    (body: ResetPasswordModeDto) => {
      if (!resetTarget) return;
      resetM.mutate({ id: resetTarget.id, body });
    },
    [resetTarget, resetM],
  );

  // ── Activate / deactivate confirmation
  const [confirmActivate, setConfirmActivate] = useState<{
    user: UserDtoFull;
    nextActive: boolean;
  } | null>(null);

  const deactivateM = useDeactivateUser({
    onSuccess: () => toast.success(t('deactivatedToast')),
    onError: () => toast.error(tCommon('errorGeneric')),
  });
  const reactivateM = useReactivateUser({
    onSuccess: () => toast.success(t('reactivatedToast')),
    onError: () => toast.error(tCommon('errorGeneric')),
  });

  const runActivate = () => {
    if (!confirmActivate) return;
    const { user, nextActive } = confirmActivate;
    const m = nextActive ? reactivateM : deactivateM;
    m.mutate(user.id, {
      onSettled: () => setConfirmActivate(null),
    });
  };

  // Shared copy mechanics (1500ms inline swap + toast.error fallback) — same
  // as <TemporaryPasswordRow> (§9.4 DRY note).
  const { copy: copyPassword, copied: passwordCopied } = useCopyToClipboard();

  const columns = useMemo<DataTableColumn<UserDtoFull>[]>(
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
        width: 'flex',
        className: 'min-w-[200px]',
        cell: (row) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold truncate">{row.name ?? '—'}</span>
            {/* docs/14 §17.7 (optional) — a planista's «Przełożony (lider)»
                as a second line, so the admin sees the hierarchy that decides
                who approves this planista's vehicle transfers. */}
            {row.liderUser ? (
              <span
                className="flex items-center gap-1 truncate text-xs text-text-sub"
                title={t('fields.liderId')}
              >
                <CornerDownRight size={12} aria-hidden className="shrink-0" />
                <span className="sr-only">{t('fields.liderId')}: </span>
                {row.liderUser.name ?? row.liderUser.login}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'email',
        header: t('fields.email'),
        width: 'flex',
        className: 'min-w-[200px]',
        truncate: 'ellipsis',
        cell: (row) => row.email,
      },
      {
        id: 'role',
        header: t('fields.role'),
        width: 'tight',
        cell: (row) => {
          // docs/14 A.11 — «+1 −2» when the account has per-user permission
          // overrides (docs/25 B6), e.g. which carriers see their documents.
          const extraCount = row.extraPermissions?.length ?? 0;
          const deniedCount = row.deniedPermissions?.length ?? 0;
          const marker = overridesMarker(extraCount, deniedCount);
          const markerLabel = marker
            ? t('permissions.listMarkerAria', { extra: extraCount, denied: deniedCount })
            : '';
          return (
            <div className="flex items-center gap-1.5">
              <Badge variant={ROLE_VARIANT[row.role]}>{tRoles(row.role)}</Badge>
              {/* Leader flag over the role (docs/28): the role chip stays the
                  base role — lider is not a role — and a neutral chip marks the
                  flag, its tooltip spelling the full label («Lider planistów»).
                  Not `info`: that is the «ręcznie» chip right next to it. */}
              {row.lider && (
                <span title={tAll(roleLabelKey(row.role, true))}>
                  <Badge variant="muted">{t('fields.lider')}</Badge>
                </span>
              )}
              {/* A hand-granted role is worth flagging: it is the one thing the
                  directory will NOT re-derive, so an admin looking for "why does
                  this person have this role" needs to see it here. */}
              {row.roleOverride !== null && (
                <span title={t('fields.roleOverrideHintShort')}>
                  <Badge variant="info">{t('fields.roleOverrideShort')}</Badge>
                </span>
              )}
              {marker && (
                // The digits are decoration; the sentence is what a screen
                // reader hears (an `aria-label` on a plain <span> is not read).
                <span title={markerLabel}>
                  <Badge variant="muted" className="tabular-nums">
                    <span aria-hidden>{marker}</span>
                    <span className="sr-only">{markerLabel}</span>
                  </Badge>
                </span>
              )}
            </div>
          );
        },
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
        id: 'managedBy',
        header: t('fields.managedBy'),
        width: 'tight',
        cell: (row) =>
          row.managedBy === 'magspace' ? (
            <div className="flex flex-col gap-0.5">
              <Badge variant="info">{t('fields.magspace')}</Badge>
              <span className="text-[11px] text-text-sub tabular-nums">
                {row.directorySyncedAt
                  ? formatDateShort(row.directorySyncedAt)
                  : '—'}
              </span>
            </div>
          ) : (
            <Badge variant="muted">{t('fields.local')}</Badge>
          ),
      },
      {
        id: 'createdAt',
        header: t('fields.createdAt'),
        width: 'tight',
        cell: (row) => (
          <span className="text-text-sub tabular-nums">
            {formatDateShort(row.createdAt)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: <span className="sr-only">{tCommon('actions')}</span>,
        align: 'right',
        width: 'tight',
        cell: (row) => (
          <div className="flex items-center justify-end">
            <RowActionsMenu
              label={`${tCommon('actions')} — ${row.login}`}
              actions={[
                {
                  key: 'edit',
                  label: tCommon('edit'),
                  icon: Pencil,
                  onSelect: () => openEdit(row),
                },
                {
                  key: 'reset',
                  label: t('actions.resetPassword'),
                  icon: KeyRound,
                  onSelect: () => setResetTarget(row),
                },
                {
                  key: 'activate',
                  label: row.active
                    ? t('actions.deactivate')
                    : t('actions.reactivate'),
                  icon: row.active ? PowerOff : Power,
                  destructive: row.active,
                  onSelect: () =>
                    setConfirmActivate({ user: row, nextActive: !row.active }),
                },
              ]}
            />
          </div>
        ),
      },
    ],
    [t, tCommon, tRoles, tAll, openEdit],
  );

  return (
    <section className="px-4 sm:px-6 lg:px-10 xl:px-12 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-text">
          {t('title')}
        </h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={14} />
          {t('newUser')}
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
        <Select
          className="sm:max-w-xs"
          value={role}
          onChange={(e) => setRole(e.target.value as Role | '')}
          aria-label={t('filters.role')}
        >
          <option value="">{t('filters.allRoles')}</option>
          {FILTERABLE_ROLES.map((r) => (
            <option key={r} value={r}>
              {tRoles(r)}
            </option>
          ))}
        </Select>
        <Select
          className="sm:max-w-xs"
          value={activeFilter}
          onChange={(e) =>
            setActiveFilter(e.target.value as '' | 'true' | 'false')
          }
          aria-label={t('filters.activeLabel')}
        >
          <option value="">{t('filters.allActive')}</option>
          <option value="true">{t('filters.onlyActive')}</option>
          <option value="false">{t('filters.onlyInactive')}</option>
        </Select>
        <label className="flex items-center gap-2 text-sm text-text sm:px-1 whitespace-nowrap">
          <Checkbox
            checked={onlyLiders}
            onChange={(e) => setOnlyLiders(e.target.checked)}
          />
          {t('filters.onlyLiders')}
        </label>
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        {...queryErrorProps(listQ)}
        hasActiveFilters={hasActiveFilters}
        empty={
          <EmptyState
            icon={UsersIcon}
            title={t('emptyTitle')}
            message={t('emptyMessage')}
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} />
                {t('newUser')}
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

      <UserSheet
        open={sheetOpen}
        user={target}
        onClose={() => setSheetOpen(false)}
      />

      {/* Dialog A — choose generate/custom + confirm BEFORE mutating. */}
      <ResetPasswordDialog
        user={resetTarget}
        open={resetTarget !== null}
        onOpenChange={(o) => !o && setResetTarget(null)}
        onConfirm={onResetConfirm}
        pending={resetM.isPending}
      />

      {/* Dialog B — result modal. Shows the fresh temp password once, with a
          copy button (shared 1500ms swap + toast.error). Closing wipes it from
          state so it doesn't sit in memory forever. */}
      <Dialog
        open={resetInfo !== null}
        onOpenChange={(o) => !o && setResetInfo(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('resetPassword.title')}</DialogTitle>
            <DialogDescription>
              {t('resetPassword.description')}
            </DialogDescription>
          </DialogHeader>
          {resetInfo && (
            <div className="space-y-3">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm rounded-[10px] bg-info-soft border border-border px-3.5 py-3">
                <span className="text-text-sub">
                  {t('resetPassword.loginLabel')}
                </span>
                <span className="font-mono">{resetInfo.login}</span>
                <span className="text-text-sub">
                  {t('resetPassword.passwordLabel')}
                </span>
                <span className="font-mono break-all">
                  {resetInfo.password}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyPassword(resetInfo.password)}
                aria-label={t('resetPassword.copyAria')}
              >
                {passwordCopied ? (
                  <>
                    <Check size={14} className="text-success" aria-hidden />
                    {tCommon('copied')}
                  </>
                ) : (
                  <>
                    <Copy size={14} aria-hidden />
                    {tCommon('copy')}
                  </>
                )}
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setResetInfo(null)}
            >
              {tCommon('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activate / deactivate confirmation */}
      <Dialog
        open={confirmActivate !== null}
        onOpenChange={(o) => !o && setConfirmActivate(null)}
      >
        <DialogContent>
          {confirmActivate && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmActivate.nextActive
                    ? t('confirmActivate.reactivateTitle')
                    : t('confirmActivate.deactivateTitle')}
                </DialogTitle>
                <DialogDescription>
                  {confirmActivate.nextActive
                    ? t('confirmActivate.reactivateBody', {
                        login: confirmActivate.user.login,
                      })
                    : t('confirmActivate.deactivateBody', {
                        login: confirmActivate.user.login,
                      })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmActivate(null)}
                  disabled={deactivateM.isPending || reactivateM.isPending}
                >
                  {tCommon('cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={runActivate}
                  disabled={deactivateM.isPending || reactivateM.isPending}
                >
                  {confirmActivate.nextActive
                    ? t('actions.reactivate')
                    : t('actions.deactivate')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
