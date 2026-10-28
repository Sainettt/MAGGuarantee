// Guarantee Watchdog cron + hook unit tests (plan §5/§7). Hand-rolled fakes
// over `jest.fn` (same posture as verification-sla.service.spec). We exercise:
//   - trigger-rule matrix: D-3, D-1, violated, catch-up (single mail),
//     daysLeft=0 no-op (healthy), early-counting no episode row;
//   - idempotency: a second same-day run sends nothing;
//   - flag copy-on-reopen for the same anchor;
//   - auto-resolve reasons (wyjazd / vehicle_inactive);
//   - the add()-hook resolves an open episode and never throws;
//   - opiekun scoping (foreign carrier invisible on the board);
//   - enabled=false short-circuit;
//   - stamp claim/release on mail failure + the compensation handler, the
//     no-opiekun violation semantics (2026-08-14 logging audit, item 6);
//   - per-vehicle isolation and the guarded cron body (item 20);
//   - process-zone independence of anchor / deadline (UWAGI #31).
//
// Working-day anchors are derived the SAME way as the SLA spec — from the
// shared `addPolishWorkingDays` / `isPolishWorkingDay` engine — so the fixtures
// stay in lockstep with `computeGuaranteeWatchdog`. Every fixture and expected
// date is in the PRODUCTION shape — UTC midnight of the calendar day — so the
// suite holds under `TZ=UTC` and `TZ=Europe/Warsaw` alike (UWAGI #31).

import { Logger } from '@nestjs/common';

import {
  addPolishWorkingDays,
  computeGuaranteeWatchdog,
  isPolishWorkingDay,
} from '@magguarantee/shared';

import type { OpsAlertService } from '../../common/ops-alert/ops-alert.service';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import type { MailCompensation } from '../mail/email-send.job';
import type {
  MailCompensationHandler,
  MailCompensationRegistry,
} from '../mail/mail-compensation.registry';
import type { MailService } from '../mail/mail.service';
import {
  GuaranteeWatchdogService,
} from './guarantee-watchdog.service';
import type {
  GuaranteeEpisodeListRow,
  GuaranteeEpisodeRow,
  GuaranteeWatchdogRepository,
  WatchdogVehicleScopeRow,
} from './guarantee-watchdog.repository';
import { makeAuthUser, withRole } from '../../common/testing/make-auth-user';

// The UWAGI #31 tests observe what the service hands the engine. The shared
// dist re-exports through non-configurable getters, so `jest.spyOn` cannot
// wrap it; a pass-through `jest.fn` around the REAL engine stands in instead.
// Every other export (incl. the working-day helpers above) is the real one.
jest.mock('@magguarantee/shared', () => {
  const actual = jest.requireActual<typeof import('@magguarantee/shared')>(
    '@magguarantee/shared',
  );
  return {
    __esModule: true,
    ...actual,
    computeGuaranteeWatchdog: jest.fn(actual.computeGuaranteeWatchdog),
  };
});

// A stable weekday well clear of Polish holidays (Wed 2026-06-10, same as the
// SLA spec) so the working-day arithmetic never straddles a holiday cluster.
// UTC midnight, like `startOfBusinessTodayUtc` (which the service applies).
const NOW = new Date(Date.UTC(2026, 5, 10));
const DEADLINE_WORKING_DAYS = 10;
const REMINDER_OFFSETS = [3, 1];

/** Local midnight of `d`'s UTC calendar date — the engine's working shape. */
function localMidnightOfUtcDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * UTC midnight of `d`'s LOCAL calendar date — the same formula as the
 * service's re-encoding of the engine output (UWAGI #31).
 */
function utcMidnightOfLocalDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

/** The engine's `addPolishWorkingDays` over UTC-midnight dates (anchor day excluded). */
function addPolishWorkingDaysUtc(date: Date, n: number): Date {
  return utcMidnightOfLocalDay(
    addPolishWorkingDays(localMidnightOfUtcDay(date), n),
  );
}

/**
 * Walk `n` Polish working days backward over UTC-midnight dates (anchor day
 * excluded). The walk runs on local midnights through the engine's
 * `isPolishWorkingDay`; only the result is re-encoded.
 */
function subtractPolishWorkingDays(date: Date, n: number): Date {
  const cursor = localMidnightOfUtcDay(date);
  let remaining = n;
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() - 1);
    if (isPolishWorkingDay(cursor)) remaining -= 1;
  }
  return utcMidnightOfLocalDay(cursor);
}

