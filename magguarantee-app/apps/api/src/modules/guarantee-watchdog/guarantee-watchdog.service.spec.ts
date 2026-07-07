// Guarantee Watchdog cron + hook unit tests (plan §5/§7). Hand-rolled fakes
// over `jest.fn` (same posture as verification-sla.service.spec). We exercise:
//   - trigger-rule matrix: D-3, D-1, violated, catch-up (single mail),
//     daysLeft=0 no-op (healthy), early-counting no episode row;
//   - idempotency: a second same-day run sends nothing;
//   - flag copy-on-reopen for the same anchor;
//   - auto-resolve reasons (wyjazd / vehicle_inactive);
//   - the add()-hook resolves an open episode and never throws;
//   - opiekun scoping (foreign carrier invisible on the board);
//   - enabled=false short-circuit.
//
// Working-day anchors are derived the SAME way as the SLA spec — from the
// shared `addPolishWorkingDays` / `isPolishWorkingDay` engine — so the fixtures
// stay in lockstep with `computeGuaranteeWatchdog`.

import {
  addPolishWorkingDays,
  isPolishWorkingDay,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { MailService } from '../mail/mail.service';
import {
  GuaranteeWatchdogService,
} from './guarantee-watchdog.service';
import type {
  GuaranteeEpisodeRow,
  GuaranteeWatchdogRepository,
  WatchdogVehicleScopeRow,
} from './guarantee-watchdog.repository';

// A stable weekday well clear of Polish holidays (Wed 2026-06-10, same as the
// SLA spec) so the working-day arithmetic never straddles a holiday cluster.
const NOW = new Date(2026, 5, 10);
const DEADLINE_WORKING_DAYS = 10;
const REMINDER_OFFSETS = [3, 1];

/** Walk `n` Polish working days backward (anchor day excluded). */
function subtractPolishWorkingDays(date: Date, n: number): Date {
  const cursor = new Date(date);
  let remaining = n;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    if (isPolishWorkingDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/**
 * An anchor date whose `computeGuaranteeWatchdog({today: NOW}).daysLeft === k`.
 * deadline = anchor + 10 working days; daysLeft = workingDaysBetween(NOW,
 * deadline). Invert: deadline = NOW ± k working days; anchor = deadline − 10.
 */
function anchorForDaysLeft(k: number): Date {
  const deadline =
    k >= 0
      ? addPolishWorkingDays(NOW, k)
      : subtractPolishWorkingDays(NOW, -k);
  return subtractPolishWorkingDays(deadline, DEADLINE_WORKING_DAYS);
}

let vehSeq = 0;
function makeScopeRow(
  overrides: Partial<WatchdogVehicleScopeRow> = {},
): WatchdogVehicleScopeRow {
  vehSeq += 1;
  return {
    vehicleId: `veh-${vehSeq}`,
    plateNumber: `WX${String(vehSeq).padStart(5, '0')}`,
    sideNumber: null,
    agreementSince: null,
    hasActiveDelegation: false,
    lastReturnAt: anchorForDaysLeft(3),
    carrier: {
      id: 'car-1',
      name: 'TransLogis Sp. z o.o.',
      opiekunId: 'op-1',
      userId: 'usr-car-1',
    },
    ...overrides,
  };
}

let epSeq = 0;
function makeEpisode(
  overrides: Partial<GuaranteeEpisodeRow> = {},
): GuaranteeEpisodeRow {
  epSeq += 1;
  return {
    id: `ep-${epSeq}`,
    vehicleId: 'veh-1',
    carrierId: 'car-1',
    anchorAt: anchorForDaysLeft(1),
    anchorSource: 'zjechal',
    deadlineAt: addPolishWorkingDays(anchorForDaysLeft(1), DEADLINE_WORKING_DAYS),
    state: 'warning',
    reminder3SentAt: null,
    reminder1SentAt: null,
    violationSentAt: null,
    violatedAt: null,
    resolvedAt: null,
    resolvedByDelegationId: null,
    resolvedDaysLeft: null,
    resolvedReason: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

interface Harness {
  service: GuaranteeWatchdogService;
  repo: {
    findGuaranteedVehiclesInScope: jest.Mock;
    findOpenEpisodes: jest.Mock;
    findOpenEpisodeByVehicle: jest.Mock;
    findLatestEpisodeForAnchor: jest.Mock;
    createEpisode: jest.Mock;
    updateEpisode: jest.Mock;
    listEpisodes: jest.Mock;
    findUserEmail: jest.Mock;
    findOpiekunRecipient: jest.Mock;
  };
  mail: {
    enqueueGuaranteeReminderCarrier: jest.Mock;
    enqueueGuaranteeOpiekunDigest: jest.Mock;
  };
  /** In-memory store keyed by episode id, updated by createEpisode/updateEpisode. */
  store: Map<string, GuaranteeEpisodeRow>;
}

function makeHarness(opts: {
  scope?: WatchdogVehicleScopeRow[];
  openEpisodes?: GuaranteeEpisodeRow[];
  priorEpisode?: GuaranteeEpisodeRow | null;
  enabled?: boolean;
  carrierEmail?: string | null;
  opiekun?: { email: string; name: string } | null;
  reminderSendImpl?: (email: string) => Promise<void>;
} = {}): Harness {
  const store = new Map<string, GuaranteeEpisodeRow>();
  for (const e of opts.openEpisodes ?? []) store.set(e.id, { ...e });

  const findGuaranteedVehiclesInScope = jest.fn(async () => opts.scope ?? []);
  const findOpenEpisodes = jest.fn(async () => {
    const map = new Map<string, GuaranteeEpisodeRow>();
    for (const e of store.values()) {
      if (e.state !== 'resolved') map.set(e.vehicleId, e);
    }
    return map;
  });
  const findOpenEpisodeByVehicle = jest.fn(async (vehicleId: string) => {
    for (const e of store.values()) {
      if (e.vehicleId === vehicleId && e.state !== 'resolved') return e;
    }
    return null;
  });
  const findLatestEpisodeForAnchor = jest.fn(
    async () => opts.priorEpisode ?? null,
  );
  const createEpisode = jest.fn(async (data: Record<string, unknown>) => {
    epSeq += 1;
    const row = makeEpisode({
      id: `ep-new-${epSeq}`,
      ...(data as Partial<GuaranteeEpisodeRow>),
    });
    store.set(row.id, row);
    return row;
  });
  const updateEpisode = jest.fn(
    async (id: string, patch: Partial<GuaranteeEpisodeRow>) => {
      const existing = store.get(id) ?? makeEpisode({ id });
      const merged = { ...existing, ...patch };
      store.set(id, merged);
      return merged;
    },
  );
  const listEpisodes = jest.fn(async () => []);
  const findUserEmail = jest.fn(async () =>
    opts.carrierEmail === undefined ? 'carrier@example.com' : opts.carrierEmail,
  );
  const findOpiekunRecipient = jest.fn(async () =>
    opts.opiekun === undefined
      ? { email: 'opiekun@magtrans.eu', name: 'Opiekun One' }
      : opts.opiekun,
  );

  const repo = {
    findGuaranteedVehiclesInScope,
    findOpenEpisodes,
    findOpenEpisodeByVehicle,
    findLatestEpisodeForAnchor,
    createEpisode,
    updateEpisode,
    listEpisodes,
    findUserEmail,
    findOpiekunRecipient,
  };

  const enqueueGuaranteeReminderCarrier = jest.fn(
    opts.reminderSendImpl ?? (async () => undefined),
  );
  const enqueueGuaranteeOpiekunDigest = jest.fn(async () => undefined);
  const mail = {
    enqueueGuaranteeReminderCarrier,
    enqueueGuaranteeOpiekunDigest,
  };

  const config = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'GUARANTEE_WATCHDOG_ENABLED':
          return opts.enabled ?? true;
        case 'GUARANTEE_DEADLINE_WORKING_DAYS':
          return DEADLINE_WORKING_DAYS;
        case 'GUARANTEE_REMINDER_OFFSETS':
          return REMINDER_OFFSETS;
        case 'APP_URL':
          return 'http://localhost:3000';
        default:
          return undefined;
      }
    }),
  } as never;

  const service = new GuaranteeWatchdogService(
    repo as unknown as GuaranteeWatchdogRepository,
    mail as unknown as MailService,
    config,
  );
  return { service, repo, mail, store };
}

beforeEach(() => {
  vehSeq = 0;
  epSeq = 0;
});

describe('GuaranteeWatchdogService.runDaily — trigger matrix', () => {
  it('sends D-3 reminder and stamps reminder3SentAt (no episode existed)', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(3) })],
    });

    await h.service.runDaily(NOW);

    expect(h.repo.createEpisode).toHaveBeenCalledTimes(1);
    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);
    const [, props] = h.mail.enqueueGuaranteeReminderCarrier.mock.calls[0] as [
      string,
      { rows: { daysLeft: number }[] },
    ];
    expect(props.rows[0]?.daysLeft).toBe(3);
    // reminder3SentAt stamped, reminder1SentAt still null.
    const ep = [...h.store.values()][0]!;
    expect(ep.reminder3SentAt).not.toBeNull();
    expect(ep.reminder1SentAt).toBeNull();
  });

  it('sends D-1 reminder and backfills a suppressed late D-3', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(1) })],
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);
    const ep = [...h.store.values()][0]!;
    // Both flags set: D-1 sent AND the late D-3 backfilled (suppressed).
    expect(ep.reminder1SentAt).not.toBeNull();
    expect(ep.reminder3SentAt).not.toBeNull();
  });

  it('daysLeft=0 (deadline today) is still counting — sends D-1 once, not violated', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(0) })],
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);
    const ep = [...h.store.values()][0]!;
    expect(ep.state).toBe('warning'); // NOT violated on the deadline day
    expect(ep.violatedAt).toBeNull();
    expect(ep.reminder1SentAt).not.toBeNull();
  });

  it('daysLeft>3 early-counting records NO episode row and sends nothing', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(5) })],
    });

    await h.service.runDaily(NOW);

    expect(h.repo.createEpisode).not.toHaveBeenCalled();
    expect(h.mail.enqueueGuaranteeReminderCarrier).not.toHaveBeenCalled();
    expect(h.mail.enqueueGuaranteeOpiekunDigest).not.toHaveBeenCalled();
  });

  it('violated: creates a violated episode, opiekun digest only, NO carrier mail', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(-2) })],
    });

    await h.service.runDaily(NOW);

    // Carrier gets NO violation mail (client decision).
    expect(h.mail.enqueueGuaranteeReminderCarrier).not.toHaveBeenCalled();
    // Opiekun digest carries the violation.
    expect(h.mail.enqueueGuaranteeOpiekunDigest).toHaveBeenCalledTimes(1);
    const [, digest] = h.mail.enqueueGuaranteeOpiekunDigest.mock.calls[0] as [
      string,
      { violations: { rows: unknown[] }[]; dueSoon: unknown[] },
    ];
    expect(digest.violations).toHaveLength(1);
    expect(digest.dueSoon).toHaveLength(0);
    const ep = [...h.store.values()][0]!;
    expect(ep.state).toBe('violated');
    expect(ep.violatedAt).not.toBeNull();
    expect(ep.violationSentAt).not.toBeNull();
  });

  it('catch-up: a retro-zjechał already past sends ONE mail (opiekun digest), not three', async () => {
    // daysLeft = -5 (deep past) — a single violation entry, no reminder spam.
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(-5) })],
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueGuaranteeReminderCarrier).not.toHaveBeenCalled();
    expect(h.mail.enqueueGuaranteeOpiekunDigest).toHaveBeenCalledTimes(1);
  });
});

