import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import type { z } from 'zod';

import {
  CreateVehicleSchema,
  DeleteVehicleDailyKmQuerySchema,
  KmBoardQuerySchema,
  SetVehicleDailyKmSchema,
  UpdateVehicleSchema,
  UuidSchema,
  VehicleDailyKmHistoryQuerySchema,
  VehicleFiltersSchema,
  type CreateVehicleDto,
  type DeleteVehicleDailyKmQuery,
  type KmBoardQuery,
  type SetVehicleDailyKmDto,
  type UpdateVehicleDto,
  type VehicleAttachmentDto,
  type VehicleDailyKmDto,
  type VehicleDailyKmHistoryQuery,
  type VehicleDto,
  type VehicleFilters,
  type VehicleKmBoardDto,
} from '@magguarantee/shared';

import { Audit } from '../../common/audit';
import {
  CarrierOwnershipGuard,
  CarrierOwns,
  OpiekunOwnershipGuard,
  OpiekunOwns,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clientIp } from '../../common/utils/client-ip';
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
import { VehicleDailyKmService } from './vehicle-daily-km.service';
import { VehiclesService } from './vehicles.service';

/**
 * `FileFieldsInterceptor` field config — one file field per attachment
 * category, each accepting up to `MAX_FILES_PER_FIELD` files. multer keeps
 * the bytes in memory (small files, ≤10 MB) so the service can stream them
 * straight to MinIO.
 *
 * Multipart field names (web MUST mirror exactly): `gps`, `agreement`,
 * `cabotageDeInsurance`.
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
  private readonly logger = new Logger(VehiclesController.name);

  constructor(
    private readonly vehicles: VehiclesService,
    private readonly dailyKm: VehicleDailyKmService,
  ) {}

  /**
   * Weryfikator km-board (Phase 7 REWORK #3) — ALL active vehicles with their
   * 7 day-cells for the resolved week, period km sum, and derived motion
   * status. Declared BEFORE `GET /:id` so the literal `km-board` segment is
   * matched first (Express matches in declaration order). A dedicated endpoint
   * — NOT an overload of the ownership-scoped `GET /vehicles` — so the board is
   * never narrowed by carrier/opiekun scope. `RolesGuard` does the gate; the
   * class-level ownership guards short-circuit (no `@*Owns` decorator here).
   * Replaces the former `GET /vehicles/route-board`.
   */
  @Get('km-board')
  @Roles('weryfikator', 'admin')
  async kmBoard(
    @Query(new ZodValidationPipe(KmBoardQuerySchema)) query: KmBoardQuery,
  ): Promise<VehicleKmBoardDto> {
    return this.dailyKm.getBoard(query);
  }

  /**
   * Read-only km-report (Phase 7 REWORK #3 + §7.8 "my vehicles km" tab) — same
   * weekly grid, scoped by role SERVER-SIDE (resolved in the service from the
   * JWT, never a client param): planista → own `plannerId`; dyspozytor → their
   * `dispatchTeamId` (Phase 11); przewoznik → their OWN carrier; opiekun → the carriers they
   * supervise; eksport / admin / weryfikator → all. The drove-only narrowing is
   * preserved for planista/dyspozytor/eksport/admin/weryfikator; przewoznik /
   * opiekun see their FULL fleet incl. non-driving vehicles (service-derived
   * `includeIdle` — NO new query param, contract unchanged per
   * docs/14-design-system.md §7.8.7). Declared before `GET /:id` for
   * literal-segment match.
   */
  @Get('km-report')
  @Roles(
    'planista',
    'dyspozytor',
    'eksport',
    'admin',
    'weryfikator',
    'przewoznik',
    'opiekun',
  )
  async kmReport(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(KmBoardQuerySchema)) query: KmBoardQuery,
  ): Promise<VehicleKmBoardDto> {
    return this.dailyKm.getReport(query, user);
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
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<VehicleDto> {
    return this.vehicles.getById(user, id);
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

  // Vehicle hard-delete (`DELETE /vehicles/:id/hard`) was RETIRED in the
  // vehicle-status rework (Step B): admin deletion is now a plain soft-delete
  // (`DELETE /vehicles/:id` above), keeping the row + plate on record so the
  // future "no re-add for 3 months" rule has an anchor. See
  // docs/13-api-design.md#vehicles.

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
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType, category } =
      await this.vehicles.downloadAttachment(id, attachmentId);
    // Access trail for vehicle documents (not an audit row). Ids + category
    // only, never the original filename.
    this.logger.log({
      msg: 'attachment downloaded',
      entity: 'Vehicle',
      entityId: id,
      attachmentId,
      category,
      userId: user.sub,
      role: user.role,
      ip: clientIp(req) ?? null,
    });
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

  // Carrier fleet is READ-ONLY (docs/03-roles.md#przewoznik): przewoznik must
  // NOT delete vehicle attachments (compliance scans — porozumienie / GPS /
  // cabotage — that gate readiness). admin/opiekun only. CarrierOwns is dropped
  // with the role; OpiekunOwns still scopes opiekun to their carriers.
  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'vehicleId')
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

  // ── Daily km (Phase 7 REWORK #3 weryfikator km-board) ────

  /**
   * UPSERTs one (vehicle, day) km mark. Weryfikator/admin only. `state='drove'`
   * requires `km>0`; `state='idle'` forbids `km`. Re-stamping a day overwrites
   * the previous mark (unique on (vehicleId, date)). When `state='drove'` the
   * vehicle's `lastDroveAt` is bumped to `max(lastDroveAt, date)` in the same
   * `@Audit`-opened transaction (ambient `prisma.tx` — upsert + bump + audit
   * row commit atomically). No ownership decorator: the class-level ownership
   * guards short-circuit for weryfikator/admin. Replaces the former
   * `POST /vehicles/:id/route-status`.
   */
  @Put(':id/daily-km')
  @HttpCode(HttpStatus.OK)
  @Roles('weryfikator', 'admin')
  @Audit({
    action: 'vehicle.setDailyKm',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async setDailyKm(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(SetVehicleDailyKmSchema))
    dto: SetVehicleDailyKmDto,
  ): Promise<VehicleDailyKmDto> {
    return this.dailyKm.setDailyKm(user, id, dto);
  }

  /**
   * Clears ONE (vehicle, day) km mark via `?date=YYYY-MM-DD`, returning the
   * cell to «not checked» (row absence). Weryfikator/admin only — mirrors the
   * PUT write gate; no ownership decorator (the class-level ownership guards
   * short-circuit for these roles). IDEMPOTENT: clearing an already-absent /
   * «not checked» cell still returns 204, never 404 (the service uses
   * `deleteMany`). `Vehicle.lastDroveAt` is left untouched on delete (it only
   * ever moves forward — see the service note). The delete + audit row commit
   * atomically in the `@Audit`-opened transaction (ambient `prisma.tx`).
   */
  @Delete(':id/daily-km')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('weryfikator', 'admin')
  @Audit({
    action: 'vehicle.clearDailyKm',
    targetType: 'Vehicle',
    targetKey: (req) => req.params?.id,
  })
  async clearDailyKm(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Query(new ZodValidationPipe(DeleteVehicleDailyKmQuerySchema))
    query: DeleteVehicleDailyKmQuery,
  ): Promise<void> {
    await this.dailyKm.clearDailyKm(user, id, query.date);
  }

  /**
   * Daily-km history of one vehicle (newest-first), optionally bounded by
   * `?from&to` (date-only, inclusive). Drives the «Historia» modal for
   * weryfikator/admin AND the carrier panel's km-calendar for przewoznik.
   *
   * Access mirrors `GET /vehicles/:id` (getById) so the read fans out by role
   * exactly like vehicle detail:
   *  - weryfikator / admin / planista / dyspozytor / eksport → read any vehicle
   *    (ownership guards short-circuit for these roles — see below). `eksport`
   *    has all-access read on outflows and the related km (same posture as the
   *    km-report scope) — its read-only delegation modal renders the vehicle's
   *    km-calendar (DelegationKmCalendar → useVehicleDailyKmHistory), so it must
   *    reach this endpoint for ANY vehicle. The WRITE side stays weryfikator/
   *    admin-only;
   *  - opiekun → only vehicles of carriers they supervise
   *    (`OpiekunOwnershipGuard` resolves vehicleId → carrierId → opiekunId);
   *  - przewoznik → only their OWN vehicles (`CarrierOwnershipGuard` resolves
   *    vehicleId → carrierId and compares to the caller's carrier profile;
   *    a foreign vehicle yields 403 → no IDOR).
   *
   * Both ownership guards are no-ops for the roles they don't govern:
   * `CarrierOwnershipGuard` returns early unless role==='przewoznik';
   * `OpiekunOwnershipGuard` bypasses admin and returns early unless
   * role==='opiekun'. So weryfikator (and the rest) keep full «Historia»
   * access despite the `@*Owns` decorators.
   *
   * The WRITE side (`PUT :id/daily-km`) stays weryfikator/admin-only — carriers
   * and planners never edit km. Replaces the former `GET /vehicles/:id/route-status`.
   */
  @Get(':id/daily-km')
  @Roles(
    'admin',
    'opiekun',
    'planista',
    'dyspozytor',
    'przewoznik',
    'weryfikator',
    'eksport',
  )
  @OpiekunOwns('id', 'param', 'vehicleId')
  @CarrierOwns('id', 'param', 'vehicleId')
  async getDailyKm(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Query(new ZodValidationPipe(VehicleDailyKmHistoryQuerySchema))
    query: VehicleDailyKmHistoryQuery,
  ): Promise<VehicleDailyKmDto[]> {
    return this.dailyKm.getHistory(id, query);
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
