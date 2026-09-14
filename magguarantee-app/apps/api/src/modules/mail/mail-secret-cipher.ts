import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { Env } from '../../config/env.schema';
import type { SealedSecret } from './email-send.job';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
/**
 * HKDF domain separation. The master secret is shared with JWT signing, so the
 * derived key must be cryptographically independent of it: a distinct salt +
 * info pair guarantees that, and bumping the version label rotates the mail
 * key without touching JWT.
 */
const HKDF_SALT = 'magguarantee/email-send/secret-envelope';
const HKDF_INFO = 'aes-256-gcm/v1';

const SealedSecretSchema = z.object({
  v: z.literal(1),
  iv: z.string().min(1),
  tag: z.string().min(1),
  ct: z.string().min(1),
});
const SecretPayloadSchema = z.record(z.string());

/** Raised when an envelope is missing, malformed, tampered or undecryptable. */
export class MailSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailSecretError';
  }
}

/**
 * Authenticated encryption for the secret part of `email-send` jobs
 * (2026-08-14 logging audit, item 5).
 *
 * BullMQ keeps job data in Redis — replicated to disk by AOF, visible to
 * anyone with `redis-cli`, retained after completion. A 2FA code, a reset code
 * or a temporary password must not sit there readable. The producer seals
 * `{ code }` / `{ temporaryPassword }` into an AES-256-GCM envelope; the
 * processor opens it immediately before rendering and never logs it.
 *
 * Key: HKDF-SHA256 over `JWT_REFRESH_SECRET` (already required, ≥32 chars) with
 * a mail-specific salt/info — no new mandatory env. Consequence worth knowing:
 * rotating `JWT_REFRESH_SECRET` makes envelopes of jobs still waiting in the
 * queue undecryptable; those jobs fail permanently (logged, alerted,
 * `email_logs` row) and the user re-requests the code / the admin re-issues
 * the password. That window is minutes for codes and seconds for passwords.
 *
 * The template name is bound as GCM associated data, so an envelope lifted
 * from one job cannot be replayed into another template.
 */
@Injectable()
export class MailSecretCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService<Env, true>) {
    this.key = MailSecretCipher.deriveKey(
      config.get('JWT_REFRESH_SECRET', { infer: true }),
    );
  }

  static deriveKey(masterSecret: string): Buffer {
    return Buffer.from(
      hkdfSync('sha256', masterSecret, HKDF_SALT, HKDF_INFO, KEY_BYTES),
    );
  }

  seal(template: string, secret: Record<string, string>): SealedSecret {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv, {
      authTagLength: TAG_BYTES,
    });
    cipher.setAAD(aad(template));
    const ct = Buffer.concat([
      cipher.update(JSON.stringify(secret), 'utf8'),
      cipher.final(),
    ]);
    return {
      v: 1,
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ct: ct.toString('base64url'),
    };
  }

  /**
   * Opens an envelope read back from Redis (hence `unknown`). Throws
   * `MailSecretError` — whose message never contains envelope bytes — on any
   * structural problem, authentication failure or foreign template binding.
   */
  open(template: string, sealed: unknown): Record<string, string> {
    const parsed = SealedSecretSchema.safeParse(sealed);
    if (!parsed.success) {
      throw new MailSecretError('mail job secret envelope is missing or malformed');
    }
    let plaintext: string;
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.key,
        Buffer.from(parsed.data.iv, 'base64url'),
        { authTagLength: TAG_BYTES },
      );
      decipher.setAAD(aad(template));
      decipher.setAuthTag(Buffer.from(parsed.data.tag, 'base64url'));
      plaintext = Buffer.concat([
        decipher.update(Buffer.from(parsed.data.ct, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Wrong key (rotated secret), tampered bytes or another template's
      // envelope — GCM does not say which, and neither do we.
      throw new MailSecretError('mail job secret envelope could not be decrypted');
    }
    const payload = SecretPayloadSchema.safeParse(safeJson(plaintext));
    if (!payload.success) {
      throw new MailSecretError('mail job secret payload has an unexpected shape');
    }
    return payload.data;
  }

  /** `open` + pick one required string field. */
  openField(template: string, sealed: unknown, field: string): string {
    const value = this.open(template, sealed)[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new MailSecretError(`mail job secret is missing the "${field}" field`);
    }
    return value;
  }
}

function aad(template: string): Buffer {
  return Buffer.from(`email-send:${template}`, 'utf8');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
