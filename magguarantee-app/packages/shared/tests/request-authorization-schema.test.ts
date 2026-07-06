// Tests for `RequestAuthorizationSchema` — the kwota-Maksima authorization
// request (POST /claims/:nrZgl/request-authorization) — and for
// `SetAuthorizationAmountSchema` (PUT /claims/:nrZgl/authorization-amount).
//
// Product decision (final): the REQUEST no longer carries an amount — Maksim
// hasn't decided anything yet. The body is `{ comment }` only. The `comment`
// ("opis sprawy") is REQUIRED end-to-end: a trimmed, non-empty string persisted
// into `Claim.authorizationDescription` and shown in the email body to Maksim.
// The amount Maksim assigns in his reply is recorded LATER via
// `SetAuthorizationAmountSchema`. These cases pin both contracts at the schema
// level so the pipe rejects bad input with a 400 before the service runs.

import { describe, expect, it } from 'vitest';

import {
  RequestAuthorizationSchema,
  SetAuthorizationAmountSchema,
} from '../src/schemas/claims';

describe('RequestAuthorizationSchema — comment only, required', () => {
  it('rejects a missing comment', () => {
    const result = RequestAuthorizationSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects an empty-string comment (trim().min(1))', () => {
    const result = RequestAuthorizationSchema.safeParse({ comment: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only comment (trims to empty)', () => {
    const result = RequestAuthorizationSchema.safeParse({ comment: '   ' });
    expect(result.success).toBe(false);
  });

  it('accepts a non-empty comment and trims surrounding whitespace', () => {
    const result = RequestAuthorizationSchema.safeParse({ comment: '  ok  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.comment).toBe('ok');
    }
  });

  it('rejects a comment longer than 2000 chars', () => {
    const result = RequestAuthorizationSchema.safeParse({
      comment: 'x'.repeat(2_001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a kwotaMaksima field — the request carries no amount (strict)', () => {
    const result = RequestAuthorizationSchema.safeParse({
      comment: 'ok',
      kwotaMaksima: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict object)', () => {
    const result = RequestAuthorizationSchema.safeParse({
      comment: 'ok',
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});

describe('SetAuthorizationAmountSchema — records Maksim replied amount', () => {
  it('accepts a positive 2-decimal amount', () => {
    const result = SetAuthorizationAmountSchema.safeParse({
      kwotaMaksima: 1_550.5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kwotaMaksima).toBe(1_550.5);
    }
  });

  it('rejects a non-positive amount', () => {
    expect(
      SetAuthorizationAmountSchema.safeParse({ kwotaMaksima: 0 }).success,
    ).toBe(false);
    expect(
      SetAuthorizationAmountSchema.safeParse({ kwotaMaksima: -1 }).success,
    ).toBe(false);
  });

  it('rejects a value finer than 0.01 (multipleOf)', () => {
    const result = SetAuthorizationAmountSchema.safeParse({
      kwotaMaksima: 1.005,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a value above the 9,999,999 cap', () => {
    const result = SetAuthorizationAmountSchema.safeParse({
      kwotaMaksima: 10_000_000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing kwotaMaksima', () => {
    const result = SetAuthorizationAmountSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict object)', () => {
    const result = SetAuthorizationAmountSchema.safeParse({
      kwotaMaksima: 100,
      comment: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
