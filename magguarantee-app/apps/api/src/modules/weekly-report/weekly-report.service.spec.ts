// Phase 9 — Monday weekly-report cron (GAS analog `sendWeeklyReport`).
//
// Two things are worth pinning here: the Warsaw week window (which must not
// drift across a DST switch — the reason for the `+12h` cushion in
// `weekWindow`) and the dispatch behaviour (one mail per active admin, sends
// even on a zero week, one bad address never blocks the rest).

import type { ConfigService } from '@nestjs/config';

import type { MailService } from '../mail/mail.service';
import type {
  WeeklyBacklogStats,
  WeeklyReportRecipientRow,
  WeeklyReportRepository,
  WeeklyWindowStats,
} from './weekly-report.repository';
import {
  WeeklyReportService,
  weekLabel,
  weekWindow,
} from './weekly-report.service';

/** Monday 2026-07-27, 09:00 Warsaw (= 07:00Z in CEST). */
const MONDAY_0900 = new Date('2026-07-27T07:00:00.000Z');

function makeWindowStats(
  overrides: Partial<WeeklyWindowStats> = {},
): WeeklyWindowStats {
  return {
    submitted: 12,
    accepted: 7,
    rejected: 2,
    payoutEur: 4321.5,
    ...overrides,
  };
}

function makeBacklog(
  overrides: Partial<WeeklyBacklogStats> = {},
): WeeklyBacklogStats {
  return {
    naWeryfikacji: 5,
    oczekujeNaAutoryzacje: 1,
    reklamacja: 0,
    ...overrides,
  };
}

function makeRepo(args: {
  recipients?: WeeklyReportRecipientRow[];
  window?: WeeklyWindowStats;
  backlog?: WeeklyBacklogStats;
}): { repo: WeeklyReportRepository; windowStats: jest.Mock } {
  const windowStats = jest.fn(async () => args.window ?? makeWindowStats());
  const repo = {
    windowStats,
    backlogStats: jest.fn(async () => args.backlog ?? makeBacklog()),
    findActiveAdminRecipients: jest.fn(
      async () =>
        args.recipients ?? [{ email: 'admin@magtrans.eu', name: 'Admin' }],
    ),
  } as unknown as WeeklyReportRepository;
  return { repo, windowStats };
}

function makeService(args: Parameters<typeof makeRepo>[0] = {}): {
  svc: WeeklyReportService;
  enqueueWeeklyReport: jest.Mock;
  windowStats: jest.Mock;
} {
  const { repo, windowStats } = makeRepo(args);
  const enqueueWeeklyReport = jest.fn(async () => undefined);
  const mail = { enqueueWeeklyReport } as unknown as MailService;
  const config = {
    get: jest.fn(() => 'https://app.magtrans.eu/'),
  } as unknown as ConfigService;
  const svc = new WeeklyReportService(repo, mail, config as never);
  return { svc, enqueueWeeklyReport, windowStats };
}

