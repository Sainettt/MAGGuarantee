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
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import type { z } from 'zod';

import {
  CreateVehicleSchema,
  DeleteWithReasonSchema,
  SetVehicleRouteStatusSchema,
  UpdateVehicleSchema,
  UuidSchema,
  VehicleFiltersSchema,
  type CreateVehicleDto,
  type DeleteWithReasonDto,
  type SetVehicleRouteStatusDto,
  type UpdateVehicleDto,
  type VehicleAttachmentDto,
  type VehicleDto,
  type VehicleFilters,
  type VehicleRouteBoardItemDto,
  type VehicleRouteStatusLogDto,
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
import {
  collectAndValidateUploads,
  type MultipartFiles,
} from './attachment-validation';
import { coerceVehicleMultipartBody } from './multipart-coerce';
import {
  ATTACHMENT_FILE_FIELDS,
  MAX_ATTACHMENT_BYTES,
  MAX_FILES_PER_FIELD,
} from './vehicle-attachments.constants';
import { VehicleRouteStatusService } from './vehicle-route-status.service';
import { VehiclesService } from './vehicles.service';

/**
 * `FileFieldsInterceptor` field config — one file field per attachment
 * category, each accepting up to `MAX_FILES_PER_FIELD` files. multer keeps
 * the bytes in memory (small files, ≤10 MB) so the service can stream them
 * straight to MinIO.
 *
 * Multipart field names (web MUST mirror exactly): `contract`, `cabotageDe`,
 * `cabotageFr`.
 */
const ATTACHMENT_UPLOAD_FIELDS = ATTACHMENT_FILE_FIELDS.map(({ field }) => ({
  name: field,
  maxCount: MAX_FILES_PER_FIELD,
}));

const MULTIPART_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: ATTACHMENT_FILE_FIELDS.length * MAX_FILES_PER_FIELD },
};

/**
 * Vehicles REST surface per docs/13-api-design.md#vehicles.
 *
 * `POST /vehicles` and `PATCH /vehicles/:id` are `multipart/form-data`
 * endpoints — scalar fields as text parts (coerced before Zod validation),
 * umowa/cabotage screenshots as file parts. The list/detail endpoints fan
 * out by role; carrier writes go through both Opiekun and Carrier ownership
 * guards (each is a no-op for non-matching roles, so they compose additively
 * per the wave brief).
 */