describe('GuaranteeWatchdogService.runDaily — idempotency & dedup', () => {
  it('a second same-day run sends nothing (flags already stamped)', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(3) })],
    });

    await h.service.runDaily(NOW);
    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);

    // Second run — the open episode now has reminder3SentAt set, so no re-send.
    h.mail.enqueueGuaranteeReminderCarrier.mockClear();
    h.mail.enqueueGuaranteeOpiekunDigest.mockClear();
    await h.service.runDaily(NOW);
    expect(h.mail.enqueueGuaranteeReminderCarrier).not.toHaveBeenCalled();
    expect(h.mail.enqueueGuaranteeOpiekunDigest).not.toHaveBeenCalled();
  });

  it('does NOT re-stamp violationSentAt on a second violated run', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(-2) })],
    });

    await h.service.runDaily(NOW);
    expect(h.mail.enqueueGuaranteeOpiekunDigest).toHaveBeenCalledTimes(1);

    h.mail.enqueueGuaranteeOpiekunDigest.mockClear();
    await h.service.runDaily(NOW);
    expect(h.mail.enqueueGuaranteeOpiekunDigest).not.toHaveBeenCalled();
  });
});

describe('GuaranteeWatchdogService.runDaily — flag copy on reopen', () => {
  it('copies reminder flags from the prior same-anchor episode (reopen after anulowany)', async () => {
    const anchor = anchorForDaysLeft(1);
    const prior = makeEpisode({
      id: 'ep-prior',
      vehicleId: 'veh-1',
      anchorAt: anchor,
      state: 'resolved',
      reminder3SentAt: new Date(2026, 5, 5),
      reminder1SentAt: new Date(2026, 5, 8),
      resolvedReason: 'wyjazd',
      resolvedAt: new Date(2026, 5, 8),
    });
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchor })],
      priorEpisode: prior,
    });

    await h.service.runDaily(NOW);

    // The new episode inherits the sent-flags → no re-send.
    const created = h.repo.createEpisode.mock.calls[0]?.[0] as {
      reminder3SentAt: Date | null;
      reminder1SentAt: Date | null;
    };
    expect(created.reminder3SentAt).toEqual(prior.reminder3SentAt);
    expect(created.reminder1SentAt).toEqual(prior.reminder1SentAt);
    // Already-sent D-1 → no carrier reminder this run.
    expect(h.mail.enqueueGuaranteeReminderCarrier).not.toHaveBeenCalled();
  });
});

