'use client';

// Phase 4.4 — admin user-management list view. Mirrors the
// CarriersPage layout (server-component page → client list view), with
// three row-actions: Edit / Reset password / Deactivate-reactivate.
// Bulk actions are out of scope.

import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Role, UserDtoFull } from '@magguarantee/shared';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable';
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
import { formatDateShort } from '@/lib/format/numbers';
import {
  useDeactivateUser,
  useReactivateUser,
  useResetUserPassword,
  useUsers,
} from '@/lib/hooks/useUsers';

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

  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [activeFilter, setActiveFilter] = useState<'' | 'true' | 'false'>('');

  const { data, isLoading } = useUsers({
    // The UserFiltersSchema doesn't support `q`, so we filter client-side.
    role: (role || undefined) as Role | undefined,
    active:
      activeFilter === '' ? undefined : activeFilter === 'true',
    limit: 200,
  });

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

  // ── Reset-password modal — shows the freshly generated temp password
  //    with a copy-to-clipboard button. Backend returns the password once;
  //    we keep it in component state, never persist it.
  const [resetInfo, setResetInfo] = useState<{
    login: string;
    password: string;
  } | null>(null);

  const resetM = useResetUserPassword({
    onSuccess: (created, userId) => {
      // We need to find the row by id to show its login alongside the password.
      const row = (data?.items ?? []).find((u) => u.id === userId);
      setResetInfo({
        login: row?.login ?? '',
        password: created.temporaryPassword,
      });
    },
    onError: () => toast.error(tCommon('errorGeneric')),
  });

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

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(tCommon('copied'));
    } catch {
      // Older browsers / non-secure contexts — fall back to a no-op + toast.
      toast.error(tCommon('errorGeneric'));
    }
  };

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
          <span className="font-semibold truncate">{row.name ?? '—'}</span>
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
        cell: (row) => (
          <Badge variant={ROLE_VARIANT[row.role]}>
            {tRoles(row.role)}
          </Badge>
        ),
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
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(row);
              }}
              aria-label={`${tCommon('edit')} ${row.login}`}
            >
              <Pencil size={14} aria-hidden="true" />
              <span className="hidden lg:inline">{tCommon('edit')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={resetM.isPending}
              onClick={(e) => {
                e.stopPropagation();
                resetM.mutate(row.id);
              }}
              aria-label={`${t('actions.resetPassword')} ${row.login}`}
            >
              <KeyRound size={14} aria-hidden="true" />
              <span className="hidden lg:inline">
                {t('actions.resetPassword')}
              </span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmActivate({ user: row, nextActive: !row.active });
              }}
              aria-label={`${
                row.active
                  ? t('actions.deactivate')
                  : t('actions.reactivate')
              } ${row.login}`}
            >
              {row.active ? (
                <PowerOff size={14} aria-hidden="true" />
              ) : (
                <Power size={14} aria-hidden="true" />
              )}
              <span className="hidden lg:inline">
                {row.active
                  ? t('actions.deactivate')
                  : t('actions.reactivate')}
              </span>
            </Button>
          </div>
        ),
      },
    ],
    [t, tCommon, tRoles, openEdit, resetM],
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
        >
          <option value="">{t('filters.allActive')}</option>
          <option value="true">{t('filters.onlyActive')}</option>
          <option value="false">{t('filters.onlyInactive')}</option>
        </Select>
      </div>

      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={openEdit}
        isLoading={isLoading}
        loadingLabel={tCommon('loading')}
        empty={
          <EmptyState title={t('emptyTitle')} message={t('emptyMessage')} />
        }
      />

      <UserSheet
        open={sheetOpen}
        user={target}
        onClose={() => setSheetOpen(false)}
      />

      {/* Reset-password info modal — shows the fresh temp password once, with
          a copy button. Closing wipes it from state so it doesn't sit in
          memory forever. */}
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
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
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
                onClick={() => void handleCopy(resetInfo.password)}
                aria-label={t('resetPassword.copyAria')}
              >
                {tCommon('copy')}
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
