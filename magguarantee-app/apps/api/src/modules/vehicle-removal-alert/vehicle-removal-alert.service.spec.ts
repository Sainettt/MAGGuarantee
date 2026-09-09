// Vehicle-removal alert cron unit tests (vehicle-status rework, Step B — Part 3).
// Hand-rolled fakes over `jest.fn` (same posture as guarantee-watchdog.service.
// spec). We exercise the partition + dedup + fan-out contract:
//   - a `do_usuniecia` vehicle with a null stamp → mailed + stamped + count++;
//   - a vehicle stamped 2 days ago → NOT re-mailed (inside the repeat window);
//   - a vehicle stamped 3 days ago → re-mailed (window elapsed);
//   - a relapsed (now `stojaca`) stamped vehicle → stamp cleared, no mail;
//   - an empty due set → no admin mail;
//   - the kill-switch short-circuits the whole run;
//   - one admin per digest; a total mail failure does NOT stamp (retry next run).

import type { VehicleDelegationStatus } from '../vehicles/vehicle-delegation-status.repository';
import type { VehicleDelegationStatusRepository } from '../vehicles/vehicle-delegation-status.repository';
import type { MailService } from '../mail/mail.service';
import type { UsersRepository, UserRow } from '../users/users.repository';
import { VehicleRemovalAlertService } from './vehicle-removal-alert.service';
import type {
  RemovalAlertVehicleRow,
  VehicleRemovalAlertRepository,
} from './vehicle-removal-alert.repository';

// A fixed instant well clear of any edge: Wed 2026-06-10 09:00 UTC (11:00 Warsaw).
const NOW = new Date('2026-06-10T09:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const REPEAT_DAYS = 3;

/** An instant `n` calendar days before NOW. */
function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * DAY_MS);
}

let vehSeq = 0;
function makeVehicle(
  overrides: Partial<RemovalAlertVehicleRow> = {},
): RemovalAlertVehicleRow {
  vehSeq += 1;
  return {
    id: `veh-${vehSeq}`,
    plateNumber: `WX${String(vehSeq).padStart(5, '0')}`,
    sideNumber: null,
    // Fallback anchor far in the past so createdAt alone → do_usuniecia unless
    // a delegation lastReturnAt overrides it.
    createdAt: daysAgo(60),
    adminRemovalNotifiedAt: null,
    adminRemovalNotifyCount: 0,
    carrier: { id: 'car-1', name: 'TransLogis Sp. z o.o.' },
    ...overrides,
  };
}

function makeAdmin(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'adm-1',
    login: 'admin1',
    email: 'admin1@magtrans.eu',
    passwordHash: 'hash',
    role: 'admin',
    name: 'Admin One',
    active: true,
    liderEmail: null,
    teamId: null,
    mustChangePassword: false,
    passwordChangedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    // SSO defaults — a hand-created, locally managed account (docs/24).
    authProvider: 'local',
    managedBy: 'local',
    googleSub: null,
    magspaceEmployeeId: null,
    directorySyncedAt: null,
    roleOverride: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

interface Harness {
  service: VehicleRemovalAlertService;
  repo: {
    findLiveVehicles: jest.Mock;
    stampNotified: jest.Mock;
    clearNotified: jest.Mock;
  };
  mail: { enqueueVehicleRemovalAdmin: jest.Mock };
  users: { listByRole: jest.Mock };
}

function makeHarness(opts: {
  vehicles?: RemovalAlertVehicleRow[];
  /** Per-vehicle delegation state; missing ids → { false, null }. */
  delegation?: Record<string, VehicleDelegationStatus>;
  admins?: UserRow[];
  enabled?: boolean;
  repeatDays?: number;
  mailImpl?: () => Promise<void>;
} = {}): Harness {
  const findLiveVehicles = jest.fn(async () => opts.vehicles ?? []);
  const stampNotified = jest.fn(async () => undefined);
  const clearNotified = jest.fn(async () => undefined);
  const repo = { findLiveVehicles, stampNotified, clearNotified };

  const getByVehicleIds = jest.fn(async (ids: string[]) => {
    const map = new Map<string, VehicleDelegationStatus>();
    for (const id of ids) {
      map.set(
        id,
        opts.delegation?.[id] ?? { hasActiveDelegation: false, lastReturnAt: null },
      );
    }
    return map;
  });
  const delegationStatus = { getByVehicleIds };

  const listByRole = jest.fn(async () => opts.admins ?? [makeAdmin()]);
  const users = { listByRole };

  const enqueueVehicleRemovalAdmin = jest.fn(
    opts.mailImpl ?? (async () => undefined),
  );
  const mail = { enqueueVehicleRemovalAdmin };

  const config = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'VEHICLE_REMOVAL_ALERT_ENABLED':
          return opts.enabled ?? true;
        case 'VEHICLE_REMOVAL_ALERT_REPEAT_DAYS':
          return opts.repeatDays ?? REPEAT_DAYS;
        default:
          return undefined;
      }
    }),
  } as never;

  const service = new VehicleRemovalAlertService(
    repo as unknown as VehicleRemovalAlertRepository,
    delegationStatus as unknown as VehicleDelegationStatusRepository,
    users as unknown as UsersRepository,
    mail as unknown as MailService,
    config,
  );
  return { service, repo, mail, users };
}

beforeEach(() => {
  vehSeq = 0;
});

