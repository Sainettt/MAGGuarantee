// Test fixtures for the planner-transfer helpers (imported by `*.test.ts`
// only). Plain objects typed against the shared DTOs, so a contract change in
// `@magguarantee/shared` breaks the tests at compile time.

import type {
  PlannerAssignmentDto,
  PlannerTransferDto,
  PlannerTransferPersonDto,
} from '@magguarantee/shared';

let seq = 0;
/** A deterministic UUID-shaped id for fixtures. */
export function fid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

export function person(
  overrides: Partial<PlannerTransferPersonDto> = {},
): PlannerTransferPersonDto {
  return {
    id: fid(),
    login: 'jkowalski',
    name: 'Jan Kowalski',
    role: 'planista',
    lider: false,
    ...overrides,
  };
}

export function transfer(
  overrides: Partial<PlannerTransferDto> = {},
): PlannerTransferDto {
  const from = person({ name: 'Anna Nowak', login: 'anowak' });
  return {
    id: fid(),
    status: 'pending',
    vehicle: {
      id: fid(),
      plateNumber: 'WGM 1234A',
      sideNumber: '117',
      active: true,
      carrier: { id: fid(), login: 'transpol', name: 'Trans-Pol Sp. z o.o.' },
    },
    fromPlanner: { ...from, leader: null },
    toPlanner: person({ name: 'Piotr Wiśniewski', login: 'pwisniewski' }),
    requestedBy: person({ role: 'opiekun' }),
    decidedBy: null,
    reason: 'Planista przechodzi do działu eksportu.',
    decisionComment: null,
    decidedAt: null,
    createdAt: '2026-10-12T12:05:00.000Z',
    updatedAt: '2026-10-12T12:05:00.000Z',
    viewerCanDecide: false,
    viewerBlockedReason: null,
    viewerCanCancel: false,
    ...overrides,
  };
}

export function assignment(
  overrides: Partial<PlannerAssignmentDto> = {},
): PlannerAssignmentDto {
  return {
    id: fid(),
    planner: person(),
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    source: 'create',
    actor: person({ role: 'opiekun' }),
    transfer: null,
    ...overrides,
  };
}
