// docs/21-pracownik-verification-sla.md §4 — dashboard verification-SLA
// bucket tests. Hand-rolled fakes over `jest.fn`, mirrors the style used in
// `limits.service.spec.ts`. We stub `DiagnosticsRepository` and only exercise
// the bucketing / sorting translation layer in `DiagnosticsService`.
//
// Anchors are derived with the real `addPolishWorkingDays` helper so the test
// is robust against the exact Polish calendar: we pick a reference `now`, then
// craft an anchor whose deadline (`anchor + 7 working days`) sits exactly `k`
// working days from `now`, yielding `workingDaysLeft === k`.

import {
  addPolishWorkingDays,
  isPolishWorkingDay,
  SLA_WORKING_DAYS,
} from '@magguarantee/shared';

import type { DashboardSlaCandidateRow } from './diagnostics.repository';
import { DiagnosticsService } from './diagnostics.service';

// Reference 'now': Wed 2026-06-10 (a Polish working day).
const NOW = new Date(2026, 5, 10);

/** Walk `n` Polish working days backward from `date` (anchor day excluded). */
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
 * Build an anchor date such that `bucketForAnchor(anchor, NOW).workingDaysLeft
 * === k`. Strategy: pick a guaranteed-working-day `deadline` exactly `k` signed
 * working days from NOW (so `workingDaysBetween(NOW, deadline) === k`), then
 * derive the anchor as `SLA_WORKING_DAYS` working days BEFORE that deadline so
 * `addPolishWorkingDays(anchor, 7) === deadline`. Both directions land on a
 * working day, so every `k` (incl. negative) resolves.
 */
function anchorForLeft(k: number): Date {
  const deadline =
    k >= 0
      ? addPolishWorkingDays(NOW, k)
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
  const repo = {
    countClaimsByStatus: jest.fn(async () => ({
      NA_WERYFIKACJI: opts.slaCandidates?.length ?? 0,
      ZAAKCEPTOWANO: 0,
      ODRZUCONO: 0,
      REKLAMACJA: 0,
      OCZEKUJE_NA_AUTORYZACJE: 0,
      AUTORYZACJA_KWOTA_MAKSIMA: 0,
    })),
    findNaWeryfikacjiForSla: jest.fn(
      async () => opts.slaCandidates ?? [],
    ),
    findRecentClaimAudit: jest.fn(async () => []),
    findTopCarriersByPayment: jest.fn(async () => []),
    findMonthlySeries: jest.fn(async () => []),
    countReklamacje: jest.fn(async () => 0),
  };
  // The other collaborators are never touched by getDashboard.
  const mailJobs = {} as never;
  const mail = {} as never;
  const redis = {} as never;
  return new DiagnosticsService(repo as never, mailJobs, mail, redis);
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

  it('emits empty buckets when no NA_WERYFIKACJI claims at risk', async () => {
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
