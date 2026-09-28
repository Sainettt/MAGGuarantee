// Phase 9 — the admin-issued password reset for INTERNAL users now emails the
// user (it previously only logged). Create / deactivate / reactivate were
// already wired; this file covers the fourth hole plus the shared-template
// invariant: internal users and carriers get the SAME
// `account-password-reset` mail (decision 2026-07-30).

import type { ConfigService } from '@nestjs/config';

import { PasswordService } from '../auth/password.service';
import type { MailService } from '../mail/mail.service';
import { RefreshTokenRepository } from '../auth/refresh-token.repository';
import { UsersRepository, type UserRow } from './users.repository';
import { UsersService } from './users.service';

const NOW = new Date('2026-07-30T10:00:00.000Z');

function makeRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u-1',
    login: 'kasia',
    email: 'kasia@magtrans.eu',
    passwordHash: 'hash',
    role: 'pracownik',
    name: 'Kasia',
    active: true,
    liderId: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  } as UserRow;
}

function makeRepo(initial: UserRow[]): UsersRepository {
  const rows = new Map<string, UserRow>();
  for (const r of initial) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const next = { ...rows.get(id)!, ...(patch as Partial<UserRow>) };
      rows.set(id, next);
      return next;
    }),
  } as unknown as UsersRepository;
}

function makePasswords(): PasswordService {
  return {
    hash: jest.fn(async (s: string) => `hashed:${s}`),
    compareConstantTime: jest.fn(async () => true),
  } as unknown as PasswordService;
}

function makeRefreshTokens(): RefreshTokenRepository {
  return {
    revokeAllForUser: jest.fn(async () => 2),
  } as unknown as RefreshTokenRepository;
}

function makeService(): {
  svc: UsersService;
  enqueueAccountPasswordReset: jest.Mock;
} {
  const enqueueAccountPasswordReset = jest.fn(async () => undefined);
  const mail = { enqueueAccountPasswordReset } as unknown as MailService;
  const config = {
    get: jest.fn(() => 'https://app.magtrans.eu'),
  } as unknown as ConfigService;
  const svc = new UsersService(
    makeRepo([makeRow()]),
    makePasswords(),
    makeRefreshTokens(),
    mail,
    config as never,
  );
  return { svc, enqueueAccountPasswordReset };
}

/** The notify helper is fire-and-forget — drain the microtask queue. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('UsersService — admin password reset email', () => {
  it('mails the generated temporary password', async () => {
    const { svc, enqueueAccountPasswordReset } = makeService();
    const out = await svc.resetPassword('u-1', { mode: 'generate' } as never);
    await flush();

    expect(enqueueAccountPasswordReset).toHaveBeenCalledTimes(1);
    const [to, props] = enqueueAccountPasswordReset.mock.calls[0] as [
      string,
      { loginName: string; temporaryPassword: string; loginUrl: string },
    ];
    expect(to).toBe('kasia@magtrans.eu');
    expect(props.loginName).toBe('kasia');
    expect(props.temporaryPassword).toBe(out.temporaryPassword);
    expect(props.loginUrl).toBe('https://app.magtrans.eu');
  });

  it('mails in custom-password mode too — the old password stopped working either way', async () => {
    const { svc, enqueueAccountPasswordReset } = makeService();
    await svc.resetPassword('u-1', {
      mode: 'custom',
      password: 'Nowe-Haslo-123',
    } as never);
    await flush();

    const [, props] = enqueueAccountPasswordReset.mock.calls[0] as [
      string,
      { temporaryPassword: string },
    ];
    expect(props.temporaryPassword).toBe('Nowe-Haslo-123');
  });

  it('a failing mail does not fail the reset', async () => {
    const { svc, enqueueAccountPasswordReset } = makeService();
    enqueueAccountPasswordReset.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(
      svc.resetPassword('u-1', { mode: 'generate' } as never),
    ).resolves.toEqual(
      expect.objectContaining({ temporaryPassword: expect.any(String) }),
    );
    await flush();
  });
});
