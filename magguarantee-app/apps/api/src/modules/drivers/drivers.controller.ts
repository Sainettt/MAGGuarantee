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
  CreateDriverSchema,
  DriverFiltersSchema,
  UpdateDriverSchema,
  UuidSchema,
  type CreateDriverDto,
  type DriverDto,
  type DriverFilters,
  type UpdateDriverDto,
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
import { DriversService } from './drivers.service';

@Controller('drivers')
@UseGuards(RolesGuard, OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(DriverFiltersSchema)) query: DriverFilters,
  ): Promise<{ items: DriverDto[]; nextCursor: string | null }> {
    return this.drivers.list(user, query);
  }

  @Get(':id')
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverDto> {
    return this.drivers.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  @Audit({
    action: 'createDriver',
    targetType: 'Driver',
    targetKey: (_req, result) => (result as { loginSlug?: string }).loginSlug,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateDriverSchema)) dto: CreateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  @Audit({
    action: 'updateDriver',
    targetType: 'Driver',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateDriverSchema)) dto: UpdateDriverDto,
  ): Promise<DriverDto> {
    return this.drivers.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  @Audit({
    action: 'deactivateDriver',
    targetType: 'Driver',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverDto> {
    return this.drivers.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  @Audit({
    action: 'reactivateDriver',
    targetType: 'Driver',
    targetKey: (req) => req.params?.id,
  })
  async reactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverDto> {
    return this.drivers.reactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'pracownik', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  @Audit({
    action: 'deleteDriver',
    targetType: 'Driver',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.drivers.softDelete(id);
  }
}
