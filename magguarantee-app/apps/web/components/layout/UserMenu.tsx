'use client';

// Header right-side dropdown — shows the user's name + role, exposes
// "Log out". Phase 1 has no other items; Phase 2+ will add profile / role
// switcher. Custom dropdown rather than a Radix component to keep Phase 1
// dependencies tight.

import { ChevronDown, LogOut } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Role, UserDto } from '@magguarantee/shared';

import { logout } from '@/lib/api/auth';
import { ME_QUERY_KEY } from '@/lib/hooks/useAuth';
import { cn } from '@/lib/utils';

interface UserMenuProps {
  user: UserDto;
}

export function UserMenu({ user }: UserMenuProps) {
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
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
  const roleKey = user.role as Role;

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
            <div className="text-text-sub mt-0.5">{t(`roles.${roleKey}`)}</div>
            <div className="text-text-sub mt-0.5 text-[11px]">
              {user.email}
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            role="menuitem"
            className={cn(
              'mt-1 w-full text-left rounded-[8px] px-3 py-2 flex items-center gap-2',
              'hover:bg-danger-bg hover:text-danger-dark dark:hover:text-danger',
              'transition-colors font-semibold',
            )}
          >
            <LogOut size={14} aria-hidden />
            {t('common.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
