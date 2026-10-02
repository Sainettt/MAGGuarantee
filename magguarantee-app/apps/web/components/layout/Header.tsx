'use client';

// Shared app-header for every authenticated route group. Renders the brand
// (logo + app name), language + theme toggles, and the <UserMenu>. The
// optional `leftSlot` is used by shells that need a burger / nav-trigger
// inside the header (Phase 4 employee panel on mobile — see <EmployeeShell>).
//
// BugBot «Zgłoś problem» / «Zgłoś pomysł» (off unless
// NEXT_PUBLIC_BUGBOT_ENABLED): the header owns the ONE handoff instance and
// hands it to both triggers — <BugbotButtons> pills from `lg`, <UserMenu>
// items below `lg` — so they share the pending state and the inline error.

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { Role } from '@magguarantee/shared';

import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useAuth } from '@/lib/hooks/useAuth';
import { useBugbotHandoff } from '@/lib/hooks/useBugbotHandoff';
import { landingFor } from '@/lib/roles';

import { BugbotButtons } from './BugbotButtons';
import { UserMenu } from './UserMenu';

interface HeaderProps {
  /** Rendered at the very left of the header, before the brand. Use for a
   *  mobile burger / nav-trigger that opens a sidebar drawer. */
  leftSlot?: ReactNode;
}

export function Header({ leftSlot }: HeaderProps = {}) {
  const t = useTranslations('app');
  const { user } = useAuth();
  const bugbot = useBugbotHandoff(user ? (user.role as Role) : null);

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

  // Top chrome layer at `z-30` — strictly ABOVE the sub-navs (e.g.
  // <CarrierTabs>, which sticks at `top-16 z-20` with its own `backdrop-blur`
  // stacking context). The two are siblings; at equal z-index the later-in-DOM
  // sub-nav would paint over the header — and over the <UserMenu> dropdown,
  // which lives INSIDE the header's stacking context and so cannot escape a
  // `z-20` header to clear a `z-20` sub-nav. Lifting the header to `z-30` keeps
  // the dropdown above the sub-nav band. Hierarchy: header z-30 > sub-nav z-20
  // > page content z-10; modals portal to body at z-40/z-50 and still cover it.
  return (
    <header className="sticky top-0 z-30 bg-card/90 backdrop-blur border-b border-border">
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

        {/* `relative self-stretch`: full bar height, so <BugbotButtons>' inline
            error (absolute, `top-full`) hangs right below the header border. */}
        <div className="relative self-stretch flex items-center gap-2 sm:gap-3">
          {user && <BugbotButtons handoff={bugbot} />}
          <LanguageToggle />
          <ThemeToggle />
          {user && <UserMenu user={user} bugbot={bugbot} />}
        </div>
      </div>
    </header>
  );
}
