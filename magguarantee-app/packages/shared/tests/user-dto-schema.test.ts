// Wire-contract guard for `UserDto.permissions` (docs/25 §3 B4).
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
