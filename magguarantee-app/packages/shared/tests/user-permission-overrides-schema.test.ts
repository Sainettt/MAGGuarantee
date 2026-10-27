// Wire contract of the per-user permission overrides (docs/25 §3 B6):
// `PATCH /users/:id` accepts `extraPermissions` / `deniedPermissions`, and
// `UserDtoFull` carries both. Whether an id FITS the user's role is a business
// rule judged by the api on the merged row (422 USER_PERMISSION_*); the schema
// only guarantees catalog ids and no duplicates.

import { describe, expect, it } from 'vitest';

import * as shared from '../src';
import { PERMISSIONS } from '../src/permissions';
import {
  USER_ADMIN_CANNOT_BE_DENIED,
  USER_CARRIER_ROLE_LOCKED,
  USER_PERMISSION_NOT_GRANTABLE,
  USER_PERMISSION_NOT_REVOCABLE,
  UpdateUserSchema,
  UserDtoSchema,
} from '../src/schemas/users';

const DTO = {
  id: '3f9a7c2e-6b1d-4e8a-9c0f-2d5b7e1a4c63',
  login: 'przewoznik2',
  email: 'przewoznik2@example.com',
  name: 'Przewoźnik 2',
  role: 'przewoznik',
  active: true,
  liderId: null,
  liderUser: null,
  mustChangePassword: false,
  lastLoginAt: null,
  managedBy: 'local',
  authProvider: 'local',
  roleOverride: null,
  lider: false,
  directorySyncedAt: null,
  extraPermissions: ['carrier_documents.read', 'carrier_documents.add'],
  deniedPermissions: [],
  createdAt: '2026-10-27T08:00:00.000Z',
  updatedAt: '2026-10-27T08:00:00.000Z',
} as const;

describe('UpdateUserSchema — extraPermissions / deniedPermissions', () => {
  it('both are optional — an existing body without them still parses unchanged', () => {
    expect(UpdateUserSchema.parse({ name: 'X' })).toEqual({ name: 'X' });
  });

  it('accepts catalog ids; [] clears', () => {
    expect(
      UpdateUserSchema.parse({
        extraPermissions: ['carrier_documents.read'],
        deniedPermissions: [],
      }),
    ).toEqual({ extraPermissions: ['carrier_documents.read'], deniedPermissions: [] });
  });

  it('drops duplicates, keeping the first occurrence', () => {
    const parsed = UpdateUserSchema.parse({
      extraPermissions: ['carrier_documents.add', 'carrier_documents.read', 'carrier_documents.add'],
      deniedPermissions: ['km.read', 'km.read'],
    });
    expect(parsed.extraPermissions).toEqual(['carrier_documents.add', 'carrier_documents.read']);
    expect(parsed.deniedPermissions).toEqual(['km.read']);
  });

  it('rejects an id outside the catalog (400, not a business rule)', () => {
    expect(UpdateUserSchema.safeParse({ extraPermissions: ['carrier_documents.edit'] }).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ deniedPermissions: ['CLAIMS.READ'] }).success).toBe(false);
  });

  it('rejects null and a bare string — a list or nothing', () => {
    expect(UpdateUserSchema.safeParse({ extraPermissions: null }).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ deniedPermissions: 'claims.read' }).success).toBe(false);
  });

  it('stays strict', () => {
    expect(UpdateUserSchema.safeParse({ permissions: ['claims.read'] }).success).toBe(false);
  });
});

describe('UserDtoSchema — override fields', () => {
  it('carries both lists', () => {
    expect(UserDtoSchema.parse(DTO)).toEqual(DTO);
  });

  it('both are required (the api always sends them, [] when none)', () => {
    const { extraPermissions: _e, ...noExtra } = DTO;
    const { deniedPermissions: _d, ...noDenied } = DTO;
    expect(UserDtoSchema.safeParse(noExtra).success).toBe(false);
    expect(UserDtoSchema.safeParse(noDenied).success).toBe(false);
  });

  it('only catalog ids — the api strips unknown stored values before sending', () => {
    expect(UserDtoSchema.safeParse({ ...DTO, deniedPermissions: ['gone.permission'] }).success).toBe(false);
  });

  it('accepts the whole catalog', () => {
    expect(UserDtoSchema.safeParse({ ...DTO, deniedPermissions: [...PERMISSIONS] }).success).toBe(true);
  });
});

describe('422 codes', () => {
  it('are their own names and are exported from the barrel', () => {
    for (const code of [
      USER_PERMISSION_NOT_GRANTABLE,
      USER_PERMISSION_NOT_REVOCABLE,
      USER_ADMIN_CANNOT_BE_DENIED,
      USER_CARRIER_ROLE_LOCKED,
    ]) {
      expect((shared as Record<string, unknown>)[code]).toBe(code);
    }
  });
});
