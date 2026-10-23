import { describe, expect, it } from 'vitest';

import { person, transfer } from './fixtures';
import {
  blockedNoticeKey,
  canTransferFromDetail,
  cardActions,
  decidableCount,
  pendingNoticeState,
  personName,
  plannerCellState,
} from './transferUi';

describe('decidableCount (§17.4.3)', () => {
  it('counts only pending rows the viewer can decide', () => {
    const items = [
      transfer({ viewerCanDecide: true }),
      transfer({ viewerCanDecide: true }),
      // A lider's / an admin's own request, a request to the lider himself —
      // listed, not counted (R4).
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

  it('E2 — admin, any active vehicle, no pending → the same button, his own reason (D9)', () => {
    expect(
      plannerCellState({
        viewerRole: 'admin',
        vehicleActive: true,
        history: 'ready',
        hasPending: false,
      }),
    ).toEqual({ reason: 'lockedAdmin', action: 'request' });
  });

  it('E2 — the same skeleton while the history loads, the button when it failed', () => {
    const base = { viewerRole: 'admin' as const, vehicleActive: true, hasPending: false };
    expect(plannerCellState({ ...base, history: 'loading' })).toEqual({
      reason: 'lockedAdmin',
      action: 'skeleton',
    });
    expect(plannerCellState({ ...base, history: 'unavailable' })).toEqual({
      reason: 'lockedAdmin',
      action: 'request',
    });
  });

  it('E3 — a switched-off vehicle: inactive reason, no action (not even a skeleton), any role', () => {
    for (const viewerRole of ['admin', 'opiekun', 'pracownik'] as const) {
      for (const history of ['loading', 'ready', 'unavailable'] as const) {
        expect(
          plannerCellState({
            viewerRole,
            vehicleActive: false,
            history,
            hasPending: false,
          }),
        ).toEqual({ reason: 'lockedInactive', action: null });
      }
    }
  });

  it.each([
    ['opiekun', 'locked'],
    ['admin', 'lockedAdmin'],
  ] as const)('E4 — %s: a pending request removes the button, the reason stays', (viewerRole, reason) => {
    expect(
      plannerCellState({
        viewerRole,
        vehicleActive: true,
        history: 'ready',
        hasPending: true,
      }),
    ).toEqual({ reason, action: null });
  });

  it.each(['pracownik', 'planista', undefined] as const)(
    'roles outside the edit form filers (%s) never get the button',
    (viewerRole) => {
      expect(
        plannerCellState({
          viewerRole,
          vehicleActive: true,
          history: 'ready',
          hasPending: false,
        }),
      ).toEqual({ reason: 'locked', action: null });
    },
  );
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
    // Both file from the edit form instead (E1 / E2, D9) — one entry per role.
    ['admin (goes through «Edytuj», E2)', { viewerRole: 'admin' as const }],
    ['opiekun (goes through «Edytuj», E1)', { viewerRole: 'opiekun' as const }],
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

describe('blockedNoticeKey (§17.5.4)', () => {
  it('the target planista is told an administrator decides', () => {
    expect(blockedNoticeKey('target', 'planista')).toBe('blockedTarget');
  });

  it('a lider-author is told an administrator decides', () => {
    expect(blockedNoticeKey('requester', 'planista')).toBe('blockedRequester');
  });

  it('an admin-author is told ANOTHER admin or the current lider decides', () => {
    expect(blockedNoticeKey('requester', 'admin')).toBe('blockedRequesterAdmin');
  });
});

describe('pendingNoticeState (§17.2.2 E4)', () => {
  const adminId = '00000000-0000-4000-8000-0000000000ad';
  const admin = { role: 'admin' as const, id: adminId };

  it('admin author → cancel + the «who decides» note, never the review link', () => {
    const tr = transfer({
      requestedBy: person({ id: adminId, role: 'admin' }),
      viewerCanCancel: true,
      viewerBlockedReason: 'requester',
    });
    expect(pendingNoticeState(tr, admin)).toEqual({
      showAdminAuthorNote: true,
      action: 'cancel',
    });
  });

  it('admin who is not the author → the review link only', () => {
    expect(pendingNoticeState(transfer({ viewerCanDecide: true }), admin)).toEqual({
      showAdminAuthorNote: false,
      action: 'review',
    });
  });

  it('admin author without the cancel flag (defensive) → no link, no cancel', () => {
    const tr = transfer({ requestedBy: person({ id: adminId, role: 'admin' }) });
    expect(pendingNoticeState(tr, admin)).toEqual({
      showAdminAuthorNote: true,
      action: null,
    });
  });

  it.each(['opiekun', 'planista'] as const)('%s author → cancel, no note', (role) => {
    const me = '00000000-0000-4000-8000-0000000000aa';
    const tr = transfer({ requestedBy: person({ id: me, role }), viewerCanCancel: true });
    expect(pendingNoticeState(tr, { role, id: me })).toEqual({
      showAdminAuthorNote: false,
      action: 'cancel',
    });
  });

  it('a non-author opiekun → nothing', () => {
    expect(
      pendingNoticeState(transfer(), { role: 'opiekun', id: 'someone-else' }),
    ).toEqual({ showAdminAuthorNote: false, action: null });
  });

  it('unknown viewer (auth still loading) → nothing', () => {
    expect(
      pendingNoticeState(transfer(), { role: undefined, id: undefined }),
    ).toEqual({ showAdminAuthorNote: false, action: null });
  });
});

describe('personName', () => {
  it('prefers the name, falls back to the login, em-dash for none', () => {
    expect(personName({ name: 'Anna Nowak', login: 'anowak' })).toBe('Anna Nowak');
    expect(personName({ name: null, login: 'anowak' })).toBe('anowak');
    expect(personName({ name: '  ', login: 'anowak' })).toBe('anowak');
    expect(personName(null)).toBe('—');
  });
});
