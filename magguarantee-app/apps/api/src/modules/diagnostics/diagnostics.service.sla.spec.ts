// docs/21-pracownik-verification-sla.md §4 — dashboard verification-SLA
// bucket tests. Hand-rolled fakes over `jest.fn`, mirrors the style used in
// `limits.service.spec.ts`. We stub `DiagnosticsRepository` and only exercise
// the bucketing / sorting translation layer in `DiagnosticsService`.
//
// Since the 2026-10-22 decision (docs/21 §1) the SLA clock covers both
// `NA_WERYFIKACJI` and `REKLAMACJA`; the candidate list mixes the two and the
// service must bucket them identically and pass `status` through.
//
// Anchors are derived with the real `addPolishWorkingDays` helper so the test
// is robust against the exact Polish calendar: we pick a reference `now`, then
// craft an anchor whose deadline (`anchor + 7 working days`) sits exactly `k`
// working days from `now`, yielding `workingDaysLeft === k`. Every fixture is
// in the PRODUCTION shape — UTC midnight of the calendar day, which is what the
// service's `startOfBusinessDayUtc` / `startOfBusinessTodayUtc` reduction hands
// the engine — so the suite holds under `TZ=UTC` and `TZ=Europe/Warsaw` alike
// (UWAGI #32). The last block pins that reduction with raw instants near
// Warsaw midnight (process-zone independence, UWAGI #32).

import {
  addPolishWorkingDays,
  isPolishWorkingDay,
  SLA_WORKING_DAYS,
} from '@magguarantee/shared';

import type { DashboardSlaCandidateRow } from './diagnostics.repository';
import { DiagnosticsService } from './diagnostics.service';

// Reference 'now': Wed 2026-06-10 (a Polish working day), UTC midnight — the
// shape `startOfBusinessTodayUtc` yields.
const NOW = new Date(Date.UTC(2026, 5, 10));

