// Admin surface of the Google SSO (docs/24 §A2/§A5/§10): the stanowisko → role
// mapping, the refused-sign-in queue, and the one-step grant that answers it.
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
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import {
  GrantSsoAccessSchema,
  SetStanowiskoRoleSchema,
  StanowiskoCodeSchema,
  type GrantSsoAccessDto,
  type SetStanowiskoRoleDto,
  type SsoAccessDenialListDto,
  type SsoAccessGrantResultDto,
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
   *
   * Body `{ role, lider? }` (docs/28): `lider` omitted keeps the stored flag; a
   * resulting pair outside `LIDER_ROLES` is 422 `USER_LIDER_REQUIRES_LIDER_ROLE`.
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
    return this.sso.setStanowiskoRole(code, body.role, body.lider);
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

  /**
   * «Nadaj dostęp»: create, reactivate or update a directory-managed account
   * with a hand-picked role, in one step.
   *
   * 200 rather than 201 — the answer is a decision about a person, and
   * whether a row was inserted is reported in `outcome`.
   *
   * `manualTransaction: true` is load-bearing: the handler calls MAGSpace, and
   * the interceptor's interactive transaction must not be held open across that
   * network round-trip (docs/13 «Audit на уровне API»). The audit row is still
   * written by the interceptor, attributed to the admin, with the `before`
   * snapshot and `metadata` the directory service stashes.
   */
  @Post('access-grants')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'grantSsoAccess',
    targetType: 'User',
    targetKey: (_req, result) => (result as SsoAccessGrantResultDto | undefined)?.user.login,
    manualTransaction: true,
  })
  async grant(
    @Body(new ZodValidationPipe(GrantSsoAccessSchema)) body: GrantSsoAccessDto,
  ): Promise<SsoAccessGrantResultDto> {
    return this.sso.grantAccess(body);
  }
}
