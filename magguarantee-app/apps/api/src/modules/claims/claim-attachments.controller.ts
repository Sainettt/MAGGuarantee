import {
  Controller,
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

import { UuidSchema, type ClaimDto } from '@magguarantee/shared';

import {
  MAX_ATTACHMENT_BYTES,
  type UploadedFile as AttachmentFile,
} from '../../common/attachments';
import { Audit } from '../../common/audit';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
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
 * Mounted at `claims/:nrZgl/authorization-confirmation`. Internal roles only —
 * `admin` / `pracownik` (the verifier who takes the decision). `opiekun` /
 * `przewoznik` are excluded: the gate is a verification-desk concern.
 */
@Controller('claims/:nrZgl/authorization-confirmation')
@UseGuards(RolesGuard)
export class ClaimAttachmentsController {
  constructor(private readonly attachments: ClaimAttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('admin', 'pracownik')
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
  @Roles('admin', 'pracownik')
  async download(
    @Param('nrZgl') nrZgl: string,
    @Param('attachmentId', new ZodValidationPipe(UuidSchema))
    attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { object, mimeType } = await this.attachments.download(
      nrZgl,
      attachmentId,
    );
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