describe('GuaranteeWatchdogService.runDaily — auto-resolve', () => {
  it('resolves an open episode with reason=wyjazd when the vehicle is ok_active', async () => {
    const open = makeEpisode({ id: 'ep-open', vehicleId: 'veh-1', state: 'warning' });
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', hasActiveDelegation: true })],
      openEpisodes: [open],
    });

    await h.service.runDaily(NOW);

    const resolved = h.store.get('ep-open')!;
    expect(resolved.state).toBe('resolved');
    expect(resolved.resolvedReason).toBe('wyjazd');
  });

  it('resolves with reason=vehicle_inactive when the vehicle went inactive (no anchor)', async () => {
    const open = makeEpisode({ id: 'ep-open', vehicleId: 'veh-1', state: 'violated' });
    // inactive = no active delegation AND no anchor at all.
    const h = makeHarness({
      scope: [
        makeScopeRow({
          vehicleId: 'veh-1',
          hasActiveDelegation: false,
          lastReturnAt: null,
          agreementSince: null,
        }),
      ],
      openEpisodes: [open],
    });

    await h.service.runDaily(NOW);

    const resolved = h.store.get('ep-open')!;
    expect(resolved.state).toBe('resolved');
    expect(resolved.resolvedReason).toBe('vehicle_inactive');
  });
});

