import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import {
  UploadCarrierAttachmentSchema,
  UuidSchema,
  type CarrierAttachmentDto,
  type UploadCarrierAttachmentDto,
} from '@magguarantee/shared';

import { type UploadedFile as AttachmentFile } from '../../common/attachments';
import { Audit } from '../../common/audit';
import { OpiekunOwns, OpiekunOwnershipGuard } from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CarrierAttachmentsService } from './carrier-attachments.service';
import {
  ATTACHMENT_FILE_FIELD,
  MAX_ATTACHMENT_BYTES,
} from './carrier-attachments.constants';

const MULTIPART_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
};

/**
 * Standalone carrier-document endpoints per docs/13-api-design.md#carriers.
 *
 * Mounted at `carriers/:id/attachments`. Role gating mirrors the carrier CRUD
 * surface: admin / opiekun(own). The carrier `:id` is a route param on every
 * endpoint — including the multipart upload — so `OpiekunOwnershipGuard`
 * (`@OpiekunOwns('id','param','carrierId')`) enforces opiekun ownership
 * without needing to read the request body. `pracownik` is intentionally
 * excluded (claims-only role per docs/03-roles.md#pracownik).
 */
@Controller('carriers/:id/attachments')
@UseGuards(RolesGuard, OpiekunOwnershipGuard)
export class CarrierAttachmentsController {
  constructor(private readonly attachments: CarrierAttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  @UseInterceptors(FileInterceptor(ATTACHMENT_FILE_FIELD, MULTIPART_OPTIONS))
  @Audit({
    action: 'uploadCarrierAttachment',
    targetType: 'CarrierAttachment',
    targetKey: (_req, result) => (result as { id?: string }).id,
    // Multipart + S3 upload: do NOT hold a DB transaction across the network
    // I/O to MinIO. The service compensates a failed row insert by removing
    // the just-uploaded object.
    manualTransaction: true,
  })
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Body() rawBody: Record<string, unknown>,
    @UploadedFile() file: AttachmentFile | undefined,
  ): Promise<CarrierAttachmentDto> {
    const { category }: UploadCarrierAttachmentDto = new ZodValidationPipe(
      UploadCarrierAttachmentSchema,
    ).transform(rawBody ?? {}, { type: 'body' });
    return this.attachments.upload(user, id, category, file);
  }

  @Get()
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  async list(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierAttachmentDto[]> {
    return this.attachments.list(id);
  }

  @Get(':attachmentId/download')
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  async download(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType } = await this.attachments.download(
      id,
      attachmentId,
    );
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

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'opiekun')
  @OpiekunOwns('id', 'param', 'carrierId')
  @Audit({
    action: 'deleteCarrierAttachment',
    targetType: 'CarrierAttachment',
    targetKey: (req) => req.params?.attachmentId,
  })
  async delete(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
  ): Promise<void> {
    await this.attachments.delete(id, attachmentId);
  }
}

/**
 * Strips characters that would break the `Content-Disposition` header (CR/LF,
 * quotes). The original filename is only used for display.
 */
function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n]/g, '_').slice(0, 200);
}
