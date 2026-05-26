import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import type {
  DashboardDto,
  DiagnosticsClaimsHealthDto,
  DiagnosticsDbHealthDto,
  DiagnosticsMailJobListDto,
  DiagnosticsResendMailResponse,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DiagnosticsService } from './diagnostics.service';

/**
 * Phase 4.5 — Diagnostics admin endpoints per
 * docs/13-api-design.md#diagnostics-admin-only.
 *
 * Five endpoints; role gates are per-method:
 *  - `GET /diagnostics/dashboard`              — admin + pracownik
 *  - `GET /diagnostics/mails`                  — admin only
 *  - `POST /diagnostics/mails/:jobId/resend`   — admin only, audited
 *  - `GET /diagnostics/claims`                 — admin only
 *  - `GET /diagnostics/db`                     — admin only
 *
 * Reads are NOT audited (audit-of-audit churn isn't useful). Only the
 * mutating resend endpoint carries `@Audit(...)`.
 */
@Controller('diagnostics')
@UseGuards(RolesGuard)
export class DiagnosticsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get('dashboard')
  @Roles('admin', 'pracownik')
  async dashboard(): Promise<DashboardDto> {
    return this.diagnostics.getDashboard();
  }

  @Get('mails')
  @Roles('admin')
  async mails(): Promise<DiagnosticsMailJobListDto> {
    return this.diagnostics.getMails();
  }

  @Post('mails/:jobId/resend')
  @HttpCode(HttpStatus.OK)
  @Roles('admin')
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
  @Roles('admin')
  async claimsHealth(): Promise<DiagnosticsClaimsHealthDto> {
    return this.diagnostics.getClaimsHealth();
  }

  @Get('db')
  @Roles('admin')
  async dbHealth(): Promise<DiagnosticsDbHealthDto> {
    return this.diagnostics.getDbHealth();
  }
}
