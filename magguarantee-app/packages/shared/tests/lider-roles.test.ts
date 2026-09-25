// Leader flag over the base roles (docs/28 «роли-лидеры»).
//
// Two things are guarded here: that nobody turns a leader into a ROLE (R1 —
// `lider_*` in the enum would slip past every `@Roles`, scope branch and
// `Record<Role, …>`), and that the Zod half of the `lider ⇒ role ∈ LIDER_ROLES`
// invariant carries the machine code the api lifts into a 422.

import { describe, expect, it } from 'vitest';

import { Role } from '../src/schemas/auth';
import {
  AssignableRoleSchema,
  BooleanQueryParamSchema,
  LIDER_ROLES,
  LiderRoleSchema,
  RoleSchema,
  USER_LIDER_REQUIRES_LIDER_ROLE,
  isLiderRole,
} from '../src/schemas/common';
import * as shared from '../src';
import { GrantSsoAccessSchema, SetStanowiskoRoleSchema } from '../src/schemas/sso';
import {
  CreateUserRequestSchema,
  CreateUserSchema,
  UpdateUserSchema,
  UserFiltersSchema,
} from '../src/schemas/users';

const ALL_ROLES = [
  'admin',
  'pracownik',
  'opiekun',
  'planista',
  'dyspozytor',
  'przewoznik',
  'eksport',
  'weryfikator',
] as const;

const LIDER_OK = ['planista', 'dyspozytor', 'opiekun', 'pracownik', 'eksport'] as const;
const LIDER_REFUSED = ['admin', 'przewoznik', 'weryfikator'] as const;

/** The code the api's ZodValidationPipe lifts into `extensions.code`. */
function issueCodes(result: { success: boolean; error?: { issues: unknown[] } }): unknown[] {
  if (result.success || !result.error) return [];
  return result.error.issues.map(
    (i) => (i as { params?: { code?: unknown } }).params?.code,
  );
}

describe('a leader is not a role (docs/28 §7 R1)', () => {
  it('RoleSchema has no lider_* member', () => {
    expect(RoleSchema.options.filter((r) => r.toLowerCase().includes('lider'))).toEqual([]);
  });

  it('auth.ts#Role has no lider_* member', () => {
    expect(Role.options.filter((r) => r.toLowerCase().includes('lider'))).toEqual([]);
  });

  it('the two role lists are still the same eight roles', () => {
    expect([...RoleSchema.options].sort()).toEqual([...ALL_ROLES].sort());
    expect([...Role.options].sort()).toEqual([...ALL_ROLES].sort());
  });

  it('every leader role is an assignable role (so the SSO grant can hand it out)', () => {
    for (const r of LIDER_ROLES) {
      expect(AssignableRoleSchema.safeParse(r).success).toBe(true);
    }
  });
});

describe('LIDER_ROLES / LiderRoleSchema / isLiderRole', () => {
  it('lists exactly the five base roles from docs/28 §1', () => {
    expect([...LIDER_ROLES]).toEqual([...LIDER_OK]);
    expect([...LiderRoleSchema.options]).toEqual([...LIDER_OK]);
  });

  it.each(LIDER_OK)('%s may carry the flag', (role) => {
    expect(isLiderRole(role)).toBe(true);
    expect(LiderRoleSchema.safeParse(role).success).toBe(true);
  });

  it.each(LIDER_REFUSED)('%s may not', (role) => {
    expect(isLiderRole(role)).toBe(false);
    expect(LiderRoleSchema.safeParse(role).success).toBe(false);
  });

  it('rejects strings that are not roles at all', () => {
    expect(isLiderRole('lider_planista')).toBe(false);
    expect(isLiderRole('')).toBe(false);
  });

  it('the error code is exported from the package root (next to USER_MANAGED_BY_MAGSPACE)', () => {
    expect(shared.USER_LIDER_REQUIRES_LIDER_ROLE).toBe('USER_LIDER_REQUIRES_LIDER_ROLE');
    expect(shared.USER_MANAGED_BY_MAGSPACE).toBe('USER_MANAGED_BY_MAGSPACE');
  });
});

