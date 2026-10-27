import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';

import {
  UploadCarrierAttachmentSchema,
  UuidSchema,
  type CarrierAttachmentDto,
  type UploadCarrierAttachmentDto,
} from '@magguarantee/shared';

import { type UploadedFile as AttachmentFile } from '../../common/attachments';
import { Audit } from '../../common/audit';
import {
  CarrierOwns,
  CarrierOwnershipGuard,
  OpiekunOwns,
  OpiekunOwnershipGuard,
} from '../../common/guards';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clientIp } from '../../common/utils/client-ip';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
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
 * Mounted at `carriers/:id/attachments`. Gates (docs/25 §3 B2; global
 * `PermissionsGuard`; mirrored per route in the generated fixture
 * `common/authz/__fixtures__/endpoint-permissions.snapshot.json`):
 * `carrier_documents.read` (list, download), `.add` (upload), `.delete`
 * (delete). By role all three are held by admin and opiekun; since B6
 * (docs/25 §3 B6, first real case) an admin can grant `.read` / `.add` — never
 * `.delete` — to ONE przewoznik (`User.extraPermissions`, `GRANTABLE_EXTRA`).
 *
 * Scope is the two ownership guards, because neither service has a role
 * branch — the guards ARE the scope. The carrier `:id` is a route param on
 * every endpoint, including the multipart upload, so both work without
 * reading the body (guards run before the multer interceptor):
 *  - `OpiekunOwnershipGuard` (`@OpiekunOwns('id','param','carrierId')`) — an
 *    opiekun only on carriers where `opiekunId = user.sub`; every other role
 *    passes;
 *  - `CarrierOwnershipGuard` (`@CarrierOwns('id','param','carrierId')`) — a
 *    przewoznik only on his OWN carrier (`Carrier.userId = user.sub`), 403 on
 *    anyone else's; every other role passes. On DELETE it is defence in depth:
 *    `.delete` is not grantable to a przewoznik, so `PermissionsGuard` already
 *    answers 403.
 * `pracownik` holds no `carrier_documents.*` permission (claims-only role per
 * docs/03-roles.md#pracownik).
 */
@Controller('carriers/:id/attachments')
@UseGuards(OpiekunOwnershipGuard, CarrierOwnershipGuard)
export class CarrierAttachmentsController {
  private readonly logger = new Logger(CarrierAttachmentsController.name);

  constructor(private readonly attachments: CarrierAttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('carrier_documents.add')
  @OpiekunOwns('id', 'param', 'carrierId')
  @CarrierOwns('id', 'param', 'carrierId')
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
  @RequirePermission('carrier_documents.read')
  @OpiekunOwns('id', 'param', 'carrierId')
  @CarrierOwns('id', 'param', 'carrierId')
  async list(
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
  ): Promise<CarrierAttachmentDto[]> {
    return this.attachments.list(id);
  }

  @Get(':attachmentId/download')
  @RequirePermission('carrier_documents.read')
  @OpiekunOwns('id', 'param', 'carrierId')
  @CarrierOwns('id', 'param', 'carrierId')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', new ZodValidationPipe(UuidSchema)) id: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { object, fileName, mimeType, category } =
      await this.attachments.download(id, attachmentId);
    // Access trail for carrier documents (not an audit row — reads are not
    // audited). Ids + category only: the original filename can carry PII.
    this.logger.log({
      msg: 'attachment downloaded',
      entity: 'Carrier',
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

  @Delete(':attachmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('carrier_documents.delete')
  @OpiekunOwns('id', 'param', 'carrierId')
  @CarrierOwns('id', 'param', 'carrierId')
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
