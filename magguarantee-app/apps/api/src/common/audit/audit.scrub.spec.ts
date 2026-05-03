import { AUDIT_REDACTED } from './audit.constants';
import { scrubForAudit } from './audit.scrub';

describe('scrubForAudit', () => {
  it('returns primitives untouched', () => {
    expect(scrubForAudit(null)).toBeNull();
    expect(scrubForAudit(undefined)).toBeUndefined();
    expect(scrubForAudit(42)).toBe(42);
    expect(scrubForAudit('plain')).toBe('plain');
    expect(scrubForAudit(true)).toBe(true);
  });

  it('redacts sensitive keys at the top level', () => {
    const out = scrubForAudit({
      id: 'u-1',
      password: 'plaintext',
      passwordHash: '$2b$...',
      tokenHash: 'abc',
      code: '123456',
      authorization: 'Bearer ...',
      sessionToken: 'aaaaaaaaaa',
      secret: 'shh',
      ok: true,
    }) as Record<string, unknown>;

    expect(out.id).toBe('u-1');
    expect(out.password).toBe(AUDIT_REDACTED);
    expect(out.passwordHash).toBe(AUDIT_REDACTED);
    expect(out.tokenHash).toBe(AUDIT_REDACTED);
    expect(out.code).toBe(AUDIT_REDACTED);
    expect(out.authorization).toBe(AUDIT_REDACTED);
    expect(out.sessionToken).toBe(AUDIT_REDACTED);
    expect(out.secret).toBe(AUDIT_REDACTED);
    expect(out.ok).toBe(true);
  });

  it('matches keys case-insensitively', () => {
    const out = scrubForAudit({
      Password: 'a',
      PASSWORDHASH: 'b',
      Token: 'c',
    }) as Record<string, unknown>;
    expect(out.Password).toBe(AUDIT_REDACTED);
    expect(out.PASSWORDHASH).toBe(AUDIT_REDACTED);
    expect(out.Token).toBe(AUDIT_REDACTED);
  });

  it('redacts sensitive keys recursively in nested objects', () => {
    const out = scrubForAudit({
      user: {
        id: 'u-1',
        passwordHash: '$2b$...',
        nested: {
          token: 'xyz',
          ok: 1,
        },
      },
    }) as { user: { id: string; passwordHash: string; nested: { token: string; ok: number } } };
    expect(out.user.id).toBe('u-1');
    expect(out.user.passwordHash).toBe(AUDIT_REDACTED);
    expect(out.user.nested.token).toBe(AUDIT_REDACTED);
    expect(out.user.nested.ok).toBe(1);
  });

  it('handles arrays without redacting their indices', () => {
    const out = scrubForAudit([
      { id: 1, password: 'a' },
      { id: 2, password: 'b' },
    ]) as Array<Record<string, unknown>>;
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe(1);
    expect(out[0]?.password).toBe(AUDIT_REDACTED);
    expect(out[1]?.password).toBe(AUDIT_REDACTED);
  });

  it('does not mutate the input', () => {
    const input = { password: 'p', other: { token: 't' } };
    const out = scrubForAudit(input);
    expect(input.password).toBe('p');
    expect(input.other.token).toBe('t');
    expect(out).not.toBe(input);
  });

  it('preserves Date and Buffer instances as-is', () => {
    const date = new Date('2026-01-01');
    const buf = Buffer.from('abc');
    const out = scrubForAudit({ when: date, blob: buf, password: 'x' }) as {
      when: Date;
      blob: Buffer;
      password: string;
    };
    expect(out.when).toBe(date);
    expect(out.blob).toBe(buf);
    expect(out.password).toBe(AUDIT_REDACTED);
  });

  it('handles cyclic references', () => {
    const a: Record<string, unknown> = { id: 1 };
    a.self = a;
    const out = scrubForAudit(a) as Record<string, unknown>;
    expect(out.id).toBe(1);
    expect(out.self).toBe('[Circular]');
  });
});
