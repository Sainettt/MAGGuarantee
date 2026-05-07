// Role-gated navigation config per docs/14-design-system.md § Role-gated nav.
// Every nav entry declares the set of roles allowed to see it. Layouts filter
// the array in a Server Component before rendering — what a role doesn't see
// isn't even rendered (no client-side CSS hiding).

import {
  Building2,
  type LucideIcon,
  Truck,
  User,
  Container,
  Tags,
} from 'lucide-react';
import type { Role } from '@magguarantee/shared';

export interface NavItem {
  href: string;
  /** i18n key under `nav.*`. */
  labelKey: string;
  icon: LucideIcon;
  roles: readonly Role[];
}

/**
 * Employee-shell navigation. Phase 2 admin tables — only `admin` sees them.
 * `pracownik` is narrowed per docs/03-roles.md#pracownik (Dashboard + Wnioski
 * only). `opiekun` will get its own ownership-filtered versions in Phase 5.
 */
export const EMPLOYEE_NAV: readonly NavItem[] = [
  {
    href: '/employee/carriers',
    labelKey: 'nav.carriers',
    icon: Building2,
    roles: ['admin'],
  },
  {
    href: '/employee/vehicles',
    labelKey: 'nav.vehicles',
    icon: Truck,
    roles: ['admin'],
  },
  {
    href: '/employee/drivers',
    labelKey: 'nav.drivers',
    icon: User,
    roles: ['admin'],
  },
  {
    href: '/employee/trailers',
    labelKey: 'nav.trailers',
    icon: Container,
    roles: ['admin'],
  },
  {
    href: '/employee/trailer-types',
    labelKey: 'nav.trailerTypes',
    icon: Tags,
    roles: ['admin'],
  },
];

export function navForRole(items: readonly NavItem[], role: Role): NavItem[] {
  return items.filter((it) => it.roles.includes(role));
}
