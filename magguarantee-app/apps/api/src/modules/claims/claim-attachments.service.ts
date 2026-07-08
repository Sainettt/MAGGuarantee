import { randomUUID } from 'node:crypto';

import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type { ClaimDto } from '@magguarantee/shared';

import {
  assertUploadAllowed,
  storageKeyExtension,
  type UploadedFile,
} from '../../common/attachments';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { StorageService, type StorageObject } from '../storage/storage.service';
import { ClaimAttachmentsRepository } from './claim-attachments.repository';
import { ClaimsRepository, type ClaimRow } from './claims.repository';
import { ClaimsService } from './claims.service';

/**
 * Maksim-authorization confirmation-screenshot management (the ADDITIVE gate on
 * `NA_WERYFIKACJI`, docs/13-api-design.md#claims + brief §2.5).
 *
 * The verifier uploads a screenshot of Maksim's out-of-band confirmation to
 * lift the over-threshold decision block. Upload validates the file (MIME /
 * size), puts the bytes to MinIO, inserts a `ClaimAttachment` tagged
 * `AUTORYZACJA_MAKSIMA`, AND stamps the claim's gate-clear fields
 * (`maksimGateClearedAt` / `maksimGateClearedById`) — co-located with the claim
 * write per the brief. On a DB failure after the object lands the object is
 * removed (orphan cleanup), mirroring the carrier-attachments pattern.
 *
 * Guard: the claim must be `NA_WERYFIKACJI`, `maksimGateRequired === true`, and
 * `verifiedAt != null` (else 422) — you can only confirm a verified,
 * over-threshold claim whose gate is actually armed.
 */
@Injectable()
export class ClaimAttachmentsService {
  private readonly logger = new Logger(ClaimAttachmentsService.name);

  constructor(
    private readonly claims: ClaimsRepository,
    private readonly attachments: ClaimAttachmentsRepository,
    private readonly storage: StorageService,
    private readonly claimsService: ClaimsService,
  ) {}

  /**
   * Uploads the Maksim confirmation screenshot and lifts the gate. Returns the
   * fresh `ClaimDto` so the web re-renders the (now unblocked) decision.
   */
  async uploadConfirmation(
    user: AuthUser,
    nrZgl: string,
    file: UploadedFile | undefined,
  ): Promise<ClaimDto> {
    const claim = await this._loadGatedClaim(nrZgl);
    if (!file) {
      throw new NotFoundException('Brak pliku w żądaniu');
    }
    assertUploadAllowed(file);

    const key = `claims/${nrZgl.replace(/\//g, '_')}/authorization/${randomUUID()}.${storageKeyExtension(
      file.mimetype,
    )}`;
    await this.storage.put(key, file.buffer, file.mimetype);

    let attachmentId: string | null = null;
    try {
      const row = await this.attachments.create({
        claimId: claim.id,
        category: 'AUTORYZACJA_MAKSIMA',
        url: key,
        mimeType: file.mimetype,
        size: file.size,
        uploadedById: user.sub,
      });
      attachmentId = row.id;

      // Co-located gate-clear stamp on the claim itself. `maksimGateRequired`
      // stays `true` (the decision was over threshold) — the presence of
      // `maksimGateClearedAt` is what unblocks the decision guard.
      const updated = await this.claims.update(claim.id, {
        maksimGateClearedAt: new Date(),
        maksimGateClearedById: user.sub,
      });
      return this.claimsService.toDto(updated);
    } catch (err) {
      // The blob landed (and maybe the row) but a later write failed — drop the
      // orphan object and the orphan row so no dangling state survives.
      if (attachmentId) await this._deleteAttachmentRow(attachmentId);
      await this._deleteStorageObject(key);
      throw err;
    }
  }

  /**
   * Returns the byte stream + metadata for the download proxy. MinIO is not
   * publicly reachable — downloads go through the API. Internal roles only
   * (enforced at the controller). The attachment must belong to the claim and
   * be the confirmation category.
   */
  async download(
    nrZgl: string,
    attachmentId: string,
  ): Promise<{ object: StorageObject; mimeType: string }> {
    const claim = await this.claims.findByNrZgl(nrZgl);
    if (!claim) throw new NotFoundException('Wniosek nie znaleziony');
    const att = await this.attachments.findById(attachmentId);
    if (
      !att ||
      att.claimId !== claim.id ||
      att.category !== 'AUTORYZACJA_MAKSIMA'
    ) {
      throw new NotFoundException('Załącznik nie znaleziony');
    }
    const object = await this.storage.getObject(att.url);
    return { object, mimeType: att.mimeType ?? 'application/octet-stream' };
  }

  // ── internals ────────────────────────────────────────────

  /**
   * Loads the claim and asserts it is in the state where a confirmation upload
   * is valid: `NA_WERYFIKACJI`, gate armed, and verified. 404 when missing,
   * 422 otherwise.
   */
  private async _loadGatedClaim(nrZgl: string): Promise<ClaimRow> {
    const claim = await this.claims.findByNrZgl(nrZgl);
    if (!claim) throw new NotFoundException('Wniosek nie znaleziony');
    if (
      claim.status !== 'NA_WERYFIKACJI' ||
      !claim.maksimGateRequired ||
      claim.verifiedAt === null
    ) {
      throw new UnprocessableEntityException({
        code: 'CLAIM_AUTHORIZATION_NOT_APPLICABLE',
        message:
          'Potwierdzenie autoryzacji można wgrać tylko dla zweryfikowanego wniosku wymagającego autoryzacji.',
        // Surface the machine code under `extensions` so the global
        // `ProblemDetailsFilter` lifts it into the RFC-7807 body (a top-level
        // `code` alone is dropped). Web reads `body.extensions.code`.
        extensions: { code: 'CLAIM_AUTHORIZATION_NOT_APPLICABLE' },
      });
    }
    return claim;
  }

  /** Best-effort MinIO object delete — logs but never throws (idempotent). */
  private async _deleteStorageObject(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (e) {
      this.logger.error(
        { err: e, key },
        'Failed to remove claim authorization attachment storage object',
      );
    }
  }

  /** Best-effort attachment-row hard-delete — logs but never throws. */
  private async _deleteAttachmentRow(id: string): Promise<void> {
    try {
      await this.attachments.hardDelete(id);
    } catch (e) {
      this.logger.error(
        { err: e, id },
        'Failed to remove orphan claim authorization attachment row',
      );
    }
  }
}
