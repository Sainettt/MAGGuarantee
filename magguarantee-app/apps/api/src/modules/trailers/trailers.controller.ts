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
  CreateTrailerSchema,
  DeleteWithReasonSchema,
  TrailerFiltersSchema,
  UpdateTrailerSchema,
  UuidSchema,
  type CreateTrailerDto,
  type DeleteWithReasonDto,
  type TrailerAttachmentDto,
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
import { coerceTrailerMultipartBody } from './multipart-coerce';
import {
  ATTACHMENT_FILE_FIELDS,
  MAX_ATTACHMENT_BYTES,
  MAX_FILES_PER_FIELD,
} from './trailer-attachments.constants';
import { TrailersService } from './trailers.service';

/**
 * `FileFieldsInterceptor` field config — one file field per attachment
 * category. multer keeps the bytes in memory (small files) so the service can
 * stream them straight to MinIO. Multipart field name: `certXl`.
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
 * Trailers REST surface per docs/13-api-design.md#trailers.
 *
 * Gates (docs/25 §3 B2, B5): every route carries `@RequirePermission`, checked
 * by the global `PermissionsGuard` and mirrored per route in the generated
 * fixture `common/authz/__fixtures__/endpoint-permissions.snapshot.json`; who
 * holds what is `ROLE_PERMISSIONS` in `@magguarantee/shared`:
 *  - `trailers.read` — list / detail / attachments list + download
 *    (admin, opiekun(own), przewoznik(own));
 *  - `fleet.write` — create / update / deactivate / reactivate / delete /
 *    attachment delete (admin, opiekun(own));
 *  - `fleet.hard_delete` — DELETE /hard (admin only).
 * Row scope stays on the role: the class-level ownership guards run the
 * `@OpiekunOwns` / `@CarrierOwns` checks ("(own)" above), and the service
 * narrows lists by role.
 */
@Controller('trailers')
@UseGuards(OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class TrailersController {
  private readonly logger = new Logger(TrailersController.name);

  constructor(private readonly trailers: TrailersService) {}

  @Get()
  @RequirePermission('trailers.read')
  async list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(TrailerFiltersSchema)) query: TrailerFilters,
  ): Promise<{ items: TrailerDto[]; nextCursor: string | null }> {
    return this.trailers.list(user, query);
  }

  @Get(':id')
  @RequirePermission('trailers.read')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  async getById(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TrailerDto> {
    return this.trailers.getById(id);
  }

  // Trailers are managed by `fleet.write` holders (admin/opiekun) ONLY —
  // carriers consume them but never create/edit. NOTE: deliberately NO
  // `@OpiekunOwns('carrierId','body','carrierId')` here. Guards run BEFORE
  // interceptors, and this endpoint uses
  // `FileFieldsInterceptor` (multer) to parse multipart/form-data — at guard
  // time `req.body` is still empty, so the guard would 400 for opiekun callers.
  // The carrier-ownership check runs at the service layer
  // (`_assertCarrierAccessibleForWrite`) after Zod parses the multipart body.
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('fleet.write')
  @UseInterceptors(
    FileFieldsInterceptor(ATTACHMENT_UPLOAD_FIELDS, MULTIPART_OPTIONS),
  )
  @Audit({
    action: 'createTrailer',
    targetType: 'Trailer',
    targetKey: (_req, result) => (result as { id?: string }).id,
    // Multipart + S3 upload: no DB transaction across the MinIO I/O — atomicity
    // via `_attachUploadsWithRollback` (removes objects + trailer row on fail).
    manualTransaction: true,
  })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: MultipartFiles,
  ): Promise<TrailerDto> {
    const dto: CreateTrailerDto = parseMultipartBody(
      rawBody,
      CreateTrailerSchema,
    );
    const uploads = collectAndValidateUploads(files);
    return this.trailers.create(user, dto, uploads);
  }

  @Patch(':id')
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'trailerId')
  @UseInterceptors(
    FileFieldsInterceptor(ATTACHMENT_UPLOAD_FIELDS, MULTIPART_OPTIONS),
  )
  @Audit({
    action: 'updateTrailer',
    targetType: 'Trailer',
    targetKey: (req) => req.params?.id,
    manualTransaction: true,
  })
  async update(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFiles() files: MultipartFiles,
  ): Promise<TrailerDto> {
    const dto: UpdateTrailerDto = parseMultipartBody(
      rawBody,
      UpdateTrailerSchema,
    );
    const uploads = collectAndValidateUploads(files);
    return this.trailers.update(id, dto, uploads);
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'trailerId')
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
  @RequirePermission('fleet.write')
  @OpiekunOwns('id', 'param', 'trailerId')
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
  @RequirePermission('fleet.write')
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

  /**
   * Hard-delete (`fleet.hard_delete`, admin-only) per Phase 4.4. `reason`
   * required, persisted to `audit_log.metadata.reason`.
   */
  @Delete(':id/hard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('fleet.hard_delete')
  @Audit({
    action: 'hardDeleteTrailer',
    targetType: 'Trailer',
    targetKey: (req) => req.params?.id,
  })
  async hardDelete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body(new ZodValidationPipe(DeleteWithReasonSchema))
    body: DeleteWithReasonDto,
  ): Promise<void> {
    await this.trailers.hardDelete(id, body.reason);
  }

  // ── Attachments ──────────────────────────────────────────

  @Get(':id/attachments')
  @RequirePermission('trailers.read')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  async listAttachments(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<TrailerAttachmentDto[]> {
    return this.trailers.listAttachments(id);
  }

  @Get(':id/attachments/:attachmentId/download')
  @RequirePermission('trailers.read')
  @OpiekunOwns('id', 'param', 'trailerId')
  @CarrierOwns('id', 'param', 'trailerId')
  async downloadAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType, category } =
      await this.trailers.downloadAttachment(id, attachmentId);
    // Access trail for trailer documents (not an audit row). Ids + category
    // only, never the original filename.
    this.logger.log({
      msg: 'attachment downloaded',
      entity: 'Trailer',
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
  @OpiekunOwns('id', 'param', 'trailerId')
  @Audit({
    action: 'deleteTrailerAttachment',
    targetType: 'TrailerAttachment',
    targetKey: (req) => req.params?.attachmentId,
  })
  async deleteAttachment(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
  ): Promise<void> {
    await this.trailers.deleteAttachment(id, attachmentId);
  }
}

/**
 * Coerces the raw multipart text fields into the typed shape the Zod schema
 * expects, then validates. On failure the `ZodValidationPipe` throws a 400.
 */
function parseMultipartBody<S extends z.ZodTypeAny>(
  rawBody: Record<string, unknown>,
  schema: S,
): z.infer<S> {
  const coerced = coerceTrailerMultipartBody(rawBody ?? {});
  return new ZodValidationPipe<z.infer<S>>(schema).transform(coerced, {
    type: 'body',
  });
}

/** Strips characters that would break the `Content-Disposition` header. */
function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, '_').slice(0, 200);
}