/**
 * An anchor date (UTC midnight) whose service-computed `daysLeft` at `NOW` is
 * `k`. deadline = anchor + 10 working days; daysLeft = workingDaysBetween(NOW,
 * deadline). Invert: deadline = NOW ± k working days; anchor = deadline − 10.
 */
function anchorForDaysLeft(k: number): Date {
  const deadline =
    k >= 0
      ? addPolishWorkingDaysUtc(NOW, k)
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
    deadlineAt: addPolishWorkingDaysUtc(
      anchorForDaysLeft(1),
      DEADLINE_WORKING_DAYS,
    ),
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
    clearEpisodeStampIfUnchanged: jest.Mock;
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
  alertSend: jest.Mock;
  /** Compensation handlers registered via onModuleInit, by kind. */
  handlers: Map<string, MailCompensationHandler>;
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
  const clearEpisodeStampIfUnchanged = jest.fn(
    async (id: string, field: keyof GuaranteeEpisodeRow, stampedAt: Date) => {
      const row = store.get(id);
      const current = row?.[field];
      if (!row || !(current instanceof Date) || current.getTime() !== stampedAt.getTime()) {
        return false;
      }
      store.set(id, { ...row, [field]: null });
      return true;
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
    clearEpisodeStampIfUnchanged,
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

  const handlers = new Map<string, MailCompensationHandler>();
  const compensations = {
    register: jest.fn((kind: string, handler: MailCompensationHandler) => {
      handlers.set(kind, handler);
    }),
  } as unknown as MailCompensationRegistry;
  const alertSend = jest.fn(async () => 'log-only');
  const alerts = { send: alertSend } as unknown as OpsAlertService;

  const service = new GuaranteeWatchdogService(
    repo as unknown as GuaranteeWatchdogRepository,
    mail as unknown as MailService,
    config,
    compensations,
    alerts,
  );
  service.onModuleInit();
  return { service, repo, mail, store, alertSend, handlers };
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
      reminder3SentAt: new Date(Date.UTC(2026, 5, 5)),
      reminder1SentAt: new Date(Date.UTC(2026, 5, 8)),
      resolvedReason: 'wyjazd',
      resolvedAt: new Date(Date.UTC(2026, 5, 8)),
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

describe('GuaranteeWatchdogService — stamp semantics on mail failure (logging audit item 6)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  type EnqueueCall = [string, unknown, { compensation: MailCompensation }];

  it('an enqueue failure releases the claimed stamps (compare-and-clear) so the next run retries', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(1) })],
      reminderSendImpl: async () => {
        throw new Error('Queue is closed');
      },
    });

    await h.service.runDaily(NOW);

    const ep = [...h.store.values()][0]!;
    // D-1 claimed reminder1 + the backfilled reminder3; both released.
    expect(ep.reminder1SentAt).toBeNull();
    expect(ep.reminder3SentAt).toBeNull();
    expect(h.repo.clearEpisodeStampIfUnchanged).toHaveBeenCalledWith(
      ep.id,
      'reminder1SentAt',
      NOW,
    );
  });

  it('the enqueued reminder carries a compensation naming exactly the claimed stamps', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(1) })],
    });

    await h.service.runDaily(NOW);

    const [, , opts] = h.mail.enqueueGuaranteeReminderCarrier.mock
      .calls[0] as unknown as EnqueueCall;
    const ep = [...h.store.values()][0]!;
    expect(opts.compensation).toEqual({
      kind: 'guarantee-watchdog.release-episode-stamps',
      payload: {
        stampedAt: NOW.toISOString(),
        episodes: [{ id: ep.id, fields: ['reminder1SentAt', 'reminder3SentAt'] }],
      },
    });
    // Claimed before enqueue → stamped while the mail is in the queue.
    expect(ep.reminder1SentAt).toEqual(NOW);
  });

  it('a permanent queue failure (compensation handler) clears the stamps; the next run re-sends', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(3) })],
    });
    await h.service.runDaily(NOW);
    const [, , opts] = h.mail.enqueueGuaranteeReminderCarrier.mock
      .calls[0] as unknown as EnqueueCall;

    const handler = h.handlers.get(opts.compensation.kind);
    expect(handler).toBeDefined();
    await handler!(opts.compensation.payload);

    const ep = [...h.store.values()][0]!;
    expect(ep.reminder3SentAt).toBeNull();

    h.mail.enqueueGuaranteeReminderCarrier.mockClear();
    await h.service.runDaily(NOW);
    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);
  });

  it('a late release never erases a stamp written by a later successful run', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(3) })],
    });
    await h.service.runDaily(NOW);
    const [, , opts] = h.mail.enqueueGuaranteeReminderCarrier.mock
      .calls[0] as unknown as EnqueueCall;

    // A later run re-stamped the episode with a different instant.
    const ep = [...h.store.values()][0]!;
    const later = new Date(NOW.getTime() + 60_000);
    h.store.set(ep.id, { ...ep, reminder3SentAt: later });

    await h.handlers.get(opts.compensation.kind)!(opts.compensation.payload);

    expect(h.store.get(ep.id)?.reminder3SentAt).toEqual(later);
  });

  it('a malformed compensation payload releases nothing and does not throw', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness({});
    const handler = h.handlers.get('guarantee-watchdog.release-episode-stamps')!;

    await expect(handler({ stampedAt: 'yesterday' })).resolves.toBeUndefined();
    expect(h.repo.clearEpisodeStampIfUnchanged).not.toHaveBeenCalled();
  });

  it('opiekun digest compensation covers violationSentAt only', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: anchorForDaysLeft(-2) })],
    });

    await h.service.runDaily(NOW);

    const [, , opts] = h.mail.enqueueGuaranteeOpiekunDigest.mock
      .calls[0] as unknown as EnqueueCall;
    const ep = [...h.store.values()][0]!;
    expect(opts.compensation.payload).toEqual({
      stampedAt: NOW.toISOString(),
      episodes: [{ id: ep.id, fields: ['violationSentAt'] }],
    });
  });

  it('violation on a carrier WITHOUT an opiekun: no mail, NOT stamped, WARN emitted', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const h = makeHarness({
      scope: [
        makeScopeRow({
          vehicleId: 'veh-1',
          lastReturnAt: anchorForDaysLeft(-2),
          carrier: { id: 'car-9', name: 'Orphan', opiekunId: null, userId: 'u9' },
        }),
      ],
    });

    await h.service.runDaily(NOW);

    expect(h.mail.enqueueGuaranteeOpiekunDigest).not.toHaveBeenCalled();
    const ep = [...h.store.values()][0]!;
    expect(ep.state).toBe('violated'); // the violation itself is recorded
    expect(ep.violationSentAt).toBeNull(); // …but not marked as reported
    expect(
      warn.mock.calls.some((c) =>
        String((c[0] as { msg?: unknown }).msg).includes('without an opiekun'),
      ),
    ).toBe(true);
  });
});

