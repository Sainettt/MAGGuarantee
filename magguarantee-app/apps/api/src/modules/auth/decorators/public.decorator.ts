import { SetMetadata } from '@nestjs/common';

import { IS_PUBLIC_KEY } from '../auth.constants';

/**
 * Marks an endpoint as accessible without an access JWT.
 *
 * Used on the auth bootstrap endpoints (login / verify-code / resend-code /
 * refresh) and on the liveness/readiness health endpoints. Everything else
 * is protected by the global JwtAuthGuard.
 */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
