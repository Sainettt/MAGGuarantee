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
  CreateTrailerSchema,
  TrailerFiltersSchema,
  UpdateTrailerSchema,
  UuidSchema,
  type CreateTrailerDto,
  type TrailerDto,
  type TrailerFilters,
  type UpdateTrailerDto,
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
import { TrailersService } from './trailers.service';

@Controller('trailers')
@UseGuards(RolesGuard, OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class TrailersController {
  constructor(private readonly trailers: TrailersService) {}

  @Get()
  @Roles('admin', 'opiekun', 'przewoznik')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(TrailerFiltersSchema)) query: TrailerFilters,
  ): Promise<{ items: TrailerDto[]; nextCursor: string | null }> {
    return this.trailers.list(user, query);
  }

  @Get(':id')
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TrailerDto> {
    return this.trailers.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('carrierId', 'body', 'carrierId')
  @CarrierOwns('carrierId', 'body', 'carrierId')
  @Audit({
    action: 'createTrailer',
    targetType: 'Trailer',
    targetKey: (_req, result) => (result as { id?: string }).id,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreateTrailerSchema)) dto: CreateTrailerDto,
  ): Promise<TrailerDto> {
    return this.trailers.create(user, dto);
  }

  @Patch(':id')
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  @Audit({
    action: 'updateTrailer',
    targetType: 'Trailer',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateTrailerSchema)) dto: UpdateTrailerDto,
  ): Promise<TrailerDto> {
    return this.trailers.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  @Audit({
    action: 'deactivateTrailer',
    targetType: 'Trailer',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TrailerDto> {
    return this.trailers.deactivate(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  @Audit({
    action: 'reactivateTrailer',
    targetType: 'Trailer',
    targetKey: (req) => req.params?.id,
  })
  async reactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TrailerDto> {
    return this.trailers.reactivate(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'trailerId')
  @Audit({
    action: 'deleteTrailer',
    targetType: 'Trailer',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.trailers.softDelete(id);
  }
}