describe('GuaranteeWatchdogService — cron robustness (logging audit item 20)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('one vehicle failing does not abort the others; the run alerts a partial failure', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness({
      scope: [
        makeScopeRow({ vehicleId: 'veh-bad', lastReturnAt: anchorForDaysLeft(3) }),
        makeScopeRow({
          vehicleId: 'veh-good',
          lastReturnAt: anchorForDaysLeft(3),
          carrier: { id: 'car-2', name: 'Good', opiekunId: 'op-1', userId: 'u2' },
        }),
      ],
    });
    h.repo.findLatestEpisodeForAnchor.mockRejectedValueOnce(new Error('lock timeout'));

    await expect(h.service.runDaily(NOW)).resolves.toBeUndefined();

    expect(error.mock.calls[0]?.[0]).toMatchObject({ vehicleId: 'veh-bad', errorMessage: 'lock timeout' });
    expect(h.mail.enqueueGuaranteeReminderCarrier).toHaveBeenCalledTimes(1);
    const [, props] = h.mail.enqueueGuaranteeReminderCarrier.mock.calls[0] as unknown as [
      string,
      { carrierName: string },
    ];
    expect(props.carrierName).toBe('Good');
    expect(h.alertSend).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cron-partial:guarantee-watchdog' }),
    );
  });

  it('a scope-query crash is caught: structured ERROR + ops alert, never rejects', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const h = makeHarness({});
    h.repo.findGuaranteedVehiclesInScope.mockRejectedValueOnce(new Error('db down'));

    await expect(h.service.runDaily(NOW)).resolves.toBeUndefined();

    expect(error.mock.calls[0]?.[0]).toMatchObject({
      msg: 'cron job failed',
      job: 'guarantee-watchdog',
      errorMessage: 'db down',
    });
    expect(h.alertSend).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'cron-failed:guarantee-watchdog' }),
    );
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
  const opiekunUser: AuthUser = makeAuthUser('opiekun', {
    sub: 'op-1',
    login: 'op1',
    email: 'op1@magtrans.eu',
    name: 'Opiekun One',
    mustChangePassword: false,
  });
  const adminUser: AuthUser = withRole(opiekunUser, 'admin', { sub: 'adm-1' });

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
    const carrierUser: AuthUser = makeAuthUser('przewoznik', {
      sub: 'usr-car-1',
      login: 'car1',
      email: 'car1@example.com',
      name: 'Car One',
      mustChangePassword: false,
    });
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
    const carrierUser: AuthUser = makeAuthUser('przewoznik', {
      sub: 'usr-1',
      login: 'c',
      email: 'c@example.com',
      name: 'C',
      mustChangePassword: false,
    });
    const h = makeHarness({ scope: [] });

    await expect(h.service.getComplianceBoard(carrierUser, NOW)).rejects.toThrow();
  });
});