describe('VehicleRemovalAlertService.runDaily — due / dedup / stamp', () => {
  it('do_usuniecia vehicle with null stamp → mailed + stamped', async () => {
    const v = makeVehicle({ id: 'veh-1', adminRemovalNotifiedAt: null });
    const h = makeHarness({
      vehicles: [v],
      delegation: { 'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(35) } },
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueVehicleRemovalAdmin).toHaveBeenCalledTimes(1);
    const [email, props] = h.mail.enqueueVehicleRemovalAdmin.mock.calls[0] as [
      string,
      { rows: { plateNumber: string; daysSinceReturn: number }[] },
    ];
    expect(email).toBe('admin1@magtrans.eu');
    expect(props.rows).toHaveLength(1);
    expect(props.rows[0]?.daysSinceReturn).toBe(35);
    // Stamped after the successful enqueue (adminRemovalNotifyCount++ in repo).
    expect(h.repo.stampNotified).toHaveBeenCalledWith('veh-1', NOW);
  });

  it('vehicle stamped 2 days ago is NOT re-mailed (inside repeat window)', async () => {
    const v = makeVehicle({ id: 'veh-1', adminRemovalNotifiedAt: daysAgo(2) });
    const h = makeHarness({
      vehicles: [v],
      delegation: { 'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(35) } },
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueVehicleRemovalAdmin).not.toHaveBeenCalled();
    expect(h.repo.stampNotified).not.toHaveBeenCalled();
    // Still `do_usuniecia` → not a relapse, no clear.
    expect(h.repo.clearNotified).not.toHaveBeenCalled();
  });

  it('vehicle stamped 3 days ago IS re-mailed (repeat window elapsed)', async () => {
    const v = makeVehicle({ id: 'veh-1', adminRemovalNotifiedAt: daysAgo(3) });
    const h = makeHarness({
      vehicles: [v],
      delegation: { 'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(40) } },
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueVehicleRemovalAdmin).toHaveBeenCalledTimes(1);
    expect(h.repo.stampNotified).toHaveBeenCalledWith('veh-1', NOW);
  });

  it('relapsed (now stojaca) stamped vehicle → stamp cleared, no mail', async () => {
    const v = makeVehicle({ id: 'veh-1', adminRemovalNotifiedAt: daysAgo(4) });
    const h = makeHarness({
      vehicles: [v],
      // lastReturnAt 5 days ago → stojaca (0–14) → relapsed out of do_usuniecia.
      delegation: { 'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(5) } },
    });

    await h.service.runDaily(NOW);

    expect(h.repo.clearNotified).toHaveBeenCalledWith('veh-1');
    expect(h.mail.enqueueVehicleRemovalAdmin).not.toHaveBeenCalled();
    expect(h.repo.stampNotified).not.toHaveBeenCalled();
  });

  it('empty due set → no admin lookup, no mail', async () => {
    const v = makeVehicle({ id: 'veh-1', adminRemovalNotifiedAt: null });
    const h = makeHarness({
      vehicles: [v],
      // stojaca, never notified → nothing to do at all.
      delegation: { 'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(3) } },
    });

    await h.service.runDaily(NOW);

    expect(h.users.listByRole).not.toHaveBeenCalled();
    expect(h.mail.enqueueVehicleRemovalAdmin).not.toHaveBeenCalled();
    expect(h.repo.clearNotified).not.toHaveBeenCalled();
  });
});

describe('VehicleRemovalAlertService.runDaily — fan-out & resilience', () => {
  it('one digest per active admin listing all due vehicles', async () => {
    const h = makeHarness({
      vehicles: [
        makeVehicle({ id: 'veh-1' }),
        makeVehicle({ id: 'veh-2' }),
      ],
      delegation: {
        'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(35) },
        'veh-2': { hasActiveDelegation: false, lastReturnAt: daysAgo(50) },
      },
      admins: [
        makeAdmin({ id: 'adm-1', email: 'a1@magtrans.eu' }),
        makeAdmin({ id: 'adm-2', email: 'a2@magtrans.eu' }),
      ],
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueVehicleRemovalAdmin).toHaveBeenCalledTimes(2);
    for (const call of h.mail.enqueueVehicleRemovalAdmin.mock.calls) {
      const props = call[1] as { rows: unknown[] };
      expect(props.rows).toHaveLength(2);
    }
    // Each due vehicle stamped once.
    expect(h.repo.stampNotified).toHaveBeenCalledTimes(2);
  });

  it('kill-switch short-circuits: no scope query, no mail', async () => {
    const h = makeHarness({
      enabled: false,
      vehicles: [makeVehicle({ id: 'veh-1' })],
    });

    await h.service.runDaily(NOW);

    expect(h.repo.findLiveVehicles).not.toHaveBeenCalled();
    expect(h.mail.enqueueVehicleRemovalAdmin).not.toHaveBeenCalled();
  });

  it('a total mail failure does NOT stamp (retry next run)', async () => {
    const h = makeHarness({
      vehicles: [makeVehicle({ id: 'veh-1' })],
      delegation: { 'veh-1': { hasActiveDelegation: false, lastReturnAt: daysAgo(35) } },
      mailImpl: async () => {
        throw new Error('550 mailbox unavailable');
      },
    });

    await expect(h.service.runDaily(NOW)).resolves.toBeUndefined();
    // No admin enqueued successfully → nothing stamped.
    expect(h.repo.stampNotified).not.toHaveBeenCalled();
  });

  it('an active delegation keeps the vehicle off the due list (aktywna)', async () => {
    const h = makeHarness({
      vehicles: [makeVehicle({ id: 'veh-1', adminRemovalNotifiedAt: null })],
      delegation: { 'veh-1': { hasActiveDelegation: true, lastReturnAt: daysAgo(35) } },
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueVehicleRemovalAdmin).not.toHaveBeenCalled();
  });
});
