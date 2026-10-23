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
  CreateDriverSchema,
  DeleteWithReasonSchema,
  DriverFiltersSchema,
  UpdateDriverSchema,
  UuidSchema,
  type CreateDriverDto,
  type DeleteWithReasonDto,
  type DriverAttachmentDto,
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
import { clientIp } from '../../common/utils/client-ip';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import {
  collectAndValidateUploads,
  type MultipartFiles,
} from './attachment-validation';
import {
  ATTACHMENT_FILE_FIELDS,
  MAX_ATTACHMENT_BYTES,
  MAX_FILES_PER_FIELD,
} from './driver-attachments.constants';
import { coerceDriverMultipartBody } from './multipart-coerce';
import { DriversService } from './drivers.service';

/**
 * `FileFieldsInterceptor` field config — one file field per attachment
 * category. multer keeps the bytes in memory (small files, ≤10 MB) so the
 * service can stream them straight to MinIO.
 *
 * Multipart field name (web MUST mirror exactly): `adr`.
 */
const ATTACHMENT_UPLOAD_FIELDS = ATTACHMENT_FILE_FIELDS.map(({ field }) => ({
  name: field,
  maxCount: MAX_FILES_PER_FIELD,
}));

const MULTIPART_OPTIONS = {
  storage: memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_BYTES,
    files: ATTACHMENT_FILE_FIELDS.length * MAX_FILES_PER_FIELD,
  },
};

/**
 * Drivers REST surface per docs/13-api-design.md#drivers.
 *
 * Gates (docs/25 §3 B2, B5): every route carries `@RequirePermission`, checked
 * by the global `PermissionsGuard` and mirrored per route in the generated
 * fixture `common/authz/__fixtures__/endpoint-permissions.snapshot.json`; who
 * holds what is `ROLE_PERMISSIONS` in `@magguarantee/shared`:
 *  - `drivers.read` — list / detail / attachments list + download
 *    (admin, opiekun(own), przewoznik(own));
 *  - `fleet.write` — create / update / deactivate / reactivate / delete /
 *    attachment delete (admin, opiekun(own));
 *  - `fleet.hard_delete` — DELETE /hard (admin only).
 * Row scope stays on the role: the class-level ownership guards run the
 * `@OpiekunOwns` / `@CarrierOwns` checks ("(own)" above), and the service
 * narrows lists by role.
 */
@Controller('drivers')
@UseGuards(OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class DriversController {
  private readonly logger = new Logger(DriversController.name);

  constructor(private readonly drivers: DriversService) {}

  @Get()
  @RequirePermission('drivers.read')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(DriverFiltersSchema)) query: DriverFilters,
  ): Promise<{ items: DriverDto[]; nextCursor: string | null }> {
    return this.drivers.list(user, query);
  }

  @Get(':id')
  @RequirePermission('drivers.read')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverDto> {
    return this.drivers.getById(id);
  }

  // Carriers are view-only for drivers — they consume the list/detail
  // endpoints but never create/edit. Only `fleet.write` holders (admin/opiekun)
  // reach the mutating handlers, so CarrierOwns is intentionally absent
  // (opiekun-ownership is enough). Mirrors the trailers controller pattern.
  //
  // NOTE: deliberately NO `@OpiekunOwns('carrierId', 'body', 'carrierId')`
  // here. Guards run BEFORE interceptors in NestJS, and this endpoint uses
  // `FileFieldsInterceptor` (multer) to parse multipart/form-data. At guard
  // time `req.body` is still empty, so the guard would 400 for opiekun
  // callers. The carrier-ownership check is performed at the service layer
  // (`DriversService._assertCarrierAccessibleForWrite`) after Zod parses the
  // multipart body — same caveat as the vehicle create endpoint.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('fleet.write')
  @UseInterceptors(
    FileFieldsInterceptor(ATTACHMENT_UPLOAD_FIELDS, MULTIPART_OPTIONS),
  )
  @Audit({
    action: 'createDriver',
    targetType: 'Driver',
    targetKey: (_req, result) => (result as { loginSlug?: string }).loginSlug,
    // Multipart + S3 upload: do NOT hold a DB transaction across the network
    // I/O to MinIO. Atomicity is provided by `_attachUploadsWithRollback`,
    // which removes uploaded objects + the driver row on any failure.
    manualTransaction: true,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: MultipartFiles,
  ): Promise<DriverDto> {
    const dto: CreateDriverDto = parseMultipartBody(rawBody, CreateDriverSchema);
    const uploads = collectAndValidateUploads(files);
    return this.drivers.create(user, dto, uploads);
  }

  @Patch(':id')
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'driverId')
  @UseInterceptors(
    FileFieldsInterceptor(ATTACHMENT_UPLOAD_FIELDS, MULTIPART_OPTIONS),
  )
  @Audit({
    action: 'updateDriver',
    targetType: 'Driver',
    targetKey: (req) => req.params?.id,
    // Multipart + S3 upload — see createDriver. Kept out of a DB transaction;
    // attachment add/remove failures are compensated in the service.
    manualTransaction: true,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: MultipartFiles,
  ): Promise<DriverDto> {
    const dto: UpdateDriverDto = parseMultipartBody(rawBody, UpdateDriverSchema);
    const uploads = collectAndValidateUploads(files);
    return this.drivers.update(id, dto, uploads);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'driverId')
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
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'driverId')
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
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'driverId')
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

  /**
   * Hard-delete (`fleet.hard_delete`, admin-only) per Phase 4.4. Mounted as a
   * sibling of the soft-delete endpoint. `reason` required, persisted to
   * `audit_log.metadata.reason`.
   */
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('fleet.hard_delete')
  @Audit({
    action: 'hardDeleteDriver',
    targetType: 'Driver',
    targetKey: (req) => req.params?.id,
  })
  async hardDelete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonSchema))
    body: DeleteWithReasonDto,
  ): Promise<void> {
    await this.drivers.hardDelete(id, body.reason);
  }

  // ── Attachments ──────────────────────────────────────────

  @Get(':id/attachments')
  @RequirePermission('drivers.read')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async listAttachments(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverAttachmentDto[]> {
    return this.drivers.listAttachments(id);
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermission('drivers.read')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async downloadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType, category } =
      await this.drivers.downloadAttachment(id, attachmentId);
    // Access trail for driver scans (ADR certificate — personal data). Not an
    // audit row. Ids + category only, never the original filename (often the
    // driver's name).
    this.logger.log({
      msg: 'attachment downloaded',
      entity: 'Driver',
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

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'driverId')
  @Audit({
    action: 'deleteDriverAttachment',
    targetType: 'DriverAttachment',
    targetKey: (req) => req.params?.attachmentId,
  })
  async deleteAttachment(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
  ): Promise<void> {
    await this.drivers.deleteAttachment(id, attachmentId);
  }
}

/**
 * Coerces the raw multipart text fields (all strings) into the typed shape
 * the Zod schema expects, then validates. On failure the `ZodValidationPipe`
 * throws a 400 carrying the issues (formatted by the global RFC 7807 filter).
 */
function parseMultipartBody<S extends z.ZodTypeAny>(
  rawBody: Record<string, unknown>,
  schema: S,
): z.infer<S> {
  const coerced = coerceDriverMultipartBody(rawBody ?? {});
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
