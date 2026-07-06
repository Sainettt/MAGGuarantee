// Tests for `RequestAuthorizationSchema` — the kwota-Maksima authorization
// request (POST /claims/:nrZgl/request-authorization).
//
// The `comment` ("opis sprawy") is REQUIRED end-to-end: a trimmed, non-empty
// string persisted into `Claim.authorizationDescription` and shown in the
// email body to Maksim. These cases pin that contract at the schema level so
// the pipe rejects a missing/empty comment with a 400 before the service runs.

import { describe, expect, it } from 'vitest';

import { RequestAuthorizationSchema } from '../src/schemas/claims';

describe('RequestAuthorizationSchema — comment is required', () => {
  it('rejects a missing comment', () => {
    const result = RequestAuthorizationSchema.safeParse({ kwotaMaksima: 100 });
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string comment (trim().min(1))', () => {
    const result = RequestAuthorizationSchema.safeParse({
      kwotaMaksima: 100,
      comment: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only comment (trims to empty)', () => {
    const result = RequestAuthorizationSchema.safeParse({
      kwotaMaksima: 100,
      comment: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a non-empty comment and trims surrounding whitespace', () => {
    const result = RequestAuthorizationSchema.safeParse({
      kwotaMaksima: 100,
      comment: '  ok  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comment).toBe('ok');
    }
  });

  it('rejects a comment longer than 2000 chars', () => {
    const result = RequestAuthorizationSchema.safeParse({
      kwotaMaksima: 100,
      comment: 'x'.repeat(2_001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive kwotaMaksima even with a valid comment', () => {
    const result = RequestAuthorizationSchema.safeParse({
      kwotaMaksima: 0,
      comment: 'ok',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict object)', () => {
    const result = RequestAuthorizationSchema.safeParse({
      kwotaMaksima: 100,
      comment: 'ok',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
