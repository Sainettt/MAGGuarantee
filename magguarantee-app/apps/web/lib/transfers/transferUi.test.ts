import { describe, expect, it } from 'vitest';

import { transfer } from './fixtures';
import {
  canTransferFromDetail,
  cardActions,
  decidableCount,
  personName,
  plannerCellState,
} from './transferUi';

describe('decidableCount (§17.4.3)', () => {
  it('counts only pending rows the viewer can decide', () => {
    const items = [
      transfer({ viewerCanDecide: true }),
      transfer({ viewerCanDecide: true }),
      // A lider's own request / a request to himself — listed, not counted.
      transfer({ viewerBlockedReason: 'requester' }),
      transfer({ viewerBlockedReason: 'target' }),
      // Defensive: a decided row never counts, whatever the flag says.
      transfer({ status: 'approved', viewerCanDecide: true }),
    ];
    expect(decidableCount(items)).toBe(2);
  });

  it('is 0 for an empty inbox', () => {
    expect(decidableCount([])).toBe(0);
  });
});

describe('plannerCellState (§17.2.2 E1–E4)', () => {
  it('E1 — opiekun, active vehicle, no pending → request button', () => {
    expect(
      plannerCellState({
        viewerRole: 'opiekun',
        vehicleActive: true,
        history: 'ready',
        hasPending: false,
      }),
    ).toEqual({ reason: 'locked', action: 'request' });
  });

  it('E1 while the history loads → skeleton instead of the button', () => {
    expect(
      plannerCellState({
        viewerRole: 'opiekun',
        vehicleActive: true,
        history: 'loading',
        hasPending: false,
      }).action,
    ).toBe('skeleton');
  });

  it('E1 when the history failed → the button stays (the api re-checks)', () => {
    expect(
      plannerCellState({
        viewerRole: 'opiekun',
        vehicleActive: true,
        history: 'unavailable',
        hasPending: false,
      }).action,
    ).toBe('request');
  });

  it('E2 — admin never gets the button (U1), and its own reason', () => {
    for (const history of ['loading', 'ready', 'unavailable'] as const) {
      expect(
        plannerCellState({
          viewerRole: 'admin',
          vehicleActive: true,
          history,
          hasPending: false,
        }),
      ).toEqual({ reason: 'lockedAdmin', action: null });
    }
  });

  it('E3 — a switched-off vehicle: inactive reason, no action, any role', () => {
    for (const viewerRole of ['admin', 'opiekun'] as const) {
      expect(
        plannerCellState({
          viewerRole,
          vehicleActive: false,
          history: 'ready',
          hasPending: false,
        }),
      ).toEqual({ reason: 'lockedInactive', action: null });
    }
  });

  it('E4 — a pending request removes the button', () => {
    expect(
      plannerCellState({
        viewerRole: 'opiekun',
        vehicleActive: true,
        history: 'ready',
        hasPending: true,
      }),
    ).toEqual({ reason: 'locked', action: null });
  });
});

describe('canTransferFromDetail (§17.6.3)', () => {
  const me = '00000000-0000-4000-8000-00000000abcd';
  const base = {
    viewerRole: 'planista' as const,
    viewerId: me,
    vehicle: { plannerId: me, active: true },
    historyReady: true,
    hasPending: false,
  };

  it('the current planista of an active vehicle without pending → shown', () => {
    expect(canTransferFromDetail(base)).toBe(true);
  });

  it.each([
    ['another planista', { vehicle: { plannerId: 'x', active: true } }],
    ['a switched-off vehicle', { vehicle: { plannerId: me, active: false } }],
    ['a pending request', { hasPending: true }],
    ['history not loaded yet', { historyReady: false }],
    ['admin (U1)', { viewerRole: 'admin' as const }],
    ['opiekun (goes through «Edytuj»)', { viewerRole: 'opiekun' as const }],
  ])('hidden for %s', (_label, patch) => {
    expect(canTransferFromDetail({ ...base, ...patch })).toBe(false);
  });
});

describe('cardActions (§17.5.3)', () => {
  it('decider + viewerCanDecide → decide', () => {
    expect(cardActions(transfer({ viewerCanDecide: true }), 'decider')).toEqual({
      kind: 'decide',
    });
  });

  it.each(['target', 'requester'] as const)(
    'decider + blocked (%s) → LockNotice with that reason',
    (reason) => {
      expect(
        cardActions(transfer({ viewerBlockedReason: reason }), 'decider'),
      ).toEqual({ kind: 'blocked', reason });
    },
  );

  it('author + viewerCanCancel → cancel', () => {
    expect(cardActions(transfer({ viewerCanCancel: true }), 'author')).toEqual({
      kind: 'cancel',
    });
  });

  it('the author list never shows decide buttons, even for a decider flag', () => {
    expect(cardActions(transfer({ viewerCanDecide: true }), 'author')).toEqual({
      kind: 'none',
    });
  });

  it.each(['approved', 'rejected', 'cancelled'] as const)(
    '%s rows → no actions in either mode',
    (status) => {
      const t = transfer({ status, viewerCanDecide: true, viewerCanCancel: true });
      expect(cardActions(t, 'decider')).toEqual({ kind: 'none' });
      expect(cardActions(t, 'author')).toEqual({ kind: 'none' });
    },
  );
});

describe('personName', () => {
  it('prefers the name, falls back to the login, em-dash for none', () => {
    expect(personName({ name: 'Anna Nowak', login: 'anowak' })).toBe('Anna Nowak');
    expect(personName({ name: null, login: 'anowak' })).toBe('anowak');
    expect(personName({ name: '  ', login: 'anowak' })).toBe('anowak');
    expect(personName(null)).toBe('—');
  });
});
