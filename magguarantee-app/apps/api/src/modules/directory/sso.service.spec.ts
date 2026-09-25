// SSO admin surface: the refused-sign-in queue and the grant wrapper
// (docs/24 §A5/§10). The grant's decision logic is covered in
// directory.service.spec.ts; here only the shaping around it.

import { HttpException, HttpStatus } from '@nestjs/common';

import type { AssignableRole } from '@magguarantee/shared';

import { AuditContext, type AuditContextStore } from '../../common/audit';
import type { AuditLogRow, AuditQueryRepository } from '../audit/audit-query.repository';
import type { UsersRepository, UserRow } from '../users/users.repository';
import type { UsersService } from '../users/users.service';
import type { DirectoryService } from './directory.service';
import type { DirectoryState } from './directory-state';
import type { MagspaceClient } from './magspace.client';
import { SsoService } from './sso.service';
import type {
  StanowiskoRoleMappingRepository,
  StanowiskoRoleMappingRow,
} from './stanowisko-role-mapping.repository';

function denial(email: string | null, at: string, stanowiskoCode: string | null = 'CONTROLLING'): AuditLogRow {
  return {
    id: `a-${email ?? 'none'}-${at}`,
    action: 'system.denyDirectoryAccess',
    targetType: 'User',
    targetKey: email,
    userId: null,
    userLogin: null,
    userName: null,
    userRole: null,
    before: null,
    after: null,
    reason: 'no role mapped for stanowisko',
    metadata: { stanowiskoCode, magspaceEmployeeId: 'emp-x' },
    ipAddress: null,
    createdAt: new Date(at),
  };
}

const UPDATED_AT = new Date('2026-09-20T08:00:00.000Z');

