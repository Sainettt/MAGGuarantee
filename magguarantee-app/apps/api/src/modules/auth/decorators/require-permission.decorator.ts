import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@magguarantee/shared';

import { PERMISSIONS_METADATA_KEY } from '../auth.constants';

/**
 * Restricts a controller method (or whole controller) to users holding at
 * least ONE of the listed permissions — any-of, exactly like `@Roles`.
 *
 * `@RequirePermission('claims.submit', 'claims.verify')` is consumed by the
 * global `PermissionsGuard`, which checks `req.user.permissions` (filled once
 * per request by `JwtAccessStrategy.validate` from `permissionsFor(role,
 * lider)`). The catalog lives in `@magguarantee/shared` (`permissions.ts`);
 * the route → permission plan is `common/authz/endpoint-permissions.ts`.
 *
 * At least one permission is required by the signature: an empty requirement
 * would admit nobody (the guard fails closed on it), which is never what the
 * author meant.
 *
 * Track B transition (docs/25 §3 B2): a route carries EITHER `@Roles` OR
 * `@RequirePermission`, never both — `roles-snapshot.spec.ts` turns the
 * combination into a red test. `@Public` + `@RequirePermission` is red too.
 */
export const RequirePermission = (
  ...permissions: [Permission, ...Permission[]]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