describe('weekWindow', () => {
  it('spans the previous full Warsaw week, Monday 00:00 to Monday 00:00', () => {
    const { start, end } = weekWindow(MONDAY_0900);
    // CEST (UTC+2) — Warsaw midnight is 22:00Z the day before.
    expect(start.toISOString()).toBe('2026-07-19T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-26T22:00:00.000Z');
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('survives the spring-forward switch (week of 2026-03-29)', () => {
    // Fires Mon 2026-03-30 09:00 Warsaw (CEST, 07:00Z). The window it reports
    // opened Mon 2026-03-23 in CET (+1) and closed Mon 2026-03-30 in CEST (+2),
    // so it is 23 h short of 7×24 h — the boundaries are still both midnights.
    const { start, end } = weekWindow(new Date('2026-03-30T07:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-03-22T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('survives the autumn fall-back switch (week of 2026-10-25)', () => {
    // Mon 2026-10-26 09:00 Warsaw is CET (+1) — 08:00Z. The reported week
    // opened in CEST and closed in CET, so it runs 25 h long.
    const { start, end } = weekWindow(new Date('2026-10-26T08:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
});

describe('weekLabel', () => {
  it('renders first and last day of the window (end is exclusive)', () => {
    const { start, end } = weekWindow(MONDAY_0900);
    expect(weekLabel(start, end)).toBe('20.07–26.07.2026');
  });

  it('takes the year from the closing day on a cross-year week', () => {
    // Fires Mon 2027-01-04 → reports Mon 28.12.2026 – Sun 03.01.2027.
    const { start, end } = weekWindow(new Date('2027-01-04T08:00:00.000Z'));
    expect(weekLabel(start, end)).toBe('28.12–03.01.2027');
  });
});

describe('WeeklyReportService', () => {
  it('mails every active admin with the window + backlog numbers', async () => {
    const { svc, enqueueWeeklyReport } = makeService({
      recipients: [
        { email: 'a@magtrans.eu', name: 'A' },
        { email: 'b@magtrans.eu', name: 'B' },
      ],
    });
    await svc.runWeeklyReport(MONDAY_0900);

    expect(enqueueWeeklyReport).toHaveBeenCalledTimes(2);
    const [to, props] = enqueueWeeklyReport.mock.calls[0] as [
      string,
      {
        weekLabel: string;
        rows: { label: string; value: string }[];
        backlogRows: { label: string; value: string }[];
        payoutTotal: string;
        deeplink: string;
      },
    ];
    expect(to).toBe('a@magtrans.eu');
    expect(props.weekLabel).toBe('20.07–26.07.2026');
    expect(props.rows.map((r) => r.value)).toEqual(['12', '7', '2']);
    expect(props.backlogRows.map((r) => r.value)).toEqual(['5', '1', '0']);
    // Bare amount + currency, matching the decision-email convention.
    expect(props.payoutTotal).toBe('4321.50 EUR');
    expect(props.deeplink).toBe('https://app.magtrans.eu/employee/dashboard');
  });

  it('queries the repository with the computed window', async () => {
    const { svc, windowStats } = makeService();
    await svc.runWeeklyReport(MONDAY_0900);

    const [start, end] = windowStats.mock.calls[0] as [Date, Date];
    expect(start.toISOString()).toBe('2026-07-19T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-07-26T22:00:00.000Z');
  });

  it('still sends on a zero week — a silent cron is indistinguishable from a broken one', async () => {
    const { svc, enqueueWeeklyReport } = makeService({
      window: makeWindowStats({
        submitted: 0,
        accepted: 0,
        rejected: 0,
        payoutEur: 0,
      }),
      backlog: makeBacklog({
        naWeryfikacji: 0,
        oczekujeNaAutoryzacje: 0,
        reklamacja: 0,
      }),
    });
    await svc.runWeeklyReport(MONDAY_0900);

    expect(enqueueWeeklyReport).toHaveBeenCalledTimes(1);
    const [, props] = enqueueWeeklyReport.mock.calls[0] as [
      string,
      { payoutTotal: string },
    ];
    expect(props.payoutTotal).toBe('0.00 EUR');
  });

  it('skips (and warns) when there is no active admin', async () => {
    const { svc, enqueueWeeklyReport } = makeService({ recipients: [] });
    await svc.runWeeklyReport(MONDAY_0900);
    expect(enqueueWeeklyReport).not.toHaveBeenCalled();
  });

  it('one failing recipient does not abort the rest', async () => {
    const { svc, enqueueWeeklyReport } = makeService({
      recipients: [
        { email: 'bad@magtrans.eu', name: 'Bad' },
        { email: 'good@magtrans.eu', name: 'Good' },
      ],
    });
    enqueueWeeklyReport.mockRejectedValueOnce(new Error('bounced'));

    await expect(svc.runWeeklyReport(MONDAY_0900)).resolves.toBeUndefined();
    expect(enqueueWeeklyReport).toHaveBeenCalledTimes(2);
  });
});