describe('CreateUserRequestSchema — the (role, lider) pair', () => {
  const base = { login: 'jan.k', email: 'jan.k@magtrans.eu', name: 'Jan K' };

  it.each(LIDER_OK)('accepts %s + lider', (role) => {
    expect(CreateUserRequestSchema.parse({ ...base, role, lider: true })).toMatchObject({
      role,
      lider: true,
    });
  });

  it.each(['admin', 'weryfikator'] as const)('refuses %s + lider with the coded issue on `lider`', (role) => {
    const r = CreateUserRequestSchema.safeParse({ ...base, role, lider: true });
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toEqual([USER_LIDER_REQUIRES_LIDER_ROLE]);
    expect(r.error?.issues[0]?.path).toEqual(['lider']);
  });

  it('lider: false and an omitted lider are fine for any creatable role', () => {
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'admin', lider: false }).success).toBe(true);
    expect(CreateUserRequestSchema.safeParse({ ...base, role: 'weryfikator' }).success).toBe(true);
  });

  it('CreateUserSchema stays a plain ZodObject the web form can extend', () => {
    // UserSheet.tsx calls `.passthrough()` on it; a refined schema has none.
    expect(typeof CreateUserSchema.passthrough).toBe('function');
    expect(typeof CreateUserSchema.extend).toBe('function');
    expect(typeof UpdateUserSchema.extend).toBe('function');
    // …and it validates shape only: the pair is the request schema's job.
    expect(CreateUserSchema.safeParse({ ...base, role: 'admin', lider: true }).success).toBe(true);
  });

  it('a non-boolean lider is a plain shape error, not the business-rule code', () => {
    const r = CreateUserRequestSchema.safeParse({ ...base, role: 'planista', lider: 'yes' });
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toEqual([undefined]);
  });
});

describe('UpdateUserSchema.lider', () => {
  it('is optional and has no pair refine (the service checks the merged row)', () => {
    expect(UpdateUserSchema.parse({})).toEqual({});
    // A lone `lider: true` is legal at the schema level — the role lives in the DB row.
    expect(UpdateUserSchema.parse({ lider: true })).toEqual({ lider: true });
    expect(UpdateUserSchema.safeParse({ role: 'weryfikator', lider: true }).success).toBe(true);
  });
});

describe('SetStanowiskoRoleSchema', () => {
  it('keeps `lider` absent when omitted — "keep the stored flag", not `false`', () => {
    expect(SetStanowiskoRoleSchema.parse({ role: 'planista' })).toEqual({ role: 'planista' });
  });

  it('accepts an explicit leader mapping', () => {
    expect(SetStanowiskoRoleSchema.parse({ role: 'dyspozytor', lider: true })).toEqual({
      role: 'dyspozytor',
      lider: true,
    });
  });

  it('refuses lider on weryfikator with the coded issue', () => {
    const r = SetStanowiskoRoleSchema.safeParse({ role: 'weryfikator', lider: true });
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toEqual([USER_LIDER_REQUIRES_LIDER_ROLE]);
  });

  it('still rejects unknown keys and the non-assignable roles', () => {
    expect(SetStanowiskoRoleSchema.safeParse({ role: 'planista', extra: 1 }).success).toBe(false);
    expect(SetStanowiskoRoleSchema.safeParse({ role: 'admin' }).success).toBe(false);
  });
});

describe('GrantSsoAccessSchema', () => {
  const email = 'jan.kowalski@magtrans.eu';

  it('accepts a body without lider and does not invent one', () => {
    expect(GrantSsoAccessSchema.parse({ email, role: 'eksport' })).toEqual({ email, role: 'eksport' });
  });

  it('accepts a leader grant', () => {
    expect(GrantSsoAccessSchema.parse({ email, role: 'opiekun', lider: true })).toEqual({
      email,
      role: 'opiekun',
      lider: true,
    });
  });

  it('refuses lider on weryfikator with the coded issue', () => {
    const r = GrantSsoAccessSchema.safeParse({ email, role: 'weryfikator', lider: true });
    expect(r.success).toBe(false);
    expect(issueCodes(r)).toEqual([USER_LIDER_REQUIRES_LIDER_ROLE]);
  });
});

describe('UserFiltersSchema.lider — strict query boolean', () => {
  it("'true' → true", () => {
    expect(UserFiltersSchema.parse({ lider: 'true' })).toMatchObject({ lider: true });
  });

  it("'false' → false (the z.coerce.boolean() trap: Boolean('false') === true)", () => {
    expect(UserFiltersSchema.parse({ lider: 'false' })).toMatchObject({ lider: false });
  });

  it('absent → undefined (no filter)', () => {
    expect(UserFiltersSchema.parse({}).lider).toBeUndefined();
  });

  it.each(['1', '0', 'yes', 'TRUE', 'False', '', 'lider'])('rejects %j', (raw) => {
    expect(UserFiltersSchema.safeParse({ lider: raw }).success).toBe(false);
  });

  it('BooleanQueryParamSchema is the same strict parser', () => {
    expect(BooleanQueryParamSchema.parse('true')).toBe(true);
    expect(BooleanQueryParamSchema.parse('false')).toBe(false);
    expect(BooleanQueryParamSchema.safeParse(true).success).toBe(false);
  });
});
