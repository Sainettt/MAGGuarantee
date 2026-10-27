import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ApiResponseError } from '@/lib/api/client';

import {
  permissionErrorField,
  permissionErrorMessageKey,
  permissionOverrideError,
  type PermissionErrorKind,
} from './permissionErrors';

function problem(extensions: Record<string, unknown>): ApiResponseError {
  return new ApiResponseError(422, 'detail', { detail: 'detail', extensions });
}

type Messages = { [key: string]: string | Messages };

function load(locale: 'pl' | 'en'): Messages {
  const file = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as Messages;
}

function lookup(messages: Messages, key: string): unknown {
  let node: unknown = messages;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

describe('permissionOverrideError', () => {
  it.each<[string, PermissionErrorKind]>([
    ['USER_PERMISSION_NOT_GRANTABLE', 'notGrantable'],
    ['USER_PERMISSION_NOT_REVOCABLE', 'notRevocable'],
    ['USER_ADMIN_CANNOT_BE_DENIED', 'adminCannotBeDenied'],
    ['USER_CARRIER_ROLE_LOCKED', 'carrierRoleLocked'],
  ])('%s → %s', (code, kind) => {
    expect(permissionOverrideError(problem({ code }))).toEqual({ kind, permissions: [] });
  });

  it('reads extensions.permissions — catalog ids only, deduplicated, in sent order', () => {
    expect(
      permissionOverrideError(
        problem({
          code: 'USER_PERMISSION_NOT_GRANTABLE',
          permissions: ['carrier_documents.delete', 'nope', 42, 'claims.verify', 'carrier_documents.delete'],
        }),
      ),
    ).toEqual({
      kind: 'notGrantable',
      permissions: ['carrier_documents.delete', 'claims.verify'],
    });
  });

  it('other codes and non-api errors → undefined', () => {
    expect(permissionOverrideError(problem({ code: 'USER_LIDER_ID_INVALID' }))).toBeUndefined();
    expect(permissionOverrideError(new ApiResponseError(400, 'bad', {}))).toBeUndefined();
    expect(permissionOverrideError(new Error('boom'))).toBeUndefined();
  });
});

describe('where and how the refusal is shown (A.9)', () => {
  it('under its group / the role', () => {
    expect(permissionErrorField('notGrantable')).toBe('extraPermissions');
    expect(permissionErrorField('notRevocable')).toBe('deniedPermissions');
    expect(permissionErrorField('adminCannotBeDenied')).toBe('deniedPermissions');
    expect(permissionErrorField('carrierRoleLocked')).toBe('role');
  });

  it('with the list when the api sent ids, the generic text otherwise', () => {
    expect(permissionErrorMessageKey({ kind: 'notGrantable', permissions: ['claims.read'] })).toBe(
      'permissions.errors.notGrantable',
    );
    expect(permissionErrorMessageKey({ kind: 'notGrantable', permissions: [] })).toBe(
      'permissions.errors.notGrantableGeneric',
    );
    expect(permissionErrorMessageKey({ kind: 'notRevocable', permissions: ['claims.read'] })).toBe(
      'permissions.errors.notRevocable',
    );
    expect(permissionErrorMessageKey({ kind: 'notRevocable', permissions: [] })).toBe(
      'permissions.errors.notRevocableGeneric',
    );
  });

  it('every key exists in both bundles', () => {
    const kinds: PermissionErrorKind[] = [
      'notGrantable',
      'notRevocable',
      'adminCannotBeDenied',
      'carrierRoleLocked',
    ];
    for (const locale of ['pl', 'en'] as const) {
      const messages = load(locale);
      for (const kind of kinds) {
        for (const permissions of [[], ['claims.read' as const]]) {
          const key = permissionErrorMessageKey({ kind, permissions });
          expect(typeof lookup(messages, `users.${key}`), `${locale} users.${key}`).toBe('string');
        }
      }
    }
  });
});