describe('GuaranteeWatchdogService — carrier episode archive (listMyEpisodes)', () => {
  const carrierUser: AuthUser = makeAuthUser('przewoznik', {
    sub: 'usr-car-1',
    login: 'car1',
    email: 'car1@example.com',
    name: 'Car One',
    mustChangePassword: false,
  });

  /** A list-row shaped like the repo returns (episode + joined identity). */
  function makeListRow(
    overrides: Partial<GuaranteeEpisodeListRow> = {},
  ): GuaranteeEpisodeListRow {
    const ep = makeEpisode(overrides);
    return {
      ...ep,
      plateNumber: 'WX00001',
      sideNumber: null,
      carrierName: 'Car One',
      ...overrides,
    };
  }

  it('rejects a non-przewoznik caller (role gate, defence-in-depth)', async () => {
    const admin: AuthUser = withRole(carrierUser, 'admin', { sub: 'adm-1' });
    const h = makeHarness();

    await expect(
      h.service.listMyEpisodes(admin, { limit: 50 }),
    ).rejects.toThrow();
    expect(h.repo.listEpisodes).not.toHaveBeenCalled();
  });

  it('forces the carrier scope from the JWT (never a client carrierId)', async () => {
    const h = makeHarness();
    h.repo.listEpisodes.mockResolvedValueOnce([]);

    await h.service.listMyEpisodes(carrierUser, { limit: 50 });

    const [args] = h.repo.listEpisodes.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(args.carrierUserScopeId).toBe('usr-car-1');
    // The /me path must NOT pass any admin/opiekun scope or a carrierId.
    expect(args.carrierId).toBeUndefined();
    expect(args.opiekunScopeId).toBeUndefined();
  });

  it('passes vehicleId and state filters through to the repo', async () => {
    const h = makeHarness();
    h.repo.listEpisodes.mockResolvedValueOnce([]);

    await h.service.listMyEpisodes(carrierUser, {
      vehicleId: 'veh-42',
      state: 'violated',
      limit: 50,
    });

    const [args] = h.repo.listEpisodes.mock.calls[0] as [
      Record<string, unknown>,
    ];
    expect(args.vehicleId).toBe('veh-42');
    expect(args.state).toBe('violated');
  });

  it('returns own episodes mapped to the wire DTO (no nextCursor when short)', async () => {
    const h = makeHarness();
    h.repo.listEpisodes.mockResolvedValueOnce([
      makeListRow({ id: 'ep-a', vehicleId: 'veh-1' }),
      makeListRow({ id: 'ep-b', vehicleId: 'veh-2' }),
    ]);

    const res = await h.service.listMyEpisodes(carrierUser, { limit: 50 });

    expect(res.items.map((i) => i.id)).toEqual(['ep-a', 'ep-b']);
    expect(res.nextCursor).toBeNull();
  });

  it('cursor-paginates: N+1 fetched → trims to limit and emits nextCursor', async () => {
    const h = makeHarness();
    // limit=2, repo returns 3 (the N+1 probe row) → page trimmed, cursor = last kept.
    h.repo.listEpisodes.mockResolvedValueOnce([
      makeListRow({ id: 'ep-a' }),
      makeListRow({ id: 'ep-b' }),
      makeListRow({ id: 'ep-c' }),
    ]);

    const res = await h.service.listMyEpisodes(carrierUser, { limit: 2 });

    expect(res.items.map((i) => i.id)).toEqual(['ep-a', 'ep-b']);
    expect(res.nextCursor).toBe('ep-b');
    // The cursor is forwarded on the follow-up call.
    h.repo.listEpisodes.mockResolvedValueOnce([]);
    await h.service.listMyEpisodes(carrierUser, { cursor: 'ep-b', limit: 2 });
    const [args] = h.repo.listEpisodes.mock.calls[1] as [
      Record<string, unknown>,
    ];
    expect(args.cursor).toBe('ep-b');
  });
});

