import { describe, expect, it } from 'vitest';

import { assignment, fid, transfer } from './fixtures';
import { buildPlannerTimeline, pendingTransferOf } from './plannerTimeline';

const VEHICLE = fid();

describe('buildPlannerTimeline (§17.6.2)', () => {
  const current = assignment({
    validFrom: '2026-10-04T07:12:00.000Z',
    validTo: null,
    source: 'transfer',
  });
  const previous = assignment({
    validFrom: '2025-03-12T00:00:00.000Z',
    validTo: '2026-10-04T07:12:00.000Z',
    source: 'backfill',
    actor: null,
  });
  const pending = transfer({ status: 'pending' });
  const approved = transfer({ status: 'approved', decidedAt: '2026-10-04T07:12:00.000Z' });
  const rejectedOld = transfer({
    status: 'rejected',
    createdAt: '2026-05-01T08:00:00.000Z',
    decidedAt: '2026-05-02T08:00:00.000Z',
  });
  const cancelledNew = transfer({
    status: 'cancelled',
    createdAt: '2026-09-01T08:00:00.000Z',
    decidedAt: '2026-09-01T09:00:00.000Z',
  });

  const timeline = buildPlannerTimeline({
    vehicleId: VEHICLE,
    currentPlannerId: current.planner.id,
    // Deliberately out of order — the builder sorts newest first.
    assignments: [previous, current],
    transfers: [rejectedOld, pending, approved, cancelledNew],
  });

  it('pulls the pending request out (always the first node)', () => {
    expect(timeline.pending?.id).toBe(pending.id);
  });

  it('orders the journal newest first', () => {
    expect(timeline.assignments.map((a) => a.id)).toEqual([current.id, previous.id]);
  });

  it('keeps only rejected / cancelled under <details>, newest decision first', () => {
    expect(timeline.closed.map((t) => t.id)).toEqual([cancelledNew.id, rejectedOld.id]);
  });

  it('never lists an approved request separately (it is its transfer row)', () => {
    const ids = [
      timeline.pending?.id,
      ...timeline.closed.map((t) => t.id),
    ];
    expect(ids).not.toContain(approved.id);
  });

  it('an empty history is an empty timeline', () => {
    expect(
      buildPlannerTimeline({
        vehicleId: VEHICLE,
        currentPlannerId: null,
        assignments: [],
        transfers: [],
      }),
    ).toEqual({ pending: null, assignments: [], closed: [] });
  });
});

describe('pendingTransferOf', () => {
  it('returns the pending request, or null (also while loading)', () => {
    const p = transfer();
    expect(
      pendingTransferOf({
        vehicleId: VEHICLE,
        currentPlannerId: null,
        assignments: [],
        transfers: [transfer({ status: 'rejected' }), p],
      })?.id,
    ).toBe(p.id);
    expect(pendingTransferOf(undefined)).toBeNull();
  });
});
