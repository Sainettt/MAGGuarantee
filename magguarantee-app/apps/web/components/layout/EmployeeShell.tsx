'use client';

// Phase 4 — employee shell. Composes <Header> (with a mobile burger that
// opens the nav drawer) + <EmployeeSidebar> (permanent on md+, drawer on
// mobile) around the page <main>.
//
// The shell is a client component because it owns the open/closed state of
// the mobile drawer and uses `usePathname()` for active-link styling. But
// the nav items themselves are computed in the *server* layout from the
// user's role — we receive them here as plain JSON props, so what a role
// can't see isn't even shipped to the client.
//
// Auth gating happens upstream in the route-group layout via
// `requireRoleAccess()`, so this shell can safely assume there's a user.

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Header } from '@/components/layout/Header';
import { EmployeeSidebar, type NavItem } from '@/components/layout/EmployeeSidebar';
import { cn } from '@/lib/utils';

interface EmployeeShellProps {
  /** Pre-filtered nav items for the current role (computed server-side). */
  navItems: readonly NavItem[];
  children: React.ReactNode;
}

export function EmployeeShell({ navItems, children }: EmployeeShellProps) {
  const t = useTranslations();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        leftSlot={
          navItems.length > 0 ? (
            <button
              type="button"
              aria-label={t('nav.openMenu')}
              aria-expanded={mobileNavOpen}
              aria-controls="employee-mobile-nav"
              onClick={() => setMobileNavOpen(true)}
              className={cn(
                'md:hidden inline-flex h-9 w-9 items-center justify-center rounded-md',
                'border border-border bg-card text-text-sub hover:text-text hover:bg-input',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
              )}
            >
              <Menu size={18} aria-hidden />
            </button>
          ) : null
        }
      />

      <div className="flex flex-1 mx-auto w-full max-w-screen-2xl">
        <EmployeeSidebar
          items={navItems}
          mobileOpen={mobileNavOpen}
          onMobileOpenChange={setMobileNavOpen}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
