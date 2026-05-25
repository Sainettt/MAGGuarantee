import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  CarrierFiltersSchema,
  CreateCarrierSchema,
  DeleteWithReasonSchema,
  UpdateCarrierSchema,
  UuidSchema,
  type CarrierDto,
  type CarrierFilters,
  type CarrierWithTemporaryPasswordDto,
  type CreateCarrierDto,
  type DeleteWithReasonDto,
  type UpdateCarrierDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import {
  OpiekunOwns,
  OpiekunOwnershipGuard,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CarriersService } from './carriers.service';

/**
 * Carriers REST surface per docs/13-api-design.md#carriers.
 *
 * Role gating per endpoint:
 *  - GET (list / detail): admin / opiekun(own)
 *  - POST: admin / opiekun (auto-self-assign for opiekun)
 *  - PATCH / deactivate / reactivate / reset-password:
 *      admin / opiekun(own)
 *  - DELETE: admin only (soft, cascades to fleet)
 *
 * `pracownik` is intentionally excluded — per docs/03-roles.md#pracownik that
 * role is a narrow "Opiekun wniosków" scoped to claims verification only and
 * has no carrier-CRUD access.
 */
@Controller('carriers')
@UseGuards(RolesGuard, OpiekunOwnershipGuard)
export class CarriersController {
  constructor(private readonly carriers: CarriersService) {}

  @Get()
  @Roles('admin', 'opiekun')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(CarrierFiltersSchema)) query: CarrierFilters,
  ): Promise<{ items: CarrierDto[]; nextCursor: string | null }> {
    return this.carriers.list(user, query);
  }

  @Get(':id')
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierDto> {
    return this.carriers.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'opiekun')
  @Audit({
    action: 'createCarrier',
    targetType: 'Carrier',
    targetKey: (_req, result) => (result as { id?: string }).id,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateCarrierSchema)) dto: CreateCarrierDto,
  ): Promise<CarrierWithTemporaryPasswordDto> {
    return this.carriers.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  @Audit({
    action: 'updateCarrier',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateCarrierSchema)) dto: UpdateCarrierDto,
  ): Promise<CarrierDto> {
    return this.carriers.update(user, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  @Audit({
    action: 'deactivateCarrier',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierDto> {
    return this.carriers.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  @Audit({
    action: 'reactivateCarrier',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
  })
  async reactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierDto> {
    return this.carriers.reactivate(id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  @Audit({
    action: 'resetCarrierPassword',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
    omitResultBody: true,
  })
  async resetPassword(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierWithTemporaryPasswordDto> {
    return this.carriers.resetPassword(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @Audit({
    action: 'deleteCarrier',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.carriers.softDelete(id);
  }

  /**
   * Hard-delete (admin-only) per Phase 4.4. Mounted as a sibling of the
   * soft-delete endpoint to keep the legacy DELETE :id contract intact for
   * the opiekun + carrier-self flows. `reason` is required and stored in
   * `audit_log.metadata.reason` via `AuditContext.setMetadata`.
   */
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @Audit({
    action: 'hardDeleteCarrier',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
  })
  async hardDelete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonSchema))
    body: DeleteWithReasonDto,
  ): Promise<void> {
    await this.carriers.hardDelete(id, body.reason);
  }
}
