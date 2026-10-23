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
} from '@nestjs/common';

import {
  CreateTrailerTypeSchema,
  DeleteWithReasonSchema,
  TrailerTypeFiltersSchema,
  UpdateTrailerTypeSchema,
  UuidSchema,
  type CreateTrailerTypeDto,
  type DeleteWithReasonDto,
  type TrailerTypeDto,
  type TrailerTypeFilters,
  type UpdateTrailerTypeDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { TrailerTypesService } from './trailer-types.service';

/**
 * Trailer-type lookup CRUD per docs/13-api-design.md.
 *
 * `TrailerType` is a global lookup seeded by db-agent. GET is readable by any
 * authenticated user (used as a dropdown when creating/editing trailers, per
 * docs/13-api-design.md#lookups) — no decorator on purpose, the route sits in
 * `AUTHENTICATED_ONLY` (`common/authz/endpoint-permissions.ts`). Mutations
 * require `trailer_types.manage` (per-method `@RequirePermission`, docs/25
 * §3 B2; global `PermissionsGuard`), which only `admin` holds.
 */
@Controller('trailer-types')
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
  @RequirePermission('trailer_types.manage')
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
  @RequirePermission('trailer_types.manage')
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
  @RequirePermission('trailer_types.manage')
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

  /**
   * Hard-delete (admin-only) per Phase 4.4. TrailerType has no soft-delete
   * (it's a global lookup, no tenancy) so there's only the hard-delete
   * endpoint. `reason` required, persisted to `audit_log.metadata.reason`.
   *
   * Returns 409 Conflict when the type is still referenced by a trailer
   * (Restrict FK).
   */
  @Delete(':id/hard')
  @RequirePermission('trailer_types.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Audit({
    action: 'hardDeleteTrailerType',
    targetType: 'TrailerType',
    targetKey: (req) => req.params?.id,
  })
  async hardDelete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonSchema))
    body: DeleteWithReasonDto,
  ): Promise<void> {
    await this.types.hardDelete(id, body.reason);
  }
}
