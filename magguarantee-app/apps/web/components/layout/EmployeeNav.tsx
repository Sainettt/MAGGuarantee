'use client';

// Top-tab nav rendered below <Header> for the employee shell. Filters items
// by current role per docs/14-design-system.md § Role-gated nav. Active link
// state is brand-tinted per the spec.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useAuth } from '@/lib/hooks/useAuth';
import { EMPLOYEE_NAV, navForRole } from '@/lib/nav';
import { cn } from '@/lib/utils';

export function EmployeeNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { user } = useAuth();
  if (!user) return null;

  const items = navForRole(EMPLOYEE_NAV, user.role);
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Employee sections"
      className="border-b border-border bg-card/60 backdrop-blur"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap',
                'border-b-2 -mb-px transition-colors',
                'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 rounded-sm',
                active
                  ? 'text-brand border-brand bg-brand-50 dark:bg-brand/15 dark:text-brand-light'
                  : 'text-text-sub border-transparent hover:text-text hover:bg-input',
              )}
            >
              <Icon size={16} aria-hidden />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
