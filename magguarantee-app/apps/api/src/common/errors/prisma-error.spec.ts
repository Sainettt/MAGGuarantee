import { ConflictException } from '@nestjs/common';

import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from './prisma-error';

describe('prisma-error helper', () => {
  it('detects P2002 errors', () => {
    expect(isPrismaUniqueViolation({ code: 'P2002' })).toBe(true);
  });

  it('rejects non-P2002 errors', () => {
    expect(isPrismaUniqueViolation({ code: 'P2025' })).toBe(false);
    expect(isPrismaUniqueViolation(new Error('boom'))).toBe(false);
    expect(isPrismaUniqueViolation(null)).toBe(false);
  });

  it('translates to ConflictException with field info', () => {
    const ex = uniqueViolationToConflict(
      { code: 'P2002', meta: { target: ['carrierId', 'plateNumber'] } },
      'fallback',
    );
    expect(ex).toBeInstanceOf(ConflictException);
    expect(ex.message).toContain('carrierId, plateNumber');
  });

  it('falls back to provided message for non-P2002', () => {
    const ex = uniqueViolationToConflict(
      new Error('something else'),
      'plain conflict',
    );
    expect(ex.message).toBe('plain conflict');
  });

  it('handles meta.target as a string', () => {
    const ex = uniqueViolationToConflict(
      { code: 'P2002', meta: { target: 'name' } },
      'fallback',
    );
    expect(ex.message).toContain('name');
  });
});
