// Admin CRUD for the stanowisko → role mapping (docs/24 §A2).
//
// Admin-only, like every other screen that hands out access. After track B this
// becomes `@RequirePermission('sso.manage')`; the role check is the same thing
// spelled the way the codebase spells it today.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  SetStanowiskoRoleSchema,
  StanowiskoCodeSchema,
  type SetStanowiskoRoleDto,
  type SsoAccessDenialListDto,
  type StanowiskoRoleDto,
  type StanowiskoRoleListDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SsoService } from './sso.service';

@Controller('sso')
@Roles('admin')
@UseGuards(RolesGuard)
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  @Get('stanowisko-roles')
  async list(): Promise<StanowiskoRoleListDto> {
    return this.sso.listStanowiskoRoles();
  }

  /**
   * Idempotent upsert — the code is the identity, so PUT rather than POST, and
   * re-pointing a stanowisko at a different role is the same call as mapping it
   * for the first time.
   */
  @Put('stanowisko-roles/:code')
  @Audit({
    action: 'setStanowiskoRole',
    targetType: 'StanowiskoRoleMapping',
    targetKey: (req) => req.params?.code,
  })
  async set(
    @Param('code', new ZodValidationPipe(StanowiskoCodeSchema)) code: string,
    @Body(new ZodValidationPipe(SetStanowiskoRoleSchema)) body: SetStanowiskoRoleDto,
  ): Promise<StanowiskoRoleDto> {
    return this.sso.setStanowiskoRole(code, body.role);
  }

  @Delete('stanowisko-roles/:code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'deleteStanowiskoRole',
    targetType: 'StanowiskoRoleMapping',
    targetKey: (req) => req.params?.code,
  })
  async remove(
    @Param('code', new ZodValidationPipe(StanowiskoCodeSchema)) code: string,
  ): Promise<void> {
    await this.sso.deleteStanowiskoRole(code);
  }

  /** Sign-ins refused for want of a role — the "waiting for a decision" list. */
  @Get('access-denials')
  async denials(): Promise<SsoAccessDenialListDto> {
    return { items: await this.sso.listRecentDenials() };
  }
}
