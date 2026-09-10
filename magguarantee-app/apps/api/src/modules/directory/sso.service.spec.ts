// SSO admin surface: the refused-sign-in queue and the grant wrapper
// (docs/24 §A5/§10). The grant's decision logic is covered in
// directory.service.spec.ts; here only the shaping around it.

import type { AuditLogRow, AuditQueryRepository } from '../audit/audit-query.repository';
import type { UsersRepository, UserRow } from '../users/users.repository';
import type { UsersService } from '../users/users.service';
import type { DirectoryService } from './directory.service';
import type { DirectoryState } from './directory-state';
import type { MagspaceClient } from './magspace.client';
import { SsoService } from './sso.service';
import type { StanowiskoRoleMappingRepository } from './stanowisko-role-mapping.repository';

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

function makeHarness(rows: AuditLogRow[], activeUsers: Array<Pick<UserRow, 'id' | 'email'>> = []) {
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

  const svc = new SsoService(
    {} as StanowiskoRoleMappingRepository,
    {} as MagspaceClient,
    {} as DirectoryState,
    auditQuery,
    directory,
    users,
    userRows,
  );
  return { svc, auditQuery, userRows, directory, users };
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

    expect(h.directory.grantAccess).toHaveBeenCalledWith('jan.kowalski@magtrans.eu', 'eksport');
    expect(h.users.toDto).toHaveBeenCalledWith(row);
    expect(out).toEqual({ user: { id: 'u-9', login: 'jan.kowalski' }, outcome: 'reactivated' });
  });
});
