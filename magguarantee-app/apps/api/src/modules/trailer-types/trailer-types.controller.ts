import {
  Body,
  Controller,
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
  CreateTrailerTypeSchema,
  TrailerTypeFiltersSchema,
  UpdateTrailerTypeSchema,
  UuidSchema,
  type CreateTrailerTypeDto,
  type TrailerTypeDto,
  type TrailerTypeFilters,
  type UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TrailerTypesService } from './trailer-types.service';

/**
 * Trailer-type lookup CRUD per docs/13-api-design.md (admin-only).
 *
 * `TrailerType` is a global lookup seeded by db-agent. Per docs, only the
 * admin can mutate it.
 */
@Controller('trailer-types')
@Roles('admin')
@UseGuards(RolesGuard)
export class TrailerTypesController {
  constructor(private readonly types: TrailerTypesService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(TrailerTypeFiltersSchema))
    query: TrailerTypeFilters,
  ): Promise<TrailerTypeDto[]> {
    return this.types.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Audit({
    action: 'createTrailerType',
    targetType: 'TrailerType',
    targetKey: (_req, result) => (result as { id?: string }).id,
  })
  async create(
    @Body(new ZodValidationPipe(CreateTrailerTypeSchema))
    dto: CreateTrailerTypeDto,
  ): Promise<TrailerTypeDto> {
    return this.types.create(dto);
  }

  @Patch(':id')
  @Audit({
    action: 'updateTrailerType',
    targetType: 'TrailerType',
    targetKey: (req) => req.params?.id,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(UpdateTrailerTypeSchema))
    dto: UpdateTrailerTypeDto,
  ): Promise<TrailerTypeDto> {
    return this.types.update(id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Audit({
    action: 'deactivateTrailerType',
    targetType: 'TrailerType',
    targetKey: (req) => req.params?.id,
  })
  async deactivate(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TrailerTypeDto> {
    return this.types.deactivate(id);
  }
}
