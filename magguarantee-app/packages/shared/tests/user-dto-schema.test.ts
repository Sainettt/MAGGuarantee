// Wire-contract guard for `UserDto.permissions` (docs/25 §3 B4) and
// `UserDto.carrierId` (B6).
//
// The api fills it with the user's effective permissions in catalog order;
// the web parses `/auth/me` and every session-issuing `{ user }` with this
// schema. The enum is declared in `schemas/auth.ts` (not in `permissions.ts`,
// which must stay zod-free), so these tests pin that it cannot drift from the
// catalog.

import { describe, expect, it } from 'vitest';

import * as shared from '../src';
import { PERMISSIONS, permissionsFor } from '../src/permissions';
import { PermissionSchema, UserDto } from '../src/schemas/auth';

const BASE = {
  id: '3f9a7c2e-6b1d-4e8a-9c0f-2d5b7e1a4c63',
  login: 'planistalider1',
  email: 'planistalider1@magtrans.eu',
  name: 'Planista lider 1',
  role: 'planista',
  mustChangePassword: false,
  lider: true,
  carrierId: null,
} as const;

describe('PermissionSchema', () => {
  it('is exactly the catalog, in catalog order', () => {
    expect(PermissionSchema.options).toEqual([...PERMISSIONS]);
  });

  it('rejects a string outside the catalog', () => {
    expect(PermissionSchema.safeParse('claims.delete').success).toBe(false);
  });

  it('is exported from the package barrel', () => {
    expect(shared.PermissionSchema).toBe(PermissionSchema);
  });
});

describe('UserDto.permissions', () => {
  it('accepts the effective permissions the api sends', () => {
    const body = { ...BASE, permissions: [...permissionsFor('planista', true)] };
    expect(UserDto.parse(body)).toEqual(body);
  });

  it('accepts an empty list (a user with no rights is still a user)', () => {
    expect(UserDto.parse({ ...BASE, permissions: [] }).permissions).toEqual([]);
  });

  it('is required — a body without it does not parse', () => {
    expect(UserDto.safeParse(BASE).success).toBe(false);
  });

  it('rejects an unknown permission', () => {
    const body = { ...BASE, permissions: ['claims.read', 'claims.delete'] };
    expect(UserDto.safeParse(body).success).toBe(false);
  });
});

describe('UserDto.carrierId (docs/25 B6, decision Q2)', () => {
  const permissions = [...permissionsFor('przewoznik')];

  it('carries the Carrier.id of a przewoznik (his own company)', () => {
    const carrierId = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f';
    const body = { ...BASE, role: 'przewoznik', lider: false, permissions, carrierId };
    expect(UserDto.parse(body)).toEqual(body);
  });

  it('is null for everyone else', () => {
    expect(UserDto.parse({ ...BASE, permissions: [] }).carrierId).toBeNull();
  });

  it('is required — null, never omitted', () => {
    const { carrierId: _omit, ...withoutIt } = BASE;
    expect(UserDto.safeParse({ ...withoutIt, permissions: [] }).success).toBe(false);
  });

  it('must be a uuid', () => {
    expect(UserDto.safeParse({ ...BASE, permissions: [], carrierId: 'car-1' }).success).toBe(false);
  });
});
