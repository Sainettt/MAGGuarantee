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
  type CarrierDocumentsOverviewDto,
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
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { CarrierDocumentsService } from './carrier-documents.service';
import { CarriersService } from './carriers.service';

/**
 * Carriers REST surface per docs/13-api-design.md#carriers.
 *
 * Gates (docs/25 §3 B2, B5): every route carries `@RequirePermission`, checked
 * by the global `PermissionsGuard` and mirrored per route in the generated
 * fixture `common/authz/__fixtures__/endpoint-permissions.snapshot.json`; who
 * holds what is `ROLE_PERMISSIONS` in `@magguarantee/shared`:
 *  - GET (list / detail): `carriers.read` (admin / opiekun(own))
 *  - GET documents overview: `carrier_documents.read` (admin / opiekun(own))
 *  - POST: `carriers.write` (admin / opiekun — auto-self-assign for opiekun)
 *  - PATCH / deactivate / reactivate / reset-password: `carriers.write`
 *      (admin / opiekun(own))
 *  - DELETE (soft, cascades to fleet) and DELETE /hard: `carriers.delete`
 *      (admin only)
 * Row scope stays on the role: the class-level `OpiekunOwnershipGuard` runs
 * the `@OpiekunOwns` checks ("(own)" above).
 *
 * `pracownik` intentionally holds no `carriers.*` permission — per
 * docs/03-roles.md#pracownik that role is a narrow "Opiekun wniosków" scoped
 * to claims verification only and has no carrier-CRUD access.
 */
@Controller('carriers')
@UseGuards(OpiekunOwnershipGuard)
export class CarriersController {
  constructor(
    private readonly carriers: CarriersService,
    private readonly documents: CarrierDocumentsService,
  ) {}

  @Get()
  @RequirePermission('carriers.read')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(CarrierFiltersSchema)) query: CarrierFilters,
  ): Promise<{ items: CarrierDto[]; nextCursor: string | null }> {
    return this.carriers.list(user, query);
  }

  @Get(':id')
  @RequirePermission('carriers.read')
  @OpiekunOwns('id', 'param', 'carrierId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierDto> {
    return this.carriers.getById(id);
  }

  /**
   * READ-ONLY documents overview for the opiekun "Dokumenty" tab — every live
   * document tied to the carrier (company docs + per-vehicle / per-trailer /
   * per-driver files + ADR-flagged vehicles), grouped for the UI. Downloads
   * reuse the EXISTING per-entity download routes (the DTO carries the ids).
   * Gate: `carrier_documents.read` (the documents permission, like the
   * attachments endpoints — not `carriers.read`). Same scoping as the carrier
   * detail / attachments endpoints: admin sees all, opiekun only their own
   * carriers (`OpiekunOwnershipGuard`). Per docs/13-api-design.md#carriers.
   */
  @Get(':id/documents/overview')
  @RequirePermission('carrier_documents.read')
  @OpiekunOwns('id', 'param', 'carrierId')
  async documentsOverview(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierDocumentsOverviewDto> {
    return this.documents.overview(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('carriers.write')
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
  @RequirePermission('carriers.write')
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
  @RequirePermission('carriers.write')
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
  @RequirePermission('carriers.write')
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
  @RequirePermission('carriers.write')
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
  @RequirePermission('carriers.delete')
  @Audit({
    action: 'deleteCarrier',
    targetType: 'Carrier',
    targetKey: (req) => req.params?.id,
  })
  async delete(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<void> {
    await this.carriers.softDelete(id, user);
  }

  /**
   * Hard-delete (admin-only) per Phase 4.4. Mounted as a sibling of the
   * soft-delete endpoint to keep the legacy DELETE :id contract intact for
   * the opiekun + carrier-self flows. `reason` is required and stored in
   * `audit_log.metadata.reason` via `AuditContext.setMetadata`.
   */
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('carriers.delete')
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