/** Local midnight of `d`'s UTC calendar date — the engine's working shape. */
function localMidnightOfUtcDay(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC midnight of `d`'s LOCAL calendar date — the production fixture shape. */
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
 * Build an anchor date (UTC midnight) such that the service-computed
 * `workingDaysLeft` at `NOW` is `k`. Strategy: pick a guaranteed-working-day
 * `deadline` exactly `k` signed working days from NOW (so
 * `workingDaysBetween(NOW, deadline) === k`), then derive the anchor as
 * `SLA_WORKING_DAYS` working days BEFORE that deadline so
 * `addPolishWorkingDays(anchor, 7) === deadline`. Both directions land on a
 * working day, so every `k` (incl. negative) resolves.
 */
function anchorForLeft(k: number): Date {
  const deadline =
    k >= 0
      ? addPolishWorkingDaysUtc(NOW, k)
      : subtractPolishWorkingDays(NOW, -k);
  return subtractPolishWorkingDays(deadline, SLA_WORKING_DAYS);
}

let seq = 0;
function makeCandidate(
  overrides: Partial<DashboardSlaCandidateRow> = {},
): DashboardSlaCandidateRow {
  seq += 1;
  const id = `00000000-0000-0000-0000-${String(seq).padStart(12, '0')}`;
  return {
    id,
    nrZgl: `GWA/${String(seq).padStart(3, '0')}/05/26`,
    status: 'NA_WERYFIKACJI',
    carrierName: 'TransLogis Sp. z o.o.',
    vehiclePlate: 'WX12345',
    anchorDate: anchorForLeft(0),
    ...overrides,
  };
}

interface FakeRepoOpts {
  slaCandidates?: DashboardSlaCandidateRow[];
}

function makeService(opts: FakeRepoOpts = {}): DiagnosticsService {
  const candidates = opts.slaCandidates ?? [];
  const countOf = (status: DashboardSlaCandidateRow['status']): number =>
    candidates.filter((c) => c.status === status).length;
  const repo = {
    countClaimsByStatus: jest.fn(async () => ({
      NA_WERYFIKACJI: countOf('NA_WERYFIKACJI'),
      ZAAKCEPTOWANO: 0,
      ODRZUCONO: 0,
      REKLAMACJA: countOf('REKLAMACJA'),
      OCZEKUJE_NA_AUTORYZACJE: 0,
    })),
    findOnSlaClock: jest.fn(async () => candidates),
    findRecentClaimAudit: jest.fn(async () => []),
    findTopCarriersByPayment: jest.fn(async () => []),
    findMonthlySeries: jest.fn(async () => []),
    countReklamacje: jest.fn(async () => 0),
  };
  // The other collaborators are never touched by getDashboard.
  const mailJobs = {} as never;
  const mail = {} as never;
  const redis = {} as never;
  const magspace = {} as never;
  const directoryState = {} as never;
  return new DiagnosticsService(
    repo as never,
    mailJobs,
    mail,
    redis,
    magspace,
    directoryState,
  );
}

describe('DiagnosticsService.getDashboard — verification-SLA buckets', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('classifies boundaries: 3=dueSoon, 0=dueSoon, -1=overdue, 4=excluded', async () => {
    const candidates = [
      makeCandidate({ nrZgl: 'LEFT-3', anchorDate: anchorForLeft(3) }),
      makeCandidate({ nrZgl: 'LEFT-0', anchorDate: anchorForLeft(0) }),
      makeCandidate({ nrZgl: 'LEFT--1', anchorDate: anchorForLeft(-1) }),
      makeCandidate({ nrZgl: 'LEFT-4', anchorDate: anchorForLeft(4) }),
    ];
    const svc = makeService({ slaCandidates: candidates });

    const dto = await svc.getDashboard(NOW);

    // overdue: only LEFT--1
    expect(dto.overdue.map((r) => r.nrZgl)).toEqual(['LEFT--1']);
    expect(dto.overdue[0]?.workingDaysLeft).toBe(-1);

    // dueSoon: LEFT-0 and LEFT-3 (sorted by workingDaysLeft ascending)
    expect(dto.dueSoon.map((r) => r.nrZgl)).toEqual(['LEFT-0', 'LEFT-3']);
    expect(dto.dueSoon.map((r) => r.workingDaysLeft)).toEqual([0, 3]);

    // LEFT-4 (onTrack) is excluded from both buckets.
    const allNr = [...dto.overdue, ...dto.dueSoon].map((r) => r.nrZgl);
    expect(allNr).not.toContain('LEFT-4');
  });

  it('sorts each bucket by workingDaysLeft ascending (most urgent first)', async () => {
    const candidates = [
      makeCandidate({ nrZgl: 'O--1', anchorDate: anchorForLeft(-1) }),
      makeCandidate({ nrZgl: 'O--3', anchorDate: anchorForLeft(-3) }),
      makeCandidate({ nrZgl: 'D-3', anchorDate: anchorForLeft(3) }),
      makeCandidate({ nrZgl: 'D-1', anchorDate: anchorForLeft(1) }),
    ];
    const svc = makeService({ slaCandidates: candidates });

    const dto = await svc.getDashboard(NOW);

    // overdue: -3 before -1
    expect(dto.overdue.map((r) => r.nrZgl)).toEqual(['O--3', 'O--1']);
    expect(dto.overdue.map((r) => r.workingDaysLeft)).toEqual([-3, -1]);
    // dueSoon: 1 before 3
    expect(dto.dueSoon.map((r) => r.nrZgl)).toEqual(['D-1', 'D-3']);
    expect(dto.dueSoon.map((r) => r.workingDaysLeft)).toEqual([1, 3]);
  });

  it('carries id, nrZgl, status, carrierName, vehiclePlate, workingDaysLeft per row', async () => {
    const candidates = [
      makeCandidate({
        id: '00000000-0000-0000-0000-0000000000aa',
        nrZgl: 'GWA/099/05/26',
        carrierName: 'Foo Transport',
        vehiclePlate: 'KR99999',
        anchorDate: anchorForLeft(-1),
      }),
    ];
    const svc = makeService({ slaCandidates: candidates });

    const dto = await svc.getDashboard(NOW);

    expect(dto.overdue[0]).toEqual({
      id: '00000000-0000-0000-0000-0000000000aa',
      nrZgl: 'GWA/099/05/26',
      status: 'NA_WERYFIKACJI',
      carrierName: 'Foo Transport',
      vehiclePlate: 'KR99999',
      workingDaysLeft: -1,
    });
  });

  it('emits empty buckets when no on-the-clock claims are at risk', async () => {
    const svc = makeService({
      slaCandidates: [
        makeCandidate({ anchorDate: anchorForLeft(4) }), // onTrack
        makeCandidate({ anchorDate: anchorForLeft(10) }), // onTrack
      ],
    });

    const dto = await svc.getDashboard(NOW);

    expect(dto.overdue).toEqual([]);
    expect(dto.dueSoon).toEqual([]);
  });

  it('does NOT carry paymentEur / updatedAt on the SLA rows', async () => {
    const svc = makeService({
      slaCandidates: [makeCandidate({ anchorDate: anchorForLeft(-1) })],
    });

    const dto = await svc.getDashboard(NOW);

    const row = dto.overdue[0] as Record<string, unknown>;
    expect(row).toBeDefined();
    expect('paymentEur' in row).toBe(false);
    expect('updatedAt' in row).toBe(false);
  });

  it('preserves the rest of the dashboard payload (kpi, reklamacje, series)', async () => {
    const svc = makeService({
      slaCandidates: [makeCandidate({ anchorDate: anchorForLeft(-1) })],
    });

    const dto = await svc.getDashboard(NOW);

    expect(dto.kpi).toBeDefined();
    expect(dto.kpi.total).toBe(1);
    expect(dto.kpi.naWeryfikacji).toBe(1);
    expect(dto.recent).toEqual([]);
    expect(dto.topCarriers).toEqual([]);
    expect(dto.monthlySeries).toEqual([]);
    expect(dto.reklamacje).toEqual({ count: 0 });
  });
});

