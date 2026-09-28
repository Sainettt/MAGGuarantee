import { describe, expect, it } from 'vitest';

import { ApiResponseError } from '@/lib/api/client';

import { liderErrorKind } from './liderErrors';

function problem(extensions: Record<string, unknown>): ApiResponseError {
  return new ApiResponseError(422, 'detail', { detail: 'detail', extensions });
}

describe('liderErrorKind', () => {
  it('USER_LIDER_REQUIRES_LIDER_ROLE → requiresLiderRole (with or without field)', () => {
    expect(liderErrorKind(problem({ code: 'USER_LIDER_REQUIRES_LIDER_ROLE' }))).toBe(
      'requiresLiderRole',
    );
    expect(
      liderErrorKind(
        problem({ code: 'USER_LIDER_REQUIRES_LIDER_ROLE', field: 'roleOverride' }),
      ),
    ).toBe('requiresLiderRole');
  });

  it('USER_MANAGED_BY_MAGSPACE naming lider → managedByMagspace', () => {
    expect(
      liderErrorKind(problem({ code: 'USER_MANAGED_BY_MAGSPACE', fields: ['lider'] })),
    ).toBe('managedByMagspace');
    expect(
      liderErrorKind(
        problem({ code: 'USER_MANAGED_BY_MAGSPACE', fields: ['role', 'lider'] }),
      ),
    ).toBe('managedByMagspace');
  });

  it('USER_MANAGED_BY_MAGSPACE about role / active only → not a leader error', () => {
    expect(
      liderErrorKind(problem({ code: 'USER_MANAGED_BY_MAGSPACE', fields: ['role'] })),
    ).toBeUndefined();
    expect(liderErrorKind(problem({ code: 'USER_MANAGED_BY_MAGSPACE' }))).toBeUndefined();
  });

  it('USER_LIDER_ID_INVALID → liderIdInvalid, whatever the reason (docs/29 U9)', () => {
    for (const reason of ['role_not_planista', 'self', 'not_found', 'not_planista', 'inactive', 'not_lider']) {
      expect(liderErrorKind(problem({ code: 'USER_LIDER_ID_INVALID', reason }))).toBe(
        'liderIdInvalid',
      );
    }
  });

  it('other codes and non-api errors → undefined', () => {
    expect(liderErrorKind(problem({ code: 'SOMETHING_ELSE' }))).toBeUndefined();
    expect(liderErrorKind(new ApiResponseError(409, 'Login zajęty', {}))).toBeUndefined();
    expect(liderErrorKind(new Error('boom'))).toBeUndefined();
  });
});
