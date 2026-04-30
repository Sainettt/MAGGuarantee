// Phase 1 role → landing-path mapping. Three internal roles share `/employee`
// because their UIs converge in Phases 4–5; the rest each get a dedicated
// route group ready for Phase 2+ divergence.

import type { Role } from '@magguarantee/shared';

export const ROLE_LANDING: Record<Role, string> = {
  admin: '/employee',
  pracownik: '/employee',
  opiekun: '/employee',
  przewoznik: '/carrier',
  planista: '/planista',
  dyspozytor: '/dyspozytor',
  eksport: '/eksport',
  weryfikator: '/weryfikator',
};

/** All authenticated landing paths (used by middleware to allow them). */
export const ROLE_LANDING_PATHS = Array.from(
  new Set(Object.values(ROLE_LANDING)),
);

export function landingFor(role: Role): string {
  return ROLE_LANDING[role];
}
