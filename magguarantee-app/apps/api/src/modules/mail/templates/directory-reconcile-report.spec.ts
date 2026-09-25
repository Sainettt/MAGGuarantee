// docs/28 §3.3 — the reconcile report shows the leader flag next to the role,
// because a PLANISTA → PLANISTA_LIDER move changes the flag and nothing else;
// without it the admin would read "planista → planista".
//
// Rendered with `react-dom/server.renderToStaticMarkup` (see
// verification-digest.spec.ts for why not `@react-email/render`).

import { renderToStaticMarkup } from 'react-dom/server';

import {
  DirectoryReconcileReportEmail,
  roleWithLider,
  type DirectoryReconcileReportProps,
} from './directory-reconcile-report';

const BASE: DirectoryReconcileReportProps = {
  adminName: 'Admin',
  runAtLabel: '25.09.2026 12:00',
  mode: 'enforce',
  aborted: false,
  abortDetail: null,
  deprovisioned: [],
  roleChanges: [],
  localNotices: [],
};

describe('roleWithLider', () => {
  it('marks a leader and leaves everyone else as the bare role', () => {
    expect(roleWithLider('planista', true)).toBe('planista (lider)');
    expect(roleWithLider('planista', false)).toBe('planista');
  });
});

describe('DirectoryReconcileReportEmail — role changes', () => {
  it('shows a flag-only change as «planista → planista (lider)»', () => {
    const html = renderToStaticMarkup(
      DirectoryReconcileReportEmail({
        ...BASE,
        roleChanges: [
          {
            login: 'jan.kowalski',
            name: 'Jan Kowalski',
            fromRole: 'planista',
            fromLider: false,
            toRole: 'planista',
            toLider: true,
          },
        ],
      }),
    );

    expect(html).toContain('Zmiany ról (1)');
    expect(html).toMatch(/planista → <b>planista \(lider\)<\/b>/);
  });

  it('shows a lost flag on the left-hand side', () => {
    const html = renderToStaticMarkup(
      DirectoryReconcileReportEmail({
        ...BASE,
        roleChanges: [
          {
            login: 'anna.nowak',
            name: null,
            fromRole: 'dyspozytor',
            fromLider: true,
            toRole: 'dyspozytor',
            toLider: false,
          },
        ],
      }),
    );

    expect(html).toMatch(/dyspozytor \(lider\) → <b>dyspozytor<\/b>/);
  });
});
