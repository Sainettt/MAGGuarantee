import { Controller, Get, UseGuards } from '@nestjs/common';

import type { AlertsResponse } from '@magguarantee/shared';

import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AlertsService } from './alerts.service';

/**
 * `GET /api/v1/alerts` — document-expiry alerts (OCP insurance, transport
 * licence, fuel card, driving licence) approaching or past their date.
 *
 * Read-only, in-app only (no email), no `@Audit` (it's a derived read). Role
 * gating: admin (all) + opiekun (their carriers, scoped in the service). Any
 * other role → 403.
 */
@Controller('alerts')
@UseGuards(RolesGuard)
@Roles('admin', 'opiekun')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<AlertsResponse> {
    return this.alerts.list(user);
  }
}
