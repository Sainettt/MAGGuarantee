// Phase 9 — carrier account-lifecycle emails (decision 2026-07-30).
//
// Until now only INTERNAL users got these mails; a carrier's generated
// password was written to the log and handed over by hand. These tests pin the
// four rules that closed that gap:
//   1. create           → `account-created` to the USER-table email;
//   2. resetPassword    → `account-password-reset` (shared template);
//   3. reactivate       → `account-reactivated`;
//   4. deactivate       → NOTHING (explicitly out of scope, unlike internal
//                         users, who do get a deactivation notice).
// Plus: a mail failure must never fail the admin's action.

import type { ConfigService } from '@nestjs/config';

import { PasswordService } from '../auth/password.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { MailService } from '../mail/mail.service';
import type { UserRow } from '../users/users.repository';
import { UsersRepository } from '../users/users.repository';
import { CarriersRepository, type CarrierRow } from './carriers.repository';
import { CarriersService } from './carriers.service';

const NOW = new Date('2026-07-30T10:00:00.000Z');

function makeCarrier(overrides: Partial<CarrierRow> = {}): CarrierRow {
  return {
    id: 'c-1',
    userId: 'u-c-1',
    login: 'pwz1',
    // The login mailbox — this is the address the credentials must go to.
    email: 'login@przewoznik.pl',
    name: 'Pwz One',
    company: null,
    active: true,
    nip: '0000000000',
    vatId: null,
    contactPerson: 'Jan Kontakt',
    phone: '+48000000000',
    // The operational inbox — deliberately DIFFERENT so a regression that
    // mails `ordersEmail` instead of `email` fails loudly.
    ordersEmail: 'zlecenia@przewoznik.pl',
    accountEur: 'PL00 0000 0000 0000',
    accountPln: null,
    paymentTerms: 30,
    insuranceValue: 100000,
    insuranceExpiry: NOW,
    licenseExpiry: NOW,
    numberOfVehicle: null,
    companyAddress: 'ul. Testowa 1',
    counts: { vehicles: 1, trailers: 1, drivers: 1 },
    opiekunId: 'op-fixture',
    opiekun: { id: 'op-fixture', login: 'op', name: null },
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

function makeOpiekun(): UserRow {
  return {
    id: 'op-fixture',
    login: 'op',
    email: 'op@magtrans.eu',
    passwordHash: 'hash',
    role: 'opiekun',
    name: 'Op One',
    active: true,
    liderEmail: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  } as UserRow;
}

function makeAuth(role: AuthUser['role'], sub = 'u-actor'): AuthUser {
  return {
    sub,
    login: 'actor',
    email: 'actor@magtrans.eu',
    name: 'Actor',
    role,
    mustChangePassword: false,
  };
}

function makeCarriersRepo(seed: CarrierRow[] = []): CarriersRepository {
  const rows = new Map<string, CarrierRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    create: jest.fn(async (data: Record<string, unknown>) => {
      const row = makeCarrier({
        id: 'c-new',
        userId: 'u-c-new',
        login: data.login as string,
        email: data.email as string,
        name: data.name as string,
        opiekunId: (data.opiekunId as string) ?? 'op-fixture',
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      const cur = rows.get(id)!;
      const next = { ...cur, ...(patch as Partial<CarrierRow>) };
      rows.set(id, next);
      return next;
    }),
    setActive: jest.fn(async (id: string, active: boolean) => {
      const cur = rows.get(id)!;
      const next = { ...cur, active };
      rows.set(id, next);
      return next;
    }),
    softDelete: jest.fn(async () => undefined),
  } as unknown as CarriersRepository;
}

function makeUsersRepo(): UsersRepository {
  const op = makeOpiekun();
  return {
    findById: jest.fn(async (id: string) => (id === op.id ? op : null)),
  } as unknown as UsersRepository;
}

function makePasswords(): PasswordService {
  return {
    hash: jest.fn(async (s: string) => `hashed:${s}`),
    compareConstantTime: jest.fn(async () => true),
  } as unknown as PasswordService;
}

type MailMocks = {
  mail: MailService;
  enqueueAccountCreated: jest.Mock;
  enqueueAccountPasswordReset: jest.Mock;
  enqueueAccountReactivated: jest.Mock;
  enqueueAccountDeactivated: jest.Mock;
};

function makeMail(): MailMocks {
  const enqueueAccountCreated = jest.fn(async () => undefined);
  const enqueueAccountPasswordReset = jest.fn(async () => undefined);
  const enqueueAccountReactivated = jest.fn(async () => undefined);
  const enqueueAccountDeactivated = jest.fn(async () => undefined);
  return {
    mail: {
      enqueueAccountCreated,
      enqueueAccountPasswordReset,
      enqueueAccountReactivated,
      enqueueAccountDeactivated,
    } as unknown as MailService,
    enqueueAccountCreated,
    enqueueAccountPasswordReset,
    enqueueAccountReactivated,
    enqueueAccountDeactivated,
  };
}

function makeConfig(appUrl = 'https://app.magtrans.eu/'): ConfigService {
  return { get: jest.fn(() => appUrl) } as unknown as ConfigService;
}

function makeService(seed: CarrierRow[] = []): {
  svc: CarriersService;
  mail: MailMocks;
} {
  const mail = makeMail();
  const svc = new CarriersService(
    makeCarriersRepo(seed),
    makeUsersRepo(),
    makePasswords(),
    mail.mail,
    makeConfig() as never,
  );
  return { svc, mail };
}

/** `notifyAccount` is fire-and-forget — let the microtask queue drain. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

const CREATE_DTO = {
  login: 'pwz-new',
  email: 'login@przewoznik.pl',
  name: 'Pwz New',
  phone: '+48000000000',
  opiekunId: 'op-fixture',
} as never;

describe('CarriersService — account lifecycle emails', () => {
  it('create mails the temporary password to User.email, not ordersEmail', async () => {
    const { svc, mail } = makeService();
    const out = await svc.create(makeAuth('admin'), CREATE_DTO);
    await flush();

    expect(mail.enqueueAccountCreated).toHaveBeenCalledTimes(1);
    const [to, props] = mail.enqueueAccountCreated.mock.calls[0] as [
      string,
      { loginName: string; temporaryPassword: string; loginUrl: string },
    ];
    expect(to).toBe('login@przewoznik.pl');
    expect(props.loginName).toBe('pwz-new');
    // Same one-time password the admin sees in the response.
    expect(props.temporaryPassword).toBe(out.temporaryPassword);
    // Trailing slash of APP_URL is trimmed.
    expect(props.loginUrl).toBe('https://app.magtrans.eu');
  });

  it('create mails even when the admin supplied the password explicitly', async () => {
    const { svc, mail } = makeService();
    await svc.create(makeAuth('admin'), {
      ...(CREATE_DTO as object),
      password: 'Ustalone-Haslo-1',
    } as never);
    await flush();

    expect(mail.enqueueAccountCreated).toHaveBeenCalledTimes(1);
    const [, props] = mail.enqueueAccountCreated.mock.calls[0] as [
      string,
      { temporaryPassword: string },
    ];
    expect(props.temporaryPassword).toBe('Ustalone-Haslo-1');
  });

  it('resetPassword mails the shared account-password-reset template', async () => {
    const { svc, mail } = makeService([makeCarrier()]);
    const out = await svc.resetPassword('c-1');
    await flush();

    expect(mail.enqueueAccountPasswordReset).toHaveBeenCalledTimes(1);
    const [to, props] = mail.enqueueAccountPasswordReset.mock.calls[0] as [
      string,
      { loginName: string; temporaryPassword: string },
    ];
    expect(to).toBe('login@przewoznik.pl');
    expect(props.loginName).toBe('pwz1');
    expect(props.temporaryPassword).toBe(out.temporaryPassword);
    expect(mail.enqueueAccountCreated).not.toHaveBeenCalled();
  });

  it('reactivate mails the carrier', async () => {
    const { svc, mail } = makeService([makeCarrier({ active: false })]);
    await svc.reactivate('c-1');
    await flush();

    expect(mail.enqueueAccountReactivated).toHaveBeenCalledTimes(1);
    const [to] = mail.enqueueAccountReactivated.mock.calls[0] as [string];
    expect(to).toBe('login@przewoznik.pl');
  });

  it('deactivation sends NO email — deliberate asymmetry with internal users', async () => {
    const { svc, mail } = makeService([makeCarrier()]);
    await svc.softDelete('c-1');
    await flush();

    expect(mail.enqueueAccountDeactivated).not.toHaveBeenCalled();
  });

  it('a failing mail does not fail the admin action', async () => {
    const { svc, mail } = makeService();
    mail.enqueueAccountCreated.mockRejectedValueOnce(new Error('SMTP down'));

    await expect(svc.create(makeAuth('admin'), CREATE_DTO)).resolves.toEqual(
      expect.objectContaining({ login: 'pwz-new' }),
    );
    await flush();
  });

  it('works without a MailService (unit-test / seed construction path)', async () => {
    const svc = new CarriersService(
      makeCarriersRepo(),
      makeUsersRepo(),
      makePasswords(),
    );
    await expect(svc.create(makeAuth('admin'), CREATE_DTO)).resolves.toEqual(
      expect.objectContaining({ login: 'pwz-new' }),
    );
  });
});