@Controller('vehicles')
@UseGuards(RolesGuard, OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class VehiclesController {
  constructor(
    private readonly vehicles: VehiclesService,
    private readonly routeStatus: VehicleRouteStatusService,
  ) {}

  /**
   * Weryfikator route board (Phase 7) — ALL active vehicles with today's
   * derived route status. Declared BEFORE `GET /:id` so the literal
   * `route-board` segment is matched first (Express matches in declaration
   * order). A dedicated endpoint — NOT an overload of the ownership-scoped
   * `GET /vehicles` — so the board is never narrowed by carrier/opiekun scope.
   *
   * Guards: the class-level `OpiekunOwnershipGuard` / `CarrierOwnershipGuard`
   * are decorator-driven (no `@OpiekunOwns` / `@CarrierOwns` here → they
   * short-circuit `true`), and both also pass through `weryfikator` / `admin`
   * by role anyway. `RolesGuard` does the actual gate.
   */
  @Get('route-board')
  @Roles('weryfikator', 'admin')
  async routeBoard(): Promise<VehicleRouteBoardItemDto[]> {
    return this.routeStatus.getBoard();
  }

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
  // NOTE: deliberately NO `@OpiekunOwns('carrierId', 'body', 'carrierId')`
  // here. Guards run BEFORE interceptors in NestJS, and this endpoint uses
  // `FileFieldsInterceptor` (multer) to parse multipart/form-data. At guard
  // time `req.body` is still empty (Express body-parser doesn't touch
  // multipart), so the guard would always 400 with
  // «Brak identyfikatora zasobu (body.carrierId)» for opiekun callers — even
  // though `carrierId` IS in the payload. The carrier-ownership check is
  // performed at the service layer via `_assertCarrierAccessibleForWrite`
  // (vehicles.service.ts), which runs after Zod parses the multipart body.
  @UseInterceptors(
    FileFieldsInterceptor(ATTACHMENT_UPLOAD_FIELDS, MULTIPART_OPTIONS),
  )
  @Audit({
    action: 'createVehicle',
    targetType: 'Vehicle',
    targetKey: (_req, result) => (result as { id?: string }).id,
    // Multipart + S3 upload: do NOT hold a DB transaction across the network
    // I/O to MinIO (avoids the 5s interactive-tx timeout and connection-pool
    // hold). Atomicity is provided by `_attachUploadsWithRollback`, which
    // removes uploaded objects + the vehicle row on any failure.
    manualTransaction: true,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: MultipartFiles,
  ): Promise<VehicleDto> {
    const dto: CreateVehicleDto = parseMultipartBody(
      rawBody,
      CreateVehicleSchema,
    );
    const uploads = collectAndValidateUploads(files);
    return this.vehicles.create(user, dto, uploads);
  }

  // Carriers are view-only for vehicles — the carrier panel renders a
  // read-only list/detail. Only admin/opiekun reach the mutating handlers,
  // so CarrierOwns is intentionally absent (opiekun-ownership is enough).
  // Mirrors the trailers controller pattern.
  @Patch(':id')
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @UseInterceptors(
    FileFieldsInterceptor(ATTACHMENT_UPLOAD_FIELDS, MULTIPART_OPTIONS),
  )
  @Audit({
    action: 'updateVehicle',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
    // Multipart + S3 upload — see createVehicle. Kept out of a DB transaction;
    // attachment add/remove failures are compensated in the service.
    manualTransaction: true,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: MultipartFiles,
  ): Promise<VehicleDto> {
    const dto: UpdateVehicleDto = parseMultipartBody(
      rawBody,
      UpdateVehicleSchema,
    );
    const uploads = collectAndValidateUploads(files);
    return this.vehicles.update(id, dto, uploads);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'vehicleId')
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
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'vehicleId')
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

  /**
   * Hard-delete (admin-only) per Phase 4.4. Mounted as a sibling of the
   * soft-delete endpoint; opiekun keeps soft-delete only by design (Phase
   * 4.4 roadmap line 327: "Hard-delete з обов'язковим `powod`"). `reason`
   * required, persisted to `audit_log.metadata.reason`.
   */
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
  @Audit({
    action: 'hardDeleteVehicle',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async hardDelete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonSchema))
    body: DeleteWithReasonDto,
  ): Promise<void> {
    await this.vehicles.hardDelete(id, body.reason);
  }

  // ── Attachments ──────────────────────────────────────────

  @Get(':id/attachments')
  @Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  async listAttachments(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<VehicleAttachmentDto[]> {
    return this.vehicles.listAttachments(id);
  }

  @Get(':id/attachments/:attachmentId/download')
  @Roles('admin', 'opiekun', 'planista', 'dyspozytor', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  async downloadAttachment(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType } =
      await this.vehicles.downloadAttachment(id, attachmentId);
    res.setHeader('Content-Type', object.contentType ?? mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${sanitizeFilename(fileName)}"`,
    );
    if (object.contentLength !== null) {
      res.setHeader('Content-Length', String(object.contentLength));
    }
    object.body.pipe(res);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  @Audit({
    action: 'deleteVehicleAttachment',
    targetType: 'VehicleAttachment',
    targetKey: (req) => req.params?.attachmentId,
  })
  async deleteAttachment(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
  ): Promise<void> {
    await this.vehicles.deleteAttachment(id, attachmentId);
  }

  // ── Route status (Phase 7 weryfikator board) ─────────────

  /**
   * Appends a manual route-status row for a vehicle («w trasie» / «zjechał»).
   * Weryfikator/admin only. Re-stamping the same status is allowed — a new row
   * is appended (no 409). When `status='zjechal'` the vehicle's `lastDroveAt`
   * is re-touched in the same `@Audit`-opened transaction (ambient `prisma.tx`
   * — append + mirror + audit row commit atomically). No ownership decorator:
   * the class-level ownership guards short-circuit for weryfikator/admin.
   */
  @Post(':id/route-status')
  @HttpCode(HttpStatus.CREATED)
  @Roles('weryfikator', 'admin')
  @Audit({
    action: 'vehicle.setRouteStatus',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async setRouteStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(SetVehicleRouteStatusSchema))
    dto: SetVehicleRouteStatusDto,
  ): Promise<VehicleRouteStatusLogDto> {
    return this.routeStatus.setStatus(user, id, dto);
  }

  /** Route-status history of one vehicle (newest-first). Weryfikator/admin. */
  @Get(':id/route-status')
  @Roles('weryfikator', 'admin')
  async getRouteStatus(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<VehicleRouteStatusLogDto[]> {
    return this.routeStatus.getHistory(id);
  }
}

/**
 * Coerces the raw multipart text fields (all strings) into the typed shape
 * the Zod schema expects, then validates. On failure the `ZodValidationPipe`
 * throws a 400 carrying the issues (formatted by the global RFC 7807 filter).
 *
 * The schema type is `z.ZodTypeAny` so `ZodEffects` schemas (those with
 * `.refine(...)`, e.g. `CreateVehicleSchema`) are accepted; the inferred
 * output type flows through `z.infer<S>` to the caller.
 */
function parseMultipartBody<S extends z.ZodTypeAny>(
  rawBody: Record<string, unknown>,
  schema: S,
): z.infer<S> {
  const coerced = coerceVehicleMultipartBody(rawBody ?? {});
  return new ZodValidationPipe<z.infer<S>>(schema).transform(coerced, {
    type: 'body',
  });
}

/**
 * Strips characters that would break the `Content-Disposition` header (CR/LF,
 * quotes). The original filename is only used for display.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, '_').slice(0, 200);
}