describe('GuaranteeWatchdogService — process-zone independence (UWAGI #31)', () => {
  // `actualReturnAt` is a Warsaw wall-clock LABELLED UTC (docs/19 #16): a 23:30
  // return is stored `…T23:30:00Z` and its raw UTC date part IS the business
  // date. Without the fix the engine-input and `anchorAt` assertions fail on
  // any process zone (the raw value goes through); on a Warsaw-zone process the
  // anchor also lands on 03.06 / deadline 18.06, and an unconverted engine
  // deadline reads `…T22:00:00.000Z` (the previous day).
  const engine = jest.mocked(computeGuaranteeWatchdog);
  const adminUser: AuthUser = makeAuthUser('admin', { sub: 'adm-1' });

  /** 23:30 wall-clock on Tue 02.06.2026 (CEST, UTC+2). */
  const RETURN_CEST = new Date('2026-06-02T23:30:00.000Z');
  /** 23:30 wall-clock on Thu 29.01.2026 (CET, UTC+1). */
  const RETURN_CET = new Date('2026-01-29T23:30:00.000Z');
  /**
   * Mon 15.06.2026. Deadline 17.06 = 10 Polish working days after 02.06 (Thu
   * 04.06 is Boże Ciało, Easter 2026 = 05.04) → daysLeft 2: counting with the
   * D-3 reminder due, so the cron writes an episode row. (At the suite's NOW,
   * 10.06, daysLeft would be 5 and no row is recorded.)
   */
  const NOW_CEST = new Date(Date.UTC(2026, 5, 15));
  /** Mon 09.02.2026. Deadline 12.02 = 29.01 + 10 working days → daysLeft 3. */
  const NOW_CET = new Date(Date.UTC(2026, 1, 9));

  beforeEach(() => {
    engine.mockClear();
  });

  it('hands the engine the wall-clock DATE of a 23:30 CEST return (UTC midnight of 02.06)', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: RETURN_CEST })],
    });

    await h.service.runDaily(NOW_CEST);

    expect(engine).toHaveBeenCalledTimes(1);
    expect(engine.mock.calls[0]?.[0].lastReturnAt?.toISOString()).toBe(
      '2026-06-02T00:00:00.000Z',
    );
  });

  it('persists the episode, its dedup lookup and the reminder labels on UTC-midnight 02.06 / 17.06', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: RETURN_CEST })],
    });

    await h.service.runDaily(NOW_CEST);

    expect(h.repo.createEpisode).toHaveBeenCalledTimes(1);
    const created = h.repo.createEpisode.mock.calls[0]?.[0] as {
      anchorAt: Date;
      deadlineAt: Date;
    };
    expect(created.anchorAt.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    expect(created.deadlineAt.toISOString()).toBe('2026-06-17T00:00:00.000Z');
    const [lookupVehicle, lookupAnchor] = h.repo.findLatestEpisodeForAnchor.mock
      .calls[0] as unknown as [string, Date];
    expect(lookupVehicle).toBe('veh-1');
    expect(lookupAnchor.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    const [, props] = h.mail.enqueueGuaranteeReminderCarrier.mock.calls[0] as [
      string,
      { rows: { anchorLabel: string; deadlineLabel: string; daysLeft: number }[] },
    ];
    expect(props.rows[0]).toMatchObject({
      anchorLabel: '02.06.2026',
      deadlineLabel: '17.06.2026',
      daysLeft: 2,
    });
  });

  it('the /guarantee-compliance board DTO reads 2026-06-02 → 2026-06-17', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: RETURN_CEST })],
    });

    const board = await h.service.getComplianceBoard(adminUser, NOW_CEST);

    expect(board.items[0]).toMatchObject({
      vehicleId: 'veh-1',
      anchorAt: '2026-06-02',
      deadlineAt: '2026-06-17',
      daysLeft: 2,
      state: 'counting',
    });
  });

  it('a 23:30 CET return: engine gets UTC midnight of 29.01, board reads 2026-01-29 → 2026-02-12', async () => {
    const h = makeHarness({
      scope: [makeScopeRow({ vehicleId: 'veh-1', lastReturnAt: RETURN_CET })],
    });

    const board = await h.service.getComplianceBoard(adminUser, NOW_CET);

    expect(engine).toHaveBeenCalledTimes(1);
    expect(engine.mock.calls[0]?.[0].lastReturnAt?.toISOString()).toBe(
      '2026-01-29T00:00:00.000Z',
    );
    expect(board.items[0]).toMatchObject({
      anchorAt: '2026-01-29',
      deadlineAt: '2026-02-12',
      daysLeft: 3,
      state: 'counting',
    });
  });
});