describe('DiagnosticsService.getDashboard — REKLAMACJA runs the same SLA clock', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('buckets REKLAMACJA rows by their own anchor and keeps status REKLAMACJA', async () => {
    const svc = makeService({
      slaCandidates: [
        makeCandidate({
          nrZgl: 'REK-OVERDUE',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(-2),
        }),
        makeCandidate({
          nrZgl: 'REK-SOON',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(1),
        }),
        makeCandidate({
          nrZgl: 'REK-ONTRACK',
          status: 'REKLAMACJA',
          anchorDate: anchorForLeft(5),
        }),
        makeCandidate({ nrZgl: 'WER-SOON', anchorDate: anchorForLeft(2) }),
      ],
    });

    const dto = await svc.getDashboard(NOW);

    expect(dto.overdue).toEqual([
      expect.objectContaining({
        nrZgl: 'REK-OVERDUE',
        status: 'REKLAMACJA',
        workingDaysLeft: -2,
      }),
    ]);
    // One list for both statuses, sorted purely by urgency.
    expect(
      dto.dueSoon.map((r) => [r.nrZgl, r.status, r.workingDaysLeft]),
    ).toEqual([
      ['REK-SOON', 'REKLAMACJA', 1],
      ['WER-SOON', 'NA_WERYFIKACJI', 2],
    ]);
    // onTrack reklamacja is dropped like any onTrack row.
    const allNr = [...dto.overdue, ...dto.dueSoon].map((r) => r.nrZgl);
    expect(allNr).not.toContain('REK-ONTRACK');
  });

  it('gives a REKLAMACJA row the same workingDaysLeft as a NA_WERYFIKACJI row with the same anchor', async () => {
    const anchor = anchorForLeft(0);
    const svc = makeService({
      slaCandidates: [
        makeCandidate({ nrZgl: 'WER', anchorDate: anchor }),
        makeCandidate({
          nrZgl: 'REK',
          status: 'REKLAMACJA',
          anchorDate: anchor,
        }),
      ],
    });

    const dto = await svc.getDashboard(NOW);

    expect(dto.overdue).toEqual([]);
    expect(dto.dueSoon.map((r) => r.workingDaysLeft)).toEqual([0, 0]);
    expect(dto.dueSoon.map((r) => r.status).sort()).toEqual([
      'NA_WERYFIKACJI',
      'REKLAMACJA',
    ]);
  });
});

