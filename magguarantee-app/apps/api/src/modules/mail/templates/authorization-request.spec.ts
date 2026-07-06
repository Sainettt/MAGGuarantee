// Phase 4.2 — smoke test for the authorization-request email template.
//
// Asserts that the JSX template produces non-empty HTML and that the key
// business fields (nrZgl, dopłata, deeplink, carrier) appear in the output.
// The request email no longer carries a kwota-Maksima — the amount is decided
// by Maksim in his reply and recorded via PUT /claims/:nrZgl/authorization-amount.
// We deliberately do NOT diff against a stored snapshot — the goal is to catch
// wiring regressions, not to lock the visual design.
//
// We render via `react-dom/server.renderToStaticMarkup` directly rather
// than `@react-email/render`. The latter wraps the call in an `await
// import('react-dom/server')` dynamic import that Jest's VM cannot resolve
// under `ts-jest` (CommonJS output) without `--experimental-vm-modules` —
// which the rest of the suite doesn't use. Production (`node dist/main.js`)
// is unaffected: `MailService.sendAuthorizationRequest` continues to use
// the async `render` helper because it adds doctype + pretty-printing on
// top of `renderToStaticMarkup`.
//
// Both paths exercise the SAME component (`AuthorizationRequestEmail`), so
// the smoke test still proves "the JSX compiles and produces HTML carrying
// the expected business fields" — the criterion the brief asks for.

import { renderToStaticMarkup } from 'react-dom/server';

import {
  AuthorizationRequestEmail,
  type AuthorizationRequestProps,
} from './authorization-request';

function renderHtml(props: AuthorizationRequestProps): string {
  return renderToStaticMarkup(AuthorizationRequestEmail(props));
}

const FIXTURE: AuthorizationRequestProps = {
  nrZgl: 'GWA/042/05/26',
  carrierName: 'TransLogis Sp. z o.o.',
  vehiclePlate: 'WX12345',
  periodFrom: '2026-05-01',
  periodTo: '2026-05-13',
  doplata: '1400.00',
  prog: '500.00',
  dniWTrasie: '20.00',
  comment: 'Powyżej progu — wymaga zgody Maksima.',
  deeplink: 'http://localhost:3000/employee/claims/GWA%2F042%2F05%2F26',
};

describe('AuthorizationRequestEmail', () => {
  it('renders non-empty HTML', () => {
    const html = renderHtml(FIXTURE);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(200);
  });

  it('includes the nrZgl, carrier name, vehicle plate, and the dopłata', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain('GWA/042/05/26');
    expect(html).toContain('TransLogis Sp. z o.o.');
    expect(html).toContain('WX12345');
    expect(html).toContain('1400.00');
  });

  it('does NOT carry a kwota-Maksima amount (decided in Maksim reply)', () => {
    const html = renderHtml(FIXTURE);
    // The request email lists dopłata / próg only; the authorized amount is
    // recorded later via PUT /claims/:nrZgl/authorization-amount.
    expect(html).not.toContain('Kwota Maksima');
    expect(html).not.toContain('do autoryzacji');
  });

  it('renders the SOFT authorization threshold (próg) row', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain('Próg autoryzacji');
    expect(html).toContain('500.00');
  });

  it('renders the Dni w trasie row when supplied and omits it when absent', () => {
    const withDays = renderHtml(FIXTURE);
    expect(withDays).toContain('Dni w trasie');
    expect(withDays).toContain('20.00');

    const props: AuthorizationRequestProps = { ...FIXTURE };
    delete props.dniWTrasie;
    const withoutDays = renderHtml(props);
    expect(withoutDays).not.toContain('Dni w trasie');
    // The threshold row still renders regardless of the optional trip-length row.
    expect(withoutDays).toContain('Próg autoryzacji');
  });

  it('embeds the deeplink as a clickable anchor target', () => {
    const html = renderHtml(FIXTURE);
    // Anchor (CTA button) — `href` attribute carries the deeplink verbatim.
    expect(html).toContain(FIXTURE.deeplink);
  });

  it('renders the verifier comment when supplied', () => {
    const html = renderHtml(FIXTURE);
    expect(html).toContain('Powyżej progu');
  });

  it('omits the comment block cleanly when not supplied', () => {
    const props: AuthorizationRequestProps = { ...FIXTURE };
    delete props.comment;
    const html = renderHtml(props);
    // No "Komentarz weryfikatora" label when there's no comment.
    expect(html).not.toContain('Komentarz weryfikatora');
    // But the rest of the body still renders.
    expect(html).toContain('GWA/042/05/26');
  });

  it('uses MAGTRANS RED brand color for the CTA + amount accent', () => {
    const html = renderHtml(FIXTURE);
    // #dc2626 is the canonical brand red — referenced explicitly in the
    // template's amount + button styles.
    expect(html.toLowerCase()).toContain('#dc2626');
  });
});
