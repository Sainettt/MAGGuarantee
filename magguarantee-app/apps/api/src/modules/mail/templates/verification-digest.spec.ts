// docs/21-pracownik-verification-sla.md §5 — smoke test for the verification
// digest email template. Asserts the JSX produces non-empty HTML carrying the
// key business fields (nrZgl, carrier, plate) and the working-days-left
// labels («po terminie» for overdue, «{n} dni robocze» for dueSoon).
//
// We render via `react-dom/server.renderToStaticMarkup` directly rather than
// `@react-email/render` (the async dynamic import the latter uses doesn't
// resolve cleanly under ts-jest CommonJS). Production uses the async `render`
// helper in MailService.

import { renderToStaticMarkup } from 'react-dom/server';

import {
  VerificationDigestEmail,
  workingDaysLabel,
  type VerificationDigestProps,
} from './verification-digest';

function renderHtml(props: VerificationDigestProps): string {
  return renderToStaticMarkup(VerificationDigestEmail(props));
}

const FIXTURE: VerificationDigestProps = {
  overdue: [
    {
      nrZgl: 'GWA/001/05/26',
      carrierName: 'TransLogis Sp. z o.o.',
      vehiclePlate: 'WX12345',
      workingDaysLeft: -2,
    },
  ],
  dueSoon: [
    {
      nrZgl: 'GWA/002/05/26',
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

  it('uses MAGTRANS RED brand color', () => {
    const html = renderHtml(FIXTURE);
    expect(html.toLowerCase()).toContain('#dc2626');
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