describe('GuaranteeWatchdogService.runDaily — resilience & config', () => {
  it('enabled=false short-circuits (no scope query, no mail)', async () => {
    const h = makeHarness({
      enabled: false,
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(1) })],
    });

    await h.service.runDaily(NOW);

    expect(h.repo.findGuaranteedVehiclesInScope).not.toHaveBeenCalled();
    expect(h.mail.enqueueGuaranteeReminderCarrier).not.toHaveBeenCalled();
  });

  it('a failing carrier reminder address does not abort the run (opiekun still sent)', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(3) })],
      reminderSendImpl: async () => {
        throw new Error('550 mailbox unavailable');
      },
    });

    await expect(h.service.runDaily(NOW)).resolves.toBeUndefined();
    // The opiekun digest is a separate fan-out and still goes out.
    expect(h.mail.enqueueGuaranteeOpiekunDigest).toHaveBeenCalledTimes(1);
    // Reminder failed → its flag is NOT stamped (retry next run).
    const ep = [...h.store.values()][0]!;
    expect(ep.reminder3SentAt).toBeNull();
  });

  it('groups multiple due vehicles of one carrier into a single reminder mail', async () => {
    const h = makeHarness({
      scope: [
        makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(3) }),
        makeScopeRow({ vehicleId: 'veh-2', lastReturnAt: anchorForDaysLeft(1) }),
      ],
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);
    const [, props] = h.mail.enqueueGuaranteeReminderCarrier.mock.calls[0] as [
      string,
      { rows: unknown[] },
    ];
    expect(props.rows).toHaveLength(2);
  });

  it('deeplinks the carrier reminder to /carrier/delegations/new (the wyjazd form)', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ lastReturnAt: anchorForDaysLeft(3) })],
    });

    await h.service.runDaily(NOW);

    const [, props] = h.mail.enqueueGuaranteeReminderCarrier.mock.calls[0] as [
      string,
      { deeplink: string },
    ];
    expect(props.deeplink).toBe('http://localhost:3000/carrier/delegations/new');
  });
});

