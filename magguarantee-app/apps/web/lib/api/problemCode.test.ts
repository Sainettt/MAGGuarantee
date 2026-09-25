import { describe, expect, it } from 'vitest';

import { ApiResponseError } from './client';
import { problemCode, problemExtensions, problemFields } from './problemCode';

function apiErr(data?: Record<string, unknown>, status = 422): ApiResponseError {
  return new ApiResponseError(status, 'detail', data);
}

describe('problemCode / problemFields', () => {
  it('reads extensions.code and extensions.fields', () => {
    const err = apiErr({
      detail: 'x',
      extensions: { code: 'USER_MANAGED_BY_MAGSPACE', fields: ['role', 'lider'] },
    });
    expect(problemCode(err)).toBe('USER_MANAGED_BY_MAGSPACE');
    expect(problemFields(err)).toEqual(['role', 'lider']);
  });

  it('ignores non-string codes and non-string field entries', () => {
    const err = apiErr({ extensions: { code: 42, fields: ['lider', 7, null] } });
    expect(problemCode(err)).toBeUndefined();
    expect(problemFields(err)).toEqual(['lider']);
  });

  it('returns nothing for an envelope without extensions', () => {
    const err = apiErr({ detail: 'x' });
    expect(problemExtensions(err)).toBeUndefined();
    expect(problemCode(err)).toBeUndefined();
    expect(problemFields(err)).toEqual([]);
  });

  it('returns nothing for extensions that are not an object', () => {
    expect(problemExtensions(apiErr({ extensions: 'nope' }))).toBeUndefined();
    expect(problemExtensions(apiErr({ extensions: ['a'] }))).toBeUndefined();
    expect(problemExtensions(apiErr(undefined))).toBeUndefined();
  });

  it('returns nothing for errors that are not api errors', () => {
    expect(problemCode(new Error('boom'))).toBeUndefined();
    expect(problemCode(null)).toBeUndefined();
    expect(problemFields('USER_MANAGED_BY_MAGSPACE')).toEqual([]);
  });
});
