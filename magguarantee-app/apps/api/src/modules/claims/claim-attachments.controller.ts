import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';

import { UuidSchema, type ClaimDto } from '@magguarantee/shared';

import {
  MAX_ATTACHMENT_BYTES,
  type UploadedFile as AttachmentFile,
} from '../../common/attachments';
import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { clientIp } from '../../common/utils/client-ip';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ClaimAttachmentsService } from './claim-attachments.service';

/** The single multipart file field name. Web MUST use this exact name. */
const ATTACHMENT_FILE_FIELD = 'file';

const MULTIPART_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1 },
};

/**
 * Maksim-authorization confirmation-screenshot endpoints (the ADDITIVE gate on
 * `NA_WERYFIKACJI`) per docs/13-api-design.md#claims + brief §2.5.
 *
 * Mounted at `claims/:nrZgl/authorization-confirmation`. Both routes require
 * `claims.verify` (docs/25 §3 B2; global `PermissionsGuard`), held only by
 * `admin` / `pracownik` (the verifier who takes the decision). `opiekun` /
 * `przewoznik` do not hold it: the gate is a verification-desk concern.
 */
@Controller('claims/:nrZgl/authorization-confirmation')
export class ClaimAttachmentsController {
  private readonly logger = new Logger(ClaimAttachmentsController.name);

  constructor(private readonly attachments: ClaimAttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('claims.verify')
  @UseInterceptors(FileInterceptor(ATTACHMENT_FILE_FIELD, MULTIPART_OPTIONS))
  @Audit({
    action: 'claim.authorizationConfirmation',
    targetType: 'Claim',
    targetKey: (req) => req.params?.nrZgl,
    // Multipart + S3 upload: do NOT hold a DB transaction across the network
    // I/O to MinIO. The service compensates a failed row insert / claim stamp
    // by removing the just-uploaded object (and orphan row).
    manualTransaction: true,
  })
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @UploadedFile() file: AttachmentFile | undefined,
  ): Promise<ClaimDto> {
    return this.attachments.uploadConfirmation(user, nrZgl, file);
  }

  @Get(':attachmentId/download')
  @RequirePermission('claims.verify')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('nrZgl') nrZgl: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const { object, mimeType, category } = await this.attachments.download(
      nrZgl,
      attachmentId,
    );
    // Access trail for the Maksim confirmation screenshot (not an audit row).
    this.logger.log({
      msg: 'attachment downloaded',
      entity: 'Claim',
      nrZgl,
      attachmentId,
      category,
      userId: user.sub,
      role: user.role,
      ip: clientIp(req) ?? null,
    });
    res.setHeader('Content-Type', object.contentType ?? mimeType);
    res.setHeader(
      'Content-Disposition',
      'inline; filename="potwierdzenie-autoryzacji"',
    );
    if (object.contentLength !== null) {
      res.setHeader('Content-Length', String(object.contentLength));
    }
    object.body.pipe(res);
  }
}
