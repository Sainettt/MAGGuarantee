// AES-256-GCM envelope for secrets in `email-send` job data
// (2026-08-14 logging audit, item 5).

import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { MailSecretCipher, MailSecretError } from './mail-secret-cipher';

const SECRET_A = 'a'.repeat(48);
const SECRET_B = 'b'.repeat(48);

function cipherWith(secret: string): MailSecretCipher {
  const config = {
    get: (key: string) => (key === 'JWT_REFRESH_SECRET' ? secret : undefined),
  } as unknown as ConfigService<Env, true>;
  return new MailSecretCipher(config);
}

describe('MailSecretCipher', () => {
  it('round-trips a secret payload', () => {
    const cipher = cipherWith(SECRET_A);
    const sealed = cipher.seal('2fa-code', { code: '482913' });

    expect(cipher.open('2fa-code', sealed)).toEqual({ code: '482913' });
    expect(cipher.openField('2fa-code', sealed, 'code')).toBe('482913');
  });

  it('the envelope contains no plaintext and survives a JSON round trip (Redis)', () => {
    const cipher = cipherWith(SECRET_A);
    const sealed = cipher.seal('account-created', { temporaryPassword: 'Tmp#Pass-9912' });
    const wire = JSON.stringify(sealed);

    expect(wire).not.toContain('Tmp#Pass-9912');
    expect(wire).not.toContain('temporaryPassword');
    expect(sealed.v).toBe(1);
    expect(cipher.open('account-created', JSON.parse(wire) as unknown)).toEqual({
      temporaryPassword: 'Tmp#Pass-9912',
    });
  });

  it('uses a fresh IV per seal (same input → different ciphertext)', () => {
    const cipher = cipherWith(SECRET_A);
    const a = cipher.seal('2fa-code', { code: '111111' });
    const b = cipher.seal('2fa-code', { code: '111111' });

    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it('rejects a tampered ciphertext', () => {
    const cipher = cipherWith(SECRET_A);
    const sealed = cipher.seal('2fa-code', { code: '482913' });
    const bytes = Buffer.from(sealed.ct, 'base64url');
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;

    expect(() =>
      cipher.open('2fa-code', { ...sealed, ct: bytes.toString('base64url') }),
    ).toThrow(MailSecretError);
  });

  it('binds the envelope to its template (no replay into another job type)', () => {
    const cipher = cipherWith(SECRET_A);
    const sealed = cipher.seal('password-reset', { code: '482913' });

    expect(() => cipher.open('2fa-code', sealed)).toThrow(MailSecretError);
  });

  it('a rotated master secret cannot open old envelopes', () => {
    const sealed = cipherWith(SECRET_A).seal('2fa-code', { code: '482913' });

    expect(() => cipherWith(SECRET_B).open('2fa-code', sealed)).toThrow(
      'could not be decrypted',
    );
  });

  it('rejects a missing / malformed envelope without echoing it', () => {
    const cipher = cipherWith(SECRET_A);

    expect(() => cipher.open('2fa-code', undefined)).toThrow(MailSecretError);
    expect(() => cipher.open('2fa-code', { code: '482913' })).toThrow(MailSecretError);
    try {
      cipher.open('2fa-code', { v: 1, iv: 'x', tag: 'y', ct: '482913' });
    } catch (err) {
      expect((err as Error).message).not.toContain('482913');
    }
  });

  it('openField fails on a missing field', () => {
    const cipher = cipherWith(SECRET_A);
    const sealed = cipher.seal('2fa-code', { other: 'x' });

    expect(() => cipher.openField('2fa-code', sealed, 'code')).toThrow('"code"');
  });

  it('the derived key is not the master secret itself', () => {
    const key = MailSecretCipher.deriveKey(SECRET_A);

    expect(key).toHaveLength(32);
    expect(key.toString('utf8')).not.toContain('aaaa');
  });
});
