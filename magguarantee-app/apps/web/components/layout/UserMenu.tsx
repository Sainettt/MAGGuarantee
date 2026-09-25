'use client';

// Header right-side dropdown — shows the user's name + role, exposes
// "Zmień hasło" + "Wyloguj". Custom dropdown rather than a Radix component to
// keep Phase 1 dependencies tight.
//
// The self-service password change lives HERE, next to logout, for every role
// (decision 2026-07-30) — it is the only password action a non-admin user can
// perform on their own account while logged in.

import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Role, UserDto } from '@magguarantee/shared';

import { ChangePasswordDialog } from '@/components/auth/ChangePasswordDialog';
import { logout } from '@/lib/api/auth';
import { ME_QUERY_KEY } from '@/lib/hooks/useAuth';
import { roleLabelKey } from '@/lib/roles';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  user: UserDto;
}

export function UserMenu({ user }: UserMenuProps) {
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // Lives OUTSIDE the `{open && …}` block below: the dialog must survive the
  // menu closing (it renders in a portal, so a click inside it counts as an
  // outside-click for the menu).
  const [passwordOpen, setPasswordOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onLogout = async () => {
    try {
      await logout();
    } catch {
      // Server-side logout failures are non-fatal — we still clear local
      // state and route to /login to avoid a stuck session.
    }
    qc.setQueryData(ME_QUERY_KEY, null);
    qc.removeQueries({ queryKey: ME_QUERY_KEY });
    router.replace('/login');
    router.refresh();
  };

  const initial = user.name.trim().slice(0, 1).toUpperCase() || 'U';
  // «Lider planistów» for a leader (docs/28); the base role label otherwise.
  const roleLabel = t(roleLabelKey(user.role as Role, user.lider));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-border bg-card hover:bg-input transition-colors',
          'pl-2 pr-3 py-1.5 text-[13px] font-semibold text-text',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
        )}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white text-[13px] font-extrabold">
          {initial}
        </span>
        <span className="hidden sm:inline">{user.name}</span>
        <ChevronDown size={14} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 mt-2 w-60 rounded-[12px] border border-border bg-card shadow-modal z-30',
            'p-2 text-[13px]',
          )}
        >
          <div className="px-3 py-2 border-b border-border">
            <div className="font-bold text-text">{user.name}</div>
            <div className="text-text-sub mt-0.5">{roleLabel}</div>
            <div className="text-text-sub mt-0.5 text-[11px]">
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setPasswordOpen(true);
            }}
            role="menuitem"
            className={cn(
              'mt-1 w-full text-left rounded-[8px] px-3 py-2 flex items-center gap-2',
              'hover:bg-input transition-colors font-semibold',
            )}
          >
            <KeyRound size={14} aria-hidden />
            {t('changePassword.menuItem')}
          </button>
          <button
            type="button"
            onClick={onLogout}
            role="menuitem"
            className={cn(
              'w-full text-left rounded-[8px] px-3 py-2 flex items-center gap-2',
              'hover:bg-danger-bg hover:text-danger-dark dark:hover:text-danger',
              'transition-colors font-semibold',
            )}
          >
            <LogOut size={14} aria-hidden />
            {t('common.logout')}
          </button>
        </div>
      )}

      <ChangePasswordDialog
        open={passwordOpen}
        onOpenChange={setPasswordOpen}
      />
    </div>
  );
}
