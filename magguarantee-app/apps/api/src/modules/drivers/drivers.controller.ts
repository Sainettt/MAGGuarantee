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

@Controller('drivers')
@UseGuards(RolesGuard, OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Get()
  @Roles('admin', 'opiekun', 'przewoznik')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(DriverFiltersSchema)) query: DriverFilters,
  ): Promise<{ items: DriverDto[]; nextCursor: string | null }> {
    return this.drivers.list(user, query);
  }

  @Get(':id')
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverDto> {
    return this.drivers.getById(id);
  }

  // Carriers are view-only for drivers — they consume the list/detail
  // endpoints but never create/edit. Only admin/opiekun reach the mutating
  // handlers, so CarrierOwns is intentionally absent (opiekun-ownership is
  // enough). Mirrors the trailers controller pattern.
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
  @Roles('admin', 'opiekun')
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
  @Roles('admin', 'opiekun')
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
  @Roles('admin', 'opiekun')
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
  @Roles('admin', 'opiekun')
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
  @Roles('admin', 'opiekun')
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
   * Hard-delete (admin-only) per Phase 4.4. Mounted as a sibling of the
   * soft-delete endpoint. `reason` required, persisted to
   * `audit_log.metadata.reason`.
   */
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin')
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
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async listAttachments(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<DriverAttachmentDto[]> {
    return this.drivers.listAttachments(id);
  }

  @Get(':id/attachments/:attachmentId/download')
  @Roles('admin', 'opiekun', 'przewoznik')
  @OpiekunOwns('id', 'param', 'driverId')
  @CarrierOwns('id', 'param', 'driverId')
  async downloadAttachment(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType } =
      await this.drivers.downloadAttachment(id, attachmentId);
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
  @Roles('admin', 'opiekun')
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
