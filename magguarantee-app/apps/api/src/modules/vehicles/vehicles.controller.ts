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
  CreateVehicleSchema,
  UpdateVehicleSchema,
  UuidSchema,
  VehicleFiltersSchema,
  type CreateVehicleDto,
  type UpdateVehicleDto,
  type VehicleDto,
  type VehicleFilters,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import {
  CarrierOwnershipGuard,
  CarrierOwns,
  OpiekunOwnershipGuard,
  OpiekunOwns,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VehiclesService } from './vehicles.service';

/**
 * Vehicles REST surface per docs/13-api-design.md#vehicles.
 *
 * The list/detail endpoints fan out by role; carrier writes go through both
 * Opiekun and Carrier ownership guards (each is a no-op for non-matching
 * roles, so they compose additively per the wave brief).
 */
@Controller('vehicles')
@UseGuards(RolesGuard, OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}

  @Get()
  @Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(VehicleFiltersSchema)) query: VehicleFilters,
  ): Promise<{ items: VehicleDto[]; nextCursor: string | null }> {
    return this.vehicles.list(user, query);
  }

  @Get(':id')
  @Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<VehicleDto> {
    return this.vehicles.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('carrierId', 'body', 'carrierId')
  @Audit({
    action: 'createVehicle',
    targetType: 'Vehicle',
    targetKey: (_req, result) => (result as { id?: string }).id,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateVehicleSchema)) dto: CreateVehicleDto,
  ): Promise<VehicleDto> {
    return this.vehicles.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  @Audit({
    action: 'updateVehicle',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateVehicleSchema)) dto: UpdateVehicleDto,
  ): Promise<VehicleDto> {
    return this.vehicles.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  @Audit({
    action: 'deactivateVehicle',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<VehicleDto> {
    return this.vehicles.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  @Audit({
    action: 'reactivateVehicle',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async reactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<VehicleDto> {
    return this.vehicles.reactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @Audit({
    action: 'deleteVehicle',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.vehicles.softDelete(id);
  }
}
