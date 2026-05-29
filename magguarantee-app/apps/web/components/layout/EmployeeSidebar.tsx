'use client';

// Phase 4 — left sidebar for the employee shell. Renders the role-filtered
// nav list passed from the server-component layout. The mobile drawer's
// open/close state is owned by the parent shell (the burger button lives
// inside <Header>'s leftSlot), so this component only renders the
// permanent sidebar + the <Sheet> body — no internal toggle button.
//
// Lucide icon components aren't serialisable across the server/client
// boundary, so each nav item carries an `iconName` string and we map it
// back to the Lucide component locally via `ICONS`.
//
// Layout:
//   - md+ : permanent left sidebar, 240px wide, sticky next to <main>.
//   - <md : drawer opened by the parent's burger. Same `<Sheet>` primitive
//           Phase 2 uses for edit forms.
//
// Active-state matching prefers the entry whose href is the *longest*
// prefix of the current pathname; this prevents short-prefix entries
// from lighting up for unrelated child routes.

import {
  Activity,
  Building2,
  Container,
  FileText,
  Gauge,
  HeartHandshake,
  History,
  LayoutDashboard,
  Settings2,
  Truck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/Sheet';
import { useAuth } from '@/lib/hooks/useAuth';
import { useOpiekunFleet } from '@/lib/hooks/useOpiekunFleet';
import { cn } from '@/lib/utils';

/** Nav key of the «Moja opieka» entry — the one that carries the count pill. */
const OPIEKA_NAV_KEY = 'opieka';

/** Plain-JSON shape passed from the server-component layout. */
export interface NavItem {
  key: string;
  href: string;
  labelKey: string;
  /** Name of a Lucide icon component — resolved client-side via `ICONS`. */
  iconName: string;
}

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Building2,
  Truck,
  Users,
  Container,
  Settings2,
  Gauge,
  UserCog,
  History,
  Activity,
  HeartHandshake,
};

interface EmployeeSidebarProps {
  items: readonly NavItem[];
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function EmployeeSidebar({
  items,
  mobileOpen,
  onMobileOpenChange,
}: EmployeeSidebarProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const { user } = useAuth();

  // «Moja opieka» attention count — only meaningful for opiekuni (the nav
  // entry maps to *their* assigned carriers). Admins also see the opieka
  // section but it lists every carrier in the system, so a system-wide
  // "needs attention" tally would be noise on the nav and the aggregate fetch
  // is wasteful — we gate the query to opiekun. Other roles never reach this
  // shell. The query key matches the opieka list page, so when an opiekun is
  // on /employee/opieka the data is shared (no extra request).
  const isOpiekun = user?.role === 'opiekun';
  const showsOpieka = items.some((l) => l.key === OPIEKA_NAV_KEY);
  const fleetQ = useOpiekunFleet({ enabled: isOpiekun && showsOpieka });
  const attentionCount = isOpiekun
    ? (fleetQ.data?.carriers.filter(
        (c) => (c.attentionReasons?.length ?? 0) > 0,
      ).length ?? 0)
    : 0;

  // Compute one active key per render — the entry whose href is the
  // longest prefix of the current pathname.
  const activeKey = items.reduce<string | null>((best, link) => {
    const matches =
      pathname === link.href || pathname.startsWith(link.href + '/');
    if (!matches) return best;
    if (!best) return link.key;
    const bestHref = items.find((l) => l.key === best)?.href ?? '';
    return link.href.length > bestHref.length ? link.key : best;
  }, null);

  const renderList = (onNavigate?: () => void) => (
    <ul className="flex flex-col gap-0.5 p-2">
      {items.map((link) => {
        const Icon = ICONS[link.iconName] ?? FileText;
        const active = link.key === activeKey;
        const pillCount =
          link.key === OPIEKA_NAV_KEY && attentionCount > 0
            ? attentionCount
            : 0;
        return (
          <li key={link.key}>
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold',
                'transition-colors',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40',
                active
                  ? 'bg-brand-50 text-brand dark:bg-brand/15 dark:text-brand-light'
                  : 'text-text-sub hover:bg-input hover:text-text',
              )}
            >
              <Icon size={16} aria-hidden />
              <span className="truncate">{t(link.labelKey)}</span>
              {pillCount > 0 && (
                <span
                  className={cn(
                    'ml-auto inline-flex min-w-[1.25rem] items-center justify-center',
                    'rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums',
                    'bg-warning text-white',
                  )}
                  aria-label={t('nav.opiekaAttentionBadge', {
                    count: pillCount,
                  })}
                  title={t('nav.opiekaAttentionBadge', { count: pillCount })}
                >
                  {pillCount}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );

  if (items.length === 0) return null;

  return (
    <>
      {/* Desktop permanent sidebar */}
      <aside
        aria-label={t('nav.sectionLabel')}
        className={cn(
          'hidden md:block shrink-0 w-60 border-r border-border bg-card',
          'sticky top-16 self-start h-[calc(100vh-4rem)] overflow-y-auto',
        )}
      >
        <nav>{renderList()}</nav>
      </aside>

      {/* Mobile slide-over. The Phase 2 <Sheet> is right-anchored; a
          left-anchored variant is a follow-up — see report `## Deviations`. */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent className="md:hidden" id="employee-mobile-nav">
          <SheetHeader>
            <SheetTitle>{t('nav.sectionLabel')}</SheetTitle>
          </SheetHeader>
          <SheetBody className="px-0 py-2">
            <nav aria-label={t('nav.sectionLabel')}>
              {renderList(() => onMobileOpenChange(false))}
            </nav>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