describe('GuaranteeWatchdogService — add()-hook (onDelegationCreated)', () => {
  it('resolves the open episode with resolvedByDelegationId + reason=wyjazd', async () => {
    const open = makeEpisode({ id: 'ep-open', vehicleId: 'veh-1', state: 'warning' });
    const h = makeHarness({ openEpisodes: [open] });

    await h.service.onDelegationCreated('veh-1', 'del-99', NOW);

    const resolved = h.store.get('ep-open')!;
    expect(resolved.state).toBe('resolved');
    expect(resolved.resolvedReason).toBe('wyjazd');
    expect(resolved.resolvedByDelegationId).toBe('del-99');
  });

  it('never throws outward even if the repo update fails', async () => {
    const open = makeEpisode({ id: 'ep-open', vehicleId: 'veh-1' });
    const h = makeHarness({ openEpisodes: [open] });
    h.repo.updateEpisode.mockRejectedValueOnce(new Error('db down'));

    await expect(
      h.service.onDelegationCreated('veh-1', 'del-99', NOW),
    ).resolves.toBeUndefined();
  });

  it('no-op when there is no open episode', async () => {
    const h = makeHarness({ openEpisodes: [] });

    await h.service.onDelegationCreated('veh-1', 'del-99', NOW);

    expect(h.repo.updateEpisode).not.toHaveBeenCalled();
  });
});

describe('GuaranteeWatchdogService — agreement-off hook (onAgreementDisabled)', () => {
  it('resolves the open episode with reason=agreement_off', async () => {
    const open = makeEpisode({ id: 'ep-open', vehicleId: 'veh-1', state: 'warning' });
    const h = makeHarness({ openEpisodes: [open] });

    await h.service.onAgreementDisabled('veh-1', NOW);

    const resolved = h.store.get('ep-open')!;
    expect(resolved.state).toBe('resolved');
    expect(resolved.resolvedReason).toBe('agreement_off');
  });

  it('never throws outward', async () => {
    const open = makeEpisode({ id: 'ep-open', vehicleId: 'veh-1' });
    const h = makeHarness({ openEpisodes: [open] });
    h.repo.updateEpisode.mockRejectedValueOnce(new Error('db down'));

    await expect(
      h.service.onAgreementDisabled('veh-1', NOW),
    ).resolves.toBeUndefined();
  });
});

