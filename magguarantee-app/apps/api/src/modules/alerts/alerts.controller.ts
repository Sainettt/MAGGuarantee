import { Controller, Get } from '@nestjs/common';

import type { AlertsResponse } from '@magguarantee/shared';

import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AlertsService } from './alerts.service';

/**
 * `GET /api/v1/alerts` — document-expiry alerts (OCP insurance, transport
 * licence, fuel card, driving licence) approaching or past their date.
 *
 * Read-only, in-app only (no email), no `@Audit` (it's a derived read). Gate:
 * class-level `@RequirePermission('panel.opiekun')` (docs/25 §3 B2, global
 * `PermissionsGuard`) — held by admin (all) + opiekun (their carriers, scoped
 * in the service). Any other role → 403.
 */
@Controller('alerts')
@RequirePermission('panel.opiekun')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AlertsResponse> {
    return this.alerts.list(user);
  }
}
