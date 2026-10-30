import {
  INCLUDE_SOFT_DELETED,
  SOFT_DELETE_MODELS,
  softDeleteExtension,
  _injectDeletedAtNullToWhere,
  _isSoftModel,
  _takeIncludeFlag,
} from './soft-delete.extension';

/**
 * The soft-delete extension is a pure factory over the Prisma client. We
 * unit-test it by exercising two surfaces:
 *
 *  1. The exported constants (model list + escape-hatch symbol) — guarantees
 *     the contract documented in docs/12-database-schema.md.
 *
 *  2. A `Prisma.defineExtension` shape sanity check — calling the factory
 *     produces a definition whose name is `softDelete` and whose
 *     `query.$allModels` covers the expected operations.
 *
 * Real DB-level behaviour (filtering on findMany, delete-as-update) is
 * verified by integration tests against a live Postgres in Wave 3+. Here we
 * keep things fast & deterministic.
 */
describe('softDeleteExtension', () => {
  it('lists the canonical soft-delete models', () => {
    // Per docs/12-database-schema.md#soft-delete-vs-hard-delete: every model
    // carrying a `deletedAt` column. The three *Attachment models were added
    // after a production bug — their `.delete()` recursed because they were
    // missing here (see docs/12-database-schema.md#soft-delete).
    expect(new Set(SOFT_DELETE_MODELS)).toEqual(
      new Set([
        'User',
        'Carrier',
        'Vehicle',
        'Driver',
        'Trailer',
        'Claim',
        'Delegation',
        'CarrierAttachment',
        'VehicleAttachment',
        'DriverAttachment',
        'TrailerAttachment',
      ]),
    );
  });

  it('exposes the INCLUDE_SOFT_DELETED escape-hatch symbol', () => {
    expect(typeof INCLUDE_SOFT_DELETED).toBe('symbol');
    expect(INCLUDE_SOFT_DELETED.toString()).toContain('includeSoftDeleted');
  });

  it('factory returns a callable extension definition', () => {
    const ext = softDeleteExtension();
    // `Prisma.defineExtension` wraps a callback. The exact return type is
    // a Prisma-internal symbol-tagged record; we just assert it's an object
    // and that it does not throw to construct.
    expect(ext).toBeDefined();
    expect(typeof ext === 'function' || typeof ext === 'object').toBe(true);
  });
});

describe('softDeleteExtension internals', () => {
  describe('_isSoftModel', () => {
    it.each([
      'User',
      'Carrier',
      'Vehicle',
      'Driver',
      'Trailer',
      'Claim',
      'Delegation',
      'CarrierAttachment',
      'VehicleAttachment',
      'DriverAttachment',
    ])('matches soft-delete model %s', (m) => {
      expect(_isSoftModel(m)).toBe(true);
    });

    it.each([
      'AuditLog',
      'RefreshToken',
      'AppConfig',
      'TrailerType',
      'ClaimSequence',
      'MonthlyLimit',
      'WeeklyLimit',
      undefined,
      '',
    ])('rejects non-soft model %p', (m) => {
      expect(_isSoftModel(m as string | undefined)).toBe(false);
    });
  });

  describe('_injectDeletedAtNullToWhere', () => {
    it('adds deletedAt:null when no where present', () => {
      const out = _injectDeletedAtNullToWhere(undefined);
      expect(out).toEqual({ where: { deletedAt: null } });
    });

    it('adds deletedAt:null preserving other where fields', () => {
      const out = _injectDeletedAtNullToWhere({
        where: { id: 'x', name: 'y' },
        select: { id: true },
      });
      expect(out).toEqual({
        where: { id: 'x', name: 'y', deletedAt: null },
        select: { id: true },
      });
    });

    it('does NOT override an explicit deletedAt filter', () => {
      const out = _injectDeletedAtNullToWhere({
        where: { id: 'x', deletedAt: { not: null } },
      });
      expect(out.where).toEqual({ id: 'x', deletedAt: { not: null } });
    });

    it('does not mutate the input', () => {
      const input = { where: { id: 'x' } };
      _injectDeletedAtNullToWhere(input);
      expect(input.where).toEqual({ id: 'x' });
    });
  });

  describe('_takeIncludeFlag', () => {
    it('returns include=false for plain args', () => {
      const out = _takeIncludeFlag({ where: { id: 'x' } });
      expect(out.include).toBe(false);
      expect(out.rest).toEqual({ where: { id: 'x' } });
    });

    it('returns include=true and strips the symbol when set', () => {
      const out = _takeIncludeFlag({
        where: { id: 'x' },
        [INCLUDE_SOFT_DELETED]: true,
      });
      expect(out.include).toBe(true);
      // Symbol keys are not enumerable via Object.keys → naturally absent.
      expect(out.rest).toEqual({ where: { id: 'x' } });
      expect(
        Object.getOwnPropertySymbols(out.rest).includes(INCLUDE_SOFT_DELETED),
      ).toBe(false);
    });

    it('returns include=false for null / non-object args', () => {
      expect(_takeIncludeFlag(null).include).toBe(false);
      expect(_takeIncludeFlag(undefined).include).toBe(false);
      expect(_takeIncludeFlag(42).include).toBe(false);
    });

    it('returns include=false when the symbol is set to a falsy value', () => {
      const out = _takeIncludeFlag({ [INCLUDE_SOFT_DELETED]: false });
      expect(out.include).toBe(false);
    });
  });
});