describe('GuaranteeWatchdogService — board scoping', () => {
  const opiekunUser: AuthUser = {
    sub: 'op-1',
    login: 'op1',
    email: 'op1@magtrans.eu',
    name: 'Opiekun One',
    role: 'opiekun',
    mustChangePassword: false,
  };
  const adminUser: AuthUser = { ...opiekunUser, sub: 'adm-1', role: 'admin' };

  it('opiekun sees only their own carriers; a foreign carrier is invisible', async () => {
    const mine = makeScopeRow({
      vehicleId: 'veh-mine',
      lastReturnAt: anchorForDaysLeft(2),
      carrier: {
        id: 'car-1',
        name: 'Mine',
        opiekunId: 'op-1',
        userId: 'u1',
      },
    });
    const foreign = makeScopeRow({
      vehicleId: 'veh-foreign',
      lastReturnAt: anchorForDaysLeft(2),
      carrier: {
        id: 'car-2',
        name: 'Foreign',
        opiekunId: 'op-OTHER',
        userId: 'u2',
      },
    });
    const h = makeHarness({ scope: [mine, foreign] });

    const board = await h.service.getComplianceBoard(opiekunUser, NOW);

    expect(board.items).toHaveLength(1);
    expect(board.items[0]?.vehicleId).toBe('veh-mine');
    expect(board.summary.watched).toBe(1);
    expect(board.summary.dueSoon).toBe(1); // daysLeft=2, counting
  });

  it('admin sees every guaranteed vehicle', async () => {
    const h = makeHarness({
      scope: [
        makeScopeRow({ vehicleId: 'v-a', carrier: { id: 'car-1', name: 'A', opiekunId: 'op-1', userId: 'u1' } }),
        makeScopeRow({ vehicleId: 'v-b', carrier: { id: 'car-2', name: 'B', opiekunId: 'op-2', userId: 'u2' } }),
      ],
    });

    const board = await h.service.getComplianceBoard(adminUser, NOW);

    expect(board.items).toHaveLength(2);
  });

  it('board rows carry the carrier block; /me rows omit it', async () => {
    const carrierUser: AuthUser = {
      sub: 'usr-car-1',
      login: 'car1',
      email: 'car1@example.com',
      name: 'Car One',
      role: 'przewoznik',
      mustChangePassword: false,
    };
    const h = makeHarness({
      scope: [
        makeScopeRow({
          vehicleId: 'veh-1',
          lastReturnAt: anchorForDaysLeft(2),
          carrier: { id: 'car-1', name: 'Car One', opiekunId: 'op-1', userId: 'usr-car-1' },
        }),
      ],
    });

    const board = await h.service.getComplianceBoard(adminUser, NOW);
    expect(board.items[0]?.carrier).toEqual({ id: 'car-1', name: 'Car One' });

    const me = await h.service.getMyCompliance(carrierUser, NOW);
    expect(me.items[0]?.carrier).toBeUndefined();
    expect(me.items[0]?.vehicleId).toBe('veh-1');
  });

  it('rejects a non-admin/opiekun caller on the board', async () => {
    const carrierUser: AuthUser = {
      sub: 'usr-1',
      login: 'c',
      email: 'c@example.com',
      name: 'C',
      role: 'przewoznik',
      mustChangePassword: false,
    };
    const h = makeHarness({ scope: [] });

    await expect(h.service.getComplianceBoard(carrierUser, NOW)).rejects.toThrow();
  });
});
