import { SetMetadata } from '@nestjs/common';

import type { Role } from '@magguarantee/shared';

import { ROLES_METADATA_KEY } from '../auth.constants';

/**
 * Restricts a controller method (or whole controller) to the listed roles.
 *
 * `@Roles('admin', 'pracownik')` is consumed by `RolesGuard`. When no
 * `@Roles()` decorator is present on a route, the guard is a no-op — every
 * authenticated user passes through. This makes role enforcement explicitly
 * opt-in per endpoint.
 *
 * Per docs/15-auth-strategy.md#декоратор-roles and docs/03-roles.md
 * (access matrix).
 */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_METADATA_KEY, roles);
