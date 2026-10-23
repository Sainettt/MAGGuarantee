import { SetMetadata } from '@nestjs/common';

import type { Permission } from '@magguarantee/shared';

import { PERMISSIONS_METADATA_KEY } from '../auth.constants';

/**
 * Restricts a controller method (or whole controller) to users holding at
 * least ONE of the listed permissions (any-of).
 *
 * `@RequirePermission('claims.submit', 'claims.verify')` is consumed by the
 * global `PermissionsGuard`, which checks `req.user.permissions` (filled once
 * per request by `JwtAccessStrategy.validate` from `permissionsFor(role,
 * lider)`). The catalog lives in `@magguarantee/shared` (`permissions.ts`);
 * what every route requires is mirrored in the generated fixture
 * `common/authz/__fixtures__/endpoint-permissions.snapshot.json`
 * (`npm run authz:snapshot -w api` after changing a decorator).
 *
 * At least one permission is required by the signature: an empty requirement
 * would admit nobody (the guard fails closed on it), which is never what the
 * author meant.
 *
 * The guard denies by default (docs/25 B5): a non-`@Public` route carries this
 * or `@AuthenticatedOnly(reason)`. `@AuthenticatedOnly` + `@RequirePermission`
 * and `@Public` + `@RequirePermission` are red in `endpoint-permissions.spec.ts`
 * / `roles-snapshot.spec.ts`.
 */
export const RequirePermission = (
  ...permissions: [Permission, ...Permission[]]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_METADATA_KEY, permissions);
