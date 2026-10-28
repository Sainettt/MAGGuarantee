/**
 * `SubmitDelegationSchema` — the planned-return-vs-departure refinement
 * (UWAGI #30).
 *
 * `departureAt` is a TRUE UTC instant (the carrier form posts
 * `new Date(datetimeLocal).toISOString()`), so the day it is compared against
 * is its WARSAW calendar date (docs/19 #16). A raw ISO slice would be the UTC
 * day, which for a departure declared at 00:00–00:59 CET / 00:00–01:59 CEST is
 * the day BEFORE — and the schema then accepted a planned return dated before
 * the departure. Expectations are string literals on purpose; nothing here may
 * depend on the process timezone.
 */
import { describe, expect, it } from 'vitest';

import { SubmitDelegationSchema } from '../src/schemas/delegations';

const UUID_V = '2b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
const UUID_T = '3c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e';
const UUID_D = '4d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f';

function body(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: UUID_V,
    trailerId: UUID_T,
    driverId: UUID_D,
    departureAt: '2026-06-01T08:00:00.000Z',
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    plannedReturnAt: '2026-06-05',
    returnCountry: 'PL',
    returnPostalCode: '00-001',
    ...overrides,
  };
}

function plannedReturnIssue(input: unknown): string | null {
  const r = SubmitDelegationSchema.safeParse(input);
  if (r.success) return null;
  const issue = r.error.issues.find((i) => i.path.join('.') === 'plannedReturnAt');
  return issue ? issue.message : `other issues: ${JSON.stringify(r.error.issues)}`;
}

describe('SubmitDelegationSchema — plannedReturnAt vs the Warsaw day of departureAt (UWAGI #30)', () => {
  it.each([
    // [departureAt (true UTC), Warsaw day it falls on, plannedReturnAt, accepted?]
    // CEST: 2026-04-30T22:30Z = 01.05 00:30 Warsaw. A raw slice said 30.04.
    ['2026-04-30T22:30:00.000Z', '2026-05-01', '2026-04-30', false],
    ['2026-04-30T22:30:00.000Z', '2026-05-01', '2026-05-01', true],
    // CET: 2026-01-14T23:30Z = 15.01 00:30 Warsaw. A raw slice said 14.01.
    ['2026-01-14T23:30:00.000Z', '2026-01-15', '2026-01-14', false],
    ['2026-01-14T23:30:00.000Z', '2026-01-15', '2026-01-15', true],
    // Daytime control — the UTC day already equals the Warsaw day.
    ['2026-06-01T08:00:00.000Z', '2026-06-01', '2026-05-31', false],
    ['2026-06-01T08:00:00.000Z', '2026-06-01', '2026-06-01', true],
    // Late evening Warsaw (23:50 CEST on 01.06 = 21:50Z) — still the same day,
    // so a same-day planned return is allowed (the original intent).
    ['2026-06-01T21:50:00.000Z', '2026-06-01', '2026-06-01', true],
    ['2026-06-01T21:50:00.000Z', '2026-06-01', '2026-05-31', false],
  ])(
    'departureAt %s (Warsaw %s) with plannedReturnAt %s → accepted=%s',
    (departureAt, _warsawDay, plannedReturnAt, accepted) => {
      const issue = plannedReturnIssue(body({ departureAt, plannedReturnAt }));
      if (accepted) {
        expect(issue).toBeNull();
      } else {
        expect(issue).toBe('plannedReturnAt must be on or after departureAt');
      }
    },
  );

  it('the baseline body is valid (so the refinement is the only thing under test)', () => {
    expect(SubmitDelegationSchema.safeParse(body()).success).toBe(true);
  });
});