function mappingRow(code: string, role: AssignableRole, lider: boolean): StanowiskoRoleMappingRow {
  return {
    id: `m-${code}`,
    stanowiskoCode: code,
    stanowiskoName: `${code} (zapisane)`,
    role,
    lider,
    createdAt: UPDATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function makeHarness(
  rows: AuditLogRow[],
  activeUsers: Array<Pick<UserRow, 'id' | 'email'>> = [],
  opts: {
    saved?: StanowiskoRoleMappingRow[];
    live?: { code: string; name: string }[];
    magspaceDown?: boolean;
  } = {},
) {
  const auditQuery = {
    list: jest.fn(async () => rows),
  } as unknown as jest.Mocked<AuditQueryRepository>;
  const userRows = {
    findActiveByEmails: jest.fn(async () => activeUsers as UserRow[]),
  } as unknown as jest.Mocked<UsersRepository>;
  const directory = {
    grantAccess: jest.fn(),
  } as unknown as jest.Mocked<DirectoryService>;
  const users = {
    toDto: jest.fn((row: UserRow) => ({ id: row.id, login: row.login })),
  } as unknown as jest.Mocked<UsersService>;

  const saved = new Map((opts.saved ?? []).map((m) => [m.stanowiskoCode, m]));
  const mappings = {
    findAll: jest.fn(async () => [...saved.values()]),
    findByCode: jest.fn(async (code: string) => saved.get(code) ?? null),
    upsert: jest.fn(async (code: string, name: string, role: AssignableRole, lider: boolean) => {
      const row = { ...mappingRow(code, role, lider), stanowiskoName: name };
      saved.set(code, row);
      return row;
    }),
  } as unknown as jest.Mocked<StanowiskoRoleMappingRepository>;
  const magspace = {
    isConfigured: true,
    listStanowiska: jest.fn(async () => {
      if (opts.magspaceDown) throw new Error('magspace down');
      return opts.live ?? [];
    }),
  } as unknown as jest.Mocked<MagspaceClient>;
  const state = {
    lastReconcileAt: jest.fn(async () => null),
  } as unknown as jest.Mocked<DirectoryState>;

  const svc = new SsoService(
    mappings,
    magspace,
    state,
    auditQuery,
    directory,
    users,
    userRows,
  );
  return { svc, auditQuery, userRows, directory, users, mappings, magspace };
}

/** Runs a mutating call inside an audit context, the way the interceptor does. */
async function audited<T>(fn: () => Promise<T>): Promise<{ result: T; store: AuditContextStore }> {
  const store: AuditContextStore = {
    actor: { userId: 'admin-1', userRole: 'admin' } as AuditContextStore['actor'],
    ipAddress: null,
  };
  const result = await AuditContext.run(store, fn);
  return { result, store };
}

describe('SsoService.listRecentDenials', () => {
  it('scans a wide window of refusal events, not just one page', async () => {
    const h = makeHarness([]);

    await h.svc.listRecentDenials();

    expect(h.auditQuery.list).toHaveBeenCalledWith({ action: 'denyDirectoryAccess', limit: 200 });
  });

  it('collapses repeated refusals of one address into the latest, case-insensitively', async () => {
    // Newest first, as the repository returns them.
    const h = makeHarness([
      denial('Jan.Kowalski@magtrans.eu', '2026-09-10T09:00:00.000Z', 'CONTROLLING'),
      denial('anna.nowak@magtrans.eu', '2026-09-10T08:00:00.000Z', 'HANDEL_LIDER'),
      denial('jan.kowalski@magtrans.eu', '2026-09-09T09:00:00.000Z', 'HANDEL_SPEDYTOR'),
      denial('anna.nowak@magtrans.eu', '2026-09-08T08:00:00.000Z', 'HANDEL_LIDER'),
    ]);

    const items = await h.svc.listRecentDenials();

    expect(items).toEqual([
      {
        email: 'Jan.Kowalski@magtrans.eu',
        stanowiskoCode: 'CONTROLLING',
        at: '2026-09-10T09:00:00.000Z',
        status: 'pending',
        userId: null,
      },
      {
        email: 'anna.nowak@magtrans.eu',
        stanowiskoCode: 'HANDEL_LIDER',
        at: '2026-09-10T08:00:00.000Z',
        status: 'pending',
        userId: null,
      },
    ]);
  });

  it('marks a person granted, with the account id, once an active account exists', async () => {
    const h = makeHarness(
      [
        denial('JAN.kowalski@magtrans.eu', '2026-09-10T09:00:00.000Z'),
        denial('anna.nowak@magtrans.eu', '2026-09-10T08:00:00.000Z'),
      ],
      [{ id: '11111111-1111-4111-8111-111111111111', email: 'jan.kowalski@magtrans.eu' }],
    );

    const items = await h.svc.listRecentDenials();

    expect(items[0]).toMatchObject({
      status: 'granted',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    expect(items[1]).toMatchObject({ status: 'pending', userId: null });
    // One batched probe for the whole page.
    expect(h.userRows.findActiveByEmails).toHaveBeenCalledTimes(1);
    expect(h.userRows.findActiveByEmails).toHaveBeenCalledWith([
      'JAN.kowalski@magtrans.eu',
      'anna.nowak@magtrans.eu',
    ]);
  });

  it('trims to 20 distinct people after de-duplication', async () => {
    // 25 people, each refused twice: 50 events. A slice-before-dedupe would
    // have shown 10 people twice; the page must show 20 people once.
    // Newest first: today's round (p0 latest), then yesterday's.
    const rows: AuditLogRow[] = [];
    for (const day of ['2026-09-10', '2026-09-09']) {
      for (let i = 0; i < 25; i += 1) {
        const minute = String(59 - i).padStart(2, '0');
        rows.push(denial(`p${i}@magtrans.eu`, `${day}T10:${minute}:00.000Z`));
      }
    }
    const h = makeHarness(rows);

    const items = await h.svc.listRecentDenials();

    expect(items).toHaveLength(20);
    expect(new Set(items.map((d) => d.email)).size).toBe(20);
    expect(items[0]?.email).toBe('p0@magtrans.eu');
    expect(h.userRows.findActiveByEmails.mock.calls[0]?.[0]).toHaveLength(20);
  });

  it('keeps an address-less refusal as a pending row and never probes users with it', async () => {
    const h = makeHarness([denial(null, '2026-09-10T09:00:00.000Z', null)]);

    const items = await h.svc.listRecentDenials();

    expect(items).toEqual([
      { email: '—', stanowiskoCode: null, at: '2026-09-10T09:00:00.000Z', status: 'pending', userId: null },
    ]);
    expect(h.userRows.findActiveByEmails).toHaveBeenCalledWith([]);
  });
});

describe('SsoService.grantAccess', () => {
  it('delegates the decision to the directory and maps the row for the wire', async () => {
    const h = makeHarness([]);
    const row = { id: 'u-9', login: 'jan.kowalski' } as UserRow;
    h.directory.grantAccess.mockResolvedValue({ user: row, outcome: 'reactivated' });

    const out = await h.svc.grantAccess({ email: 'jan.kowalski@magtrans.eu', role: 'eksport' });

    // No `lider` on the wire = not a leader.
    expect(h.directory.grantAccess).toHaveBeenCalledWith('jan.kowalski@magtrans.eu', 'eksport', false);
    expect(h.users.toDto).toHaveBeenCalledWith(row);
    expect(out).toEqual({ user: { id: 'u-9', login: 'jan.kowalski' }, outcome: 'reactivated' });
  });

  it('forwards the leader flag (docs/28 — an eksport / DAF leader is granted this way)', async () => {
    const h = makeHarness([]);
    h.directory.grantAccess.mockResolvedValue({
      user: { id: 'u-9', login: 'jan.kowalski' } as UserRow,
      outcome: 'created',
    });

    await h.svc.grantAccess({ email: 'jan.kowalski@magtrans.eu', role: 'eksport', lider: true });

    expect(h.directory.grantAccess).toHaveBeenCalledWith('jan.kowalski@magtrans.eu', 'eksport', true);
  });
});

// ── Stanowisko → role mapping (docs/24 §A5 + docs/28 §2) ───

describe('SsoService.listStanowiskoRoles', () => {
  it('carries each saved row’s leader flag; an unmapped stanowisko is lider=false', async () => {
    const h = makeHarness([], [], {
      saved: [mappingRow('PLANISTA_LIDER', 'planista', true), mappingRow('DAWNE', 'opiekun', false)],
      live: [
        { code: 'PLANISTA_LIDER', name: 'Planista lider' },
        { code: 'KAM', name: 'KAM' },
      ],
    });

    const out = await h.svc.listStanowiskoRoles();

    expect(out.magspaceOk).toBe(true);
    expect(out.items).toEqual([
      {
        code: 'DAWNE',
        name: 'DAWNE (zapisane)',
        role: 'opiekun',
        lider: false,
        knownToMagspace: false,
        updatedAt: UPDATED_AT.toISOString(),
      },
      { code: 'KAM', name: 'KAM', role: null, lider: false, knownToMagspace: true, updatedAt: null },
      {
        code: 'PLANISTA_LIDER',
        name: 'Planista lider',
        role: 'planista',
        lider: true,
        knownToMagspace: true,
        updatedAt: UPDATED_AT.toISOString(),
      },
    ]);
  });

  it('keeps the flag on saved rows during a MAGSpace outage', async () => {
    const h = makeHarness([], [], {
      saved: [mappingRow('DYSPOZYTOR_KIEROWNIK', 'dyspozytor', true)],
      magspaceDown: true,
    });

    const out = await h.svc.listStanowiskoRoles();

    expect(out.magspaceOk).toBe(false);
    expect(out.items).toEqual([
      expect.objectContaining({ code: 'DYSPOZYTOR_KIEROWNIK', lider: true, knownToMagspace: false }),
    ]);
  });
});

describe('SsoService.setStanowiskoRole', () => {
  /** Captures the rejection so status + extensions can be asserted together. */
  async function refusal(p: Promise<unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
    try {
      await p;
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const e = err as HttpException;
      return { status: e.getStatus(), body: e.getResponse() as Record<string, unknown> };
    }
    throw new Error('expected the PUT to be refused');
  }

  it('maps a new stanowisko as a leader one when asked', async () => {
    const h = makeHarness([], [], { live: [{ code: 'PLANISTA_LIDER', name: 'Planista lider' }] });

    const { result, store } = await audited(() =>
      h.svc.setStanowiskoRole('PLANISTA_LIDER', 'planista', true),
    );

    expect(h.mappings.upsert).toHaveBeenCalledWith('PLANISTA_LIDER', 'Planista lider', 'planista', true);
    expect(result).toMatchObject({ code: 'PLANISTA_LIDER', role: 'planista', lider: true, knownToMagspace: true });
    // Nothing existed before — the audit row has no "before".
    expect(store.before).toBeUndefined();
  });

  it('a new row without lider is not a leader row', async () => {
    const h = makeHarness([], [], { live: [{ code: 'PLANISTA', name: 'Planista' }] });

    await h.svc.setStanowiskoRole('PLANISTA', 'planista');

    expect(h.mappings.upsert).toHaveBeenCalledWith('PLANISTA', 'Planista', 'planista', false);
  });

  it('omitted lider KEEPS the stored flag — `{ role }` from today’s web must not wipe it', async () => {
    const h = makeHarness([], [], {
      saved: [mappingRow('DYSPOZYTOR_KIEROWNIK', 'dyspozytor', true)],
      live: [{ code: 'DYSPOZYTOR_KIEROWNIK', name: 'Dyspozytor kierownik' }],
    });

    const { result, store } = await audited(() =>
      h.svc.setStanowiskoRole('DYSPOZYTOR_KIEROWNIK', 'dyspozytor'),
    );

    expect(h.mappings.upsert).toHaveBeenCalledWith(
      'DYSPOZYTOR_KIEROWNIK',
      'Dyspozytor kierownik',
      'dyspozytor',
      true,
    );
    expect(result.lider).toBe(true);
    expect(store.before).toMatchObject({ role: 'dyspozytor', lider: true });
  });

  it('an explicit lider=false clears the flag; before → after lands in the audit context', async () => {
    const h = makeHarness([], [], {
      saved: [mappingRow('PLANISTA_LIDER', 'planista', true)],
      live: [{ code: 'PLANISTA_LIDER', name: 'Planista lider' }],
    });

    const { result, store } = await audited(() =>
      h.svc.setStanowiskoRole('PLANISTA_LIDER', 'planista', false),
    );

    expect(result.lider).toBe(false);
    expect(store.before).toEqual({
      code: 'PLANISTA_LIDER',
      name: 'PLANISTA_LIDER (zapisane)',
      role: 'planista',
      lider: true,
      updatedAt: UPDATED_AT.toISOString(),
    });
  });

  it('422 when the resulting pair is out of the invariant — re-pointing a leader row at weryfikator', async () => {
    // Not a silent loss of the flag: the admin must send `lider: false` too.
    const h = makeHarness([], [], { saved: [mappingRow('PLANISTA_LIDER', 'planista', true)] });

    const r = await refusal(h.svc.setStanowiskoRole('PLANISTA_LIDER', 'weryfikator'));

    expect(r.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(r.body).toMatchObject({ extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE' } });
    expect(h.mappings.upsert).not.toHaveBeenCalled();
    // Refused before the network round-trip.
    expect(h.magspace.listStanowiska).not.toHaveBeenCalled();
  });

  it('the same re-point with lider=false goes through', async () => {
    const h = makeHarness([], [], { saved: [mappingRow('PLANISTA_LIDER', 'planista', true)] });

    const out = await h.svc.setStanowiskoRole('PLANISTA_LIDER', 'weryfikator', false);

    expect(out).toMatchObject({ role: 'weryfikator', lider: false });
  });

  it('422 for an explicit lider on a role outside LIDER_ROLES (pipe bypassed)', async () => {
    const h = makeHarness([]);

    const r = await refusal(h.svc.setStanowiskoRole('CONTROLLING', 'weryfikator', true));

    expect(r.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(r.body).toMatchObject({ extensions: { code: 'USER_LIDER_REQUIRES_LIDER_ROLE' } });
  });

  it('saves with the stored name when MAGSpace is down, flag included', async () => {
    const h = makeHarness([], [], {
      saved: [mappingRow('PLANISTA_LIDER', 'planista', true)],
      magspaceDown: true,
    });

    const out = await h.svc.setStanowiskoRole('PLANISTA_LIDER', 'planista');

    expect(h.mappings.upsert).toHaveBeenCalledWith(
      'PLANISTA_LIDER',
      'PLANISTA_LIDER (zapisane)',
      'planista',
      true,
    );
    expect(out.knownToMagspace).toBe(false);
  });
});
