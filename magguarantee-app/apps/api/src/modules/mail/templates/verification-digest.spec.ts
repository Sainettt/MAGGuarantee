// docs/21-pracownik-verification-sla.md §5 — smoke test for the verification
// digest email template. Asserts the JSX produces non-empty HTML carrying the
// key business fields (nrZgl, carrier, plate) and the working-days-left
// labels («po terminie» for overdue, «{n} dni robocze» for dueSoon), plus the
// per-row «Reklamacja» marker on REKLAMACJA rows (docs/21 §5, 2026-10-22).
//
// We render via `react-dom/server.renderToStaticMarkup` directly rather than
// `@react-email/render` (the async dynamic import the latter uses doesn't
// resolve cleanly under ts-jest CommonJS). Production uses the async `render`
// helper in MailService.

import { renderToStaticMarkup } from 'react-dom/server';

import {
  isReklamacjaRow,
  REKLAMACJA_MARKER_LABEL,
  VerificationDigestEmail,
  verificationDigestHeadline,
  workingDaysLabel,
  type VerificationDigestProps,
} from './verification-digest';

function renderHtml(props: VerificationDigestProps): string {
  return renderToStaticMarkup(VerificationDigestEmail(props));
}

/** The rendered `<p>…</p>` of the digest row carrying `nrZgl`. */
function rowHtml(html: string, nrZgl: string): string {
  const row = html
    .split('<p')
    .map((chunk) => chunk.split('</p>')[0] ?? '')
    .find((chunk) => chunk.includes(nrZgl));
  if (row === undefined) throw new Error(`row ${nrZgl} not rendered`);
  return row;
}

const FIXTURE: VerificationDigestProps = {
  overdue: [
    {
      nrZgl: 'GWA/001/05/26',
      status: 'NA_WERYFIKACJI',
      carrierName: 'TransLogis Sp. z o.o.',
      vehiclePlate: 'WX12345',
      workingDaysLeft: -2,
    },
  ],
  dueSoon: [
    {
      nrZgl: 'GWA/002/05/26',
      status: 'NA_WERYFIKACJI',
      carrierName: 'Speedo Transport',
      vehiclePlate: 'KR99999',
      workingDaysLeft: 2,
    },
  ],
  deeplink: 'http://localhost:3000/employee/dashboard',
};

describe('workingDaysLabel', () => {
  it('renders «po terminie» for overdue (negative)', () => {
    expect(workingDaysLabel(-1)).toBe('po terminie');
    expect(workingDaysLabel(-5)).toBe('po terminie');
  });

  it('renders «{n} dni robocze» for due-soon (0..3)', () => {
    expect(workingDaysLabel(0)).toBe('0 dni robocze');
    expect(workingDaysLabel(3)).toBe('3 dni robocze');
  });
});

describe('isReklamacjaRow / verificationDigestHeadline', () => {
  it('flags only REKLAMACJA rows', () => {
    expect(isReklamacjaRow({ status: 'REKLAMACJA' })).toBe(true);
    expect(isReklamacjaRow({ status: 'NA_WERYFIKACJI' })).toBe(false);
  });

  it('words the headline (preheader + subject) for both verification and reklamacje', () => {
    expect(verificationDigestHeadline(3)).toBe(
      'Zgłoszenia i reklamacje do rozpatrzenia — 3 wymaga uwagi',
    );
  });
});

describe('VerificationDigestEmail', () => {
  it('renders non-empty HTML', () => {
    const html = renderHtml(FIXTURE);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(200);
  });

  it('lists overdue and due-soon claims with nrZgl, carrier and plate', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain('GWA/001/05/26');
    expect(html).toContain('TransLogis Sp. z o.o.');
    expect(html).toContain('WX12345');
    expect(html).toContain('GWA/002/05/26');
    expect(html).toContain('Speedo Transport');
    expect(html).toContain('KR99999');
  });

  it('renders «po terminie» for overdue and «{n} dni robocze» for due-soon', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain('po terminie');
    expect(html).toContain('2 dni robocze');
  });

  it('lists overdue BEFORE due-soon', () => {
    const html = renderHtml(FIXTURE);
    expect(html.indexOf('GWA/001/05/26')).toBeLessThan(
      html.indexOf('GWA/002/05/26'),
    );
  });

  it('embeds the dashboard deeplink', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain(FIXTURE.deeplink);
  });

  it('uses the email brand red (#E02020)', () => {
    const html = renderHtml(FIXTURE);
    // The email design system (docs/22-email-design.md §1) uses #E02020 — a
    // distinct red from the web app's #dc2626. Rendered inline styles lower-case
    // hex, so match case-insensitively.
    expect(html.toLowerCase()).toContain('#e02020');
  });

  it('omits the overdue group cleanly when there are no overdue claims', () => {
    const props: VerificationDigestProps = {
      ...FIXTURE,
      overdue: [],
    };
    const html = renderHtml(props);
    expect(html).not.toContain('Po terminie');
    // due-soon group still renders.
    expect(html).toContain('GWA/002/05/26');
  });

  it('marks a REKLAMACJA row with «Reklamacja» and leaves NA_WERYFIKACJI rows unmarked', () => {
    const props: VerificationDigestProps = {
      ...FIXTURE,
      dueSoon: [
        ...FIXTURE.dueSoon,
        {
          nrZgl: 'GWA/003/04/26',
          status: 'REKLAMACJA',
          carrierName: 'Reklamant Sp. z o.o.',
          vehiclePlate: 'PO7777',
          workingDaysLeft: 1,
        },
      ],
    };
    const html = renderHtml(props);

    expect(rowHtml(html, 'GWA/003/04/26')).toContain(REKLAMACJA_MARKER_LABEL);
    expect(rowHtml(html, 'GWA/001/05/26')).not.toContain(REKLAMACJA_MARKER_LABEL);
    expect(rowHtml(html, 'GWA/002/05/26')).not.toContain(REKLAMACJA_MARKER_LABEL);
    // One list per bucket — no separate reklamacja section.
    expect(html.split('Zbliża się termin').length - 1).toBe(1);
    expect(html).toContain('Zbliża się termin (2)');
  });

  it('renders no marker at all when there are no REKLAMACJA rows', () => {
    const html = renderHtml(FIXTURE);
    expect(html).not.toContain(REKLAMACJA_MARKER_LABEL);
  });

  it('carries the title and note wording that covers reklamacje', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain('Zgłoszenia do weryfikacji i reklamacje');
    expect(html).toContain('rozpatrywanie reklamacji');
    expect(html).toContain('Otwórz panel weryfikacji');
  });

  it('omits the due-soon group cleanly when there are no due-soon claims', () => {
    const props: VerificationDigestProps = {
      ...FIXTURE,
      dueSoon: [],
    };
    const html = renderHtml(props);
    expect(html).not.toContain('Zbliża się termin');
    expect(html).toContain('GWA/001/05/26');
  });
});