describe('DiagnosticsService — SLA anchor: statusChangedAt + createdAt fallback', () => {
  // The repository is responsible for resolving `statusChangedAt ?? createdAt`
  // into `anchorDate`; the service consumes `anchorDate` directly. These tests
  // assert the service buckets purely off `anchorDate`, so a row whose anchor
  // came from `createdAt` (fallback) is treated identically to one from
  // `statusChangedAt`.
  beforeEach(() => {
    seq = 0;
  });

  it('buckets a fallback (createdAt-derived) anchor the same as a statusChangedAt one', async () => {
    // Both rows share the same anchorDate; one simulates statusChangedAt, the
    // other simulates the createdAt fallback. They must land in the same bucket
    // with the same workingDaysLeft.
    const anchor = anchorForLeft(-2);
    const svc = makeService({
      slaCandidates: [
        makeCandidate({ nrZgl: 'FROM-STATUS', anchorDate: anchor }),
        makeCandidate({ nrZgl: 'FROM-CREATED', anchorDate: anchor }),
      ],
    });

    const dto = await svc.getDashboard(NOW);

    expect(dto.overdue.map((r) => r.nrZgl).sort()).toEqual([
      'FROM-CREATED',
      'FROM-STATUS',
    ]);
    expect(dto.overdue.every((r) => r.workingDaysLeft === -2)).toBe(true);
  });
});

