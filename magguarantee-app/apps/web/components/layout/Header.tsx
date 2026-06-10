'use client';

// Shared app-header for every authenticated route group. Renders the brand
// (logo + app name), language + theme toggles, and the <UserMenu>. The
// optional `leftSlot` is used by shells that need a burger / nav-trigger
// inside the header (Phase 4 employee panel on mobile — see <EmployeeShell>).

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Role } from '@magguarantee/shared';

import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/lib/hooks/useAuth';
import { landingFor } from '@/lib/roles';

import { UserMenu } from './UserMenu';

interface HeaderProps {
  /** Rendered at the very left of the header, before the brand. Use for a
   *  mobile burger / nav-trigger that opens a sidebar drawer. */
  leftSlot?: ReactNode;
}

export function Header({ leftSlot }: HeaderProps = {}) {
  const t = useTranslations('app');
  const { user } = useAuth();

  // The logo doubles as the home link — resolves to the role's landing path
  // (for eksport/weryfikator that is the delegations board directly, so there
  // is no redirect loop; docs/14-design-system.md §7.2). Anonymous: inert logo.
  const homeHref = user ? landingFor(user.role as Role) : undefined;
  const logo = (
    <Image
      src="/logo.png"
      alt="MAGTRANS"
      width={240}
      height={64}
      className="h-8 w-auto dark:brightness-110"
    />
  );

  return (
    <header className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {leftSlot}
          {homeHref ? (
            <Link
              href={homeHref}
              aria-label={t('name')}
              className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {logo}
            </Link>
          ) : (
            logo
          )}
          <span className="hidden md:inline-block h-6 w-px bg-border" aria-hidden />
          <span className="hidden md:inline text-[15px] font-extrabold text-text tracking-tight">
            {t('name')}
          </span>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <LanguageToggle />
          <ThemeToggle />
          {user && <UserMenu user={user} />}
        </div>
      </div>
    </header>
  );
}
