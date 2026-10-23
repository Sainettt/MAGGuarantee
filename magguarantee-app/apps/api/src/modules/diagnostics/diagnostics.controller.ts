import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import type {
  DashboardDto,
  DiagnosticsClaimsHealthDto,
  DiagnosticsDbHealthDto,
  DiagnosticsMailJobListDto,
  DiagnosticsResendMailResponse,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { DiagnosticsService } from './diagnostics.service';

/**
 * Phase 4.5 — Diagnostics admin endpoints per
 * docs/13-api-design.md#diagnostics-admin-only.
 *
 * Five endpoints; gates are per-method `@RequirePermission` (docs/25 §3 B2;
 * global `PermissionsGuard`):
 *  - `GET /diagnostics/dashboard`              — `dashboard.read` (admin + pracownik)
 *  - `GET /diagnostics/mails`                  — `diagnostics.manage` (admin only)
 *  - `POST /diagnostics/mails/:jobId/resend`   — `diagnostics.manage` (admin only), audited
 *  - `GET /diagnostics/claims`                 — `diagnostics.manage` (admin only)
 *  - `GET /diagnostics/db`                     — `diagnostics.manage` (admin only)
 *
 * Reads are NOT audited (audit-of-audit churn isn't useful). Only the
 * mutating resend endpoint carries `@Audit(...)`.
 */
@Controller('diagnostics')
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get('dashboard')
  @RequirePermission('dashboard.read')
  async dashboard(): Promise<DashboardDto> {
    return this.diagnostics.getDashboard();
  }

  @Get('mails')
  @RequirePermission('diagnostics.manage')
  async mails(): Promise<DiagnosticsMailJobListDto> {
    return this.diagnostics.getMails();
  }

  @Post('mails/:jobId/resend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('diagnostics.manage')
  @Audit({
    action: 'diagnostics.mail.resend',
    targetType: 'MailJob',
    targetKey: (req) => req.params?.jobId,
  })
  async resendMail(
    @Param('jobId') jobId: string,
  ): Promise<DiagnosticsResendMailResponse> {
    return this.diagnostics.resendMail(jobId);
  }

  @Get('claims')
  @RequirePermission('diagnostics.manage')
  async claimsHealth(): Promise<DiagnosticsClaimsHealthDto> {
    return this.diagnostics.getClaimsHealth();
  }

  @Get('db')
  @RequirePermission('diagnostics.manage')
  async dbHealth(): Promise<DiagnosticsDbHealthDto> {
    return this.diagnostics.getDbHealth();
  }
}