describe('DiagnosticsService — process-zone independence (UWAGI #32)', () => {
  // `anchorDate` (`statusChangedAt ?? createdAt`) and `now` are TRUE UTC
  // instants; the engine counts in process-local calendar dates. In the UTC
  // api container a claim entering the clock at 00:00–00:59 CET / 00:00–01:59
  // CEST (23:xx Z the day before) was anchored to the previous Warsaw day, and
  // a dashboard opened just after Warsaw midnight read "today" as yesterday.
  // Every expectation below (bar the last, a no-overshoot guard) differs by
  // one working day between the Warsaw reading (correct) and the UTC-date
  // reading (the bug), so without the fix they fail under `TZ=UTC`; a
  // Warsaw-zone process happens to read them right.

  /** 00:30 Warsaw on Thu 15.01.2026 (CET, UTC+1) — still 14.01 in UTC. */
  const ANCHOR_CET = new Date('2026-01-14T23:30:00.000Z');
  /** 01:30 Warsaw on Tue 02.06.2026 (CEST, UTC+2) — still 01.06 in UTC. */
  const ANCHOR_CEST = new Date('2026-06-01T23:30:00.000Z');
  /** Fri 12.06.2026, 10:00 CEST. */
  const FRI_12_06 = new Date('2026-06-12T08:00:00.000Z');

  /** Both buckets reduced to `[nrZgl, workingDaysLeft]` pairs. */
  function buckets(dto: {
    overdue: { nrZgl: string; workingDaysLeft: number }[];
    dueSoon: { nrZgl: string; workingDaysLeft: number }[];
  }): { overdue: [string, number][]; dueSoon: [string, number][] } {
    const pairs = (
      rows: { nrZgl: string; workingDaysLeft: number }[],
    ): [string, number][] => rows.map((r) => [r.nrZgl, r.workingDaysLeft]);
    return { overdue: pairs(dto.overdue), dueSoon: pairs(dto.dueSoon) };
  }

  beforeEach(() => {
    seq = 0;
  });

  it('a claim entering the clock at 00:30 CET starts on 15.01: due today on Mon 26.01, not overdue', async () => {
    // 15.01 + 7 working days = Mon 26.01 → 0 left (dueSoon). Anchored on
    // 14.01 the deadline would be Fri 23.01 → −1 (overdue).
    const svc = makeService({
      slaCandidates: [makeCandidate({ nrZgl: 'CET', anchorDate: ANCHOR_CET })],
    });

    const dto = await svc.getDashboard(new Date('2026-01-26T09:00:00.000Z')); // 10:00 CET

    expect(buckets(dto)).toEqual({ overdue: [], dueSoon: [['CET', 0]] });
  });

  it('a claim entering the clock at 01:30 CEST starts on 02.06: due today on Fri 12.06, not overdue', async () => {
    // Thu 04.06.2026 is Boże Ciało (Easter 05.04 + 60). 02.06 + 7 working
    // days = Fri 12.06 → 0 left. Anchored on 01.06 → Thu 11.06 → −1.
    const svc = makeService({
      slaCandidates: [makeCandidate({ nrZgl: 'CEST', anchorDate: ANCHOR_CEST })],
    });

    const dto = await svc.getDashboard(FRI_12_06);

    expect(buckets(dto)).toEqual({ overdue: [], dueSoon: [['CEST', 0]] });
  });

  it('the anchor day flips exactly at Warsaw midnight (CEST: 22:00Z), not at UTC midnight', async () => {
    // 21:59:59.999Z = 01.06 23:59:59.999 Warsaw → deadline Thu 11.06 → −1.
    // 22:00:00.000Z = 02.06 00:00 Warsaw → deadline Fri 12.06 → 0.
    const svc = makeService({
      slaCandidates: [
        makeCandidate({
          nrZgl: 'BEFORE',
          anchorDate: new Date('2026-06-01T21:59:59.999Z'),
        }),
        makeCandidate({
          nrZgl: 'AT',
          anchorDate: new Date('2026-06-01T22:00:00.000Z'),
        }),
      ],
    });

    const dto = await svc.getDashboard(FRI_12_06);

    expect(buckets(dto)).toEqual({
      overdue: [['BEFORE', -1]],
      dueSoon: [['AT', 0]],
    });
  });

  it('a dashboard opened at 00:30 Warsaw on 10.06 counts today as 10.06, not 09.06', async () => {
    // 2026-06-09T22:30Z = 10.06 00:30 CEST, the same Warsaw day as NOW.
    // Read as 09.06 instead: SOON 3 → 4 (dropped), OVERDUE −1 → 0 (dueSoon).
    const svc = makeService({
      slaCandidates: [
        makeCandidate({ nrZgl: 'SOON', anchorDate: anchorForLeft(3) }),
        makeCandidate({ nrZgl: 'OVERDUE', anchorDate: anchorForLeft(-1) }),
      ],
    });

    const dto = await svc.getDashboard(new Date('2026-06-09T22:30:00.000Z'));

    expect(buckets(dto)).toEqual({
      overdue: [['OVERDUE', -1]],
      dueSoon: [['SOON', 3]],
    });
  });

  it('…and 23:59:59.999 Warsaw on 09.06 still counts as 09.06 (no overshoot)', async () => {
    // 2026-06-09T21:59:59.999Z = 09.06 23:59:59.999 CEST. One working day
    // before NOW: SOON reads 4 (dropped), OVERDUE (deadline 09.06) reads 0.
    const svc = makeService({
      slaCandidates: [
        makeCandidate({ nrZgl: 'SOON', anchorDate: anchorForLeft(3) }),
        makeCandidate({ nrZgl: 'OVERDUE', anchorDate: anchorForLeft(-1) }),
      ],
    });

    const dto = await svc.getDashboard(new Date('2026-06-09T21:59:59.999Z'));

    expect(buckets(dto)).toEqual({ overdue: [], dueSoon: [['OVERDUE', 0]] });
  });
});
