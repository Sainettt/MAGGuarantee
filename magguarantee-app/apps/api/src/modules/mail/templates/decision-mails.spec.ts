// UWAGI #4 (2026-10-22) — the wniosek decision mails label whose text is whose.
//
//  - `carrier-decision`:  MAGTRANS's text only, «Uzasadnienie decyzji»
//    (ZAAKCEPTOWANO) / «Powód odrzucenia» (ODRZUCONO). The carrier's own note
//    is not echoed back.
//  - `internal-decision`: the same block PLUS «Komentarz przewoźnika» when the
//    carrier left a note.
//  - The plain-text fallback (`buildDecisionText`) uses the same headings.
//
// Rendered via `react-dom/server.renderToStaticMarkup` (see
// `verification-digest.spec.ts` for why not `@react-email/render`).

import { renderToStaticMarkup } from 'react-dom/server';

import {
  buildDecisionText,
  CARRIER_COMMENT_HEADING,
  DECISION_COMMENT_HEADING,
} from './_decision-copy';
import { CarrierDecisionEmail, type CarrierDecisionProps } from './carrier-decision';
import { InternalDecisionEmail, type InternalDecisionProps } from './internal-decision';

const REASON = 'Brak podstaw do dopłaty.';
const JUSTIFICATION = 'Dopłata zgodna z umową.';
const CARRIER_NOTE = 'Kierowca czekał 3 dni na załadunek.';

const CARRIER_BASE: CarrierDecisionProps = {
  nrZgl: 'GWA/001/05/26',
  decisionLabel: 'ODRZUCONO',
  tone: 'danger',
  vehiclePlate: 'WX12345',
  periodFrom: '2026-05-01',
  periodTo: '2026-05-10',
  deeplink: 'http://localhost:3000/carrier/claims/GWA%2F001%2F05%2F26',
};

const INTERNAL_BASE: InternalDecisionProps = {
  ...CARRIER_BASE,
  carrierName: 'TransLogis Sp. z o.o.',
  deeplink: 'http://localhost:3000/employee/claims?nrZgl=GWA%2F001%2F05%2F26',
};

describe('decision copy', () => {
  it('names the two headings per decision and the carrier block', () => {
    expect(DECISION_COMMENT_HEADING.ZAAKCEPTOWANO).toBe('Uzasadnienie decyzji');
    expect(DECISION_COMMENT_HEADING.ODRZUCONO).toBe('Powód odrzucenia');
    expect(CARRIER_COMMENT_HEADING).toBe('Komentarz przewoźnika');
  });
});

describe('CarrierDecisionEmail', () => {
  it('ODRZUCONO shows the reason under «Powód odrzucenia»', () => {
    const html = renderToStaticMarkup(
      CarrierDecisionEmail({ ...CARRIER_BASE, decisionComment: REASON }),
    );
    expect(html).toContain('Powód odrzucenia');
    expect(html).toContain(REASON);
    expect(html).not.toContain('Uzasadnienie decyzji');
    expect(html).not.toContain('Komentarz przewoźnika');
  });

  it('ZAAKCEPTOWANO shows the justification under «Uzasadnienie decyzji»', () => {
    const html = renderToStaticMarkup(
      CarrierDecisionEmail({
        ...CARRIER_BASE,
        decisionLabel: 'ZAAKCEPTOWANO',
        tone: 'success',
        amount: '1400.00',
        decisionComment: JUSTIFICATION,
      }),
    );
    expect(html).toContain('Uzasadnienie decyzji');
    expect(html).toContain(JUSTIFICATION);
    expect(html).not.toContain('Powód odrzucenia');
  });

  it('no decisionComment renders no free-text block at all', () => {
    const html = renderToStaticMarkup(
      CarrierDecisionEmail({
        ...CARRIER_BASE,
        decisionLabel: 'ZAAKCEPTOWANO',
        tone: 'success',
        amount: '1400.00',
      }),
    );
    expect(html).not.toContain('Uzasadnienie decyzji');
    expect(html).not.toContain('Komentarz');
  });
});

describe('InternalDecisionEmail', () => {
  it('shows MAGTRANS\'s reason AND the carrier note, each under its own heading', () => {
    const html = renderToStaticMarkup(
      InternalDecisionEmail({
        ...INTERNAL_BASE,
        decisionComment: REASON,
        carrierComment: CARRIER_NOTE,
      }),
    );
    expect(html).toContain('Powód odrzucenia');
    expect(html).toContain(REASON);
    expect(html).toContain('Komentarz przewoźnika');
    expect(html).toContain(CARRIER_NOTE);
    // MAGTRANS's verdict comes first, the carrier's note after it.
    expect(html.indexOf('Powód odrzucenia')).toBeLessThan(
      html.indexOf('Komentarz przewoźnika'),
    );
  });

  it('only the carrier note ⇒ only «Komentarz przewoźnika»', () => {
    const html = renderToStaticMarkup(
      InternalDecisionEmail({
        ...INTERNAL_BASE,
        decisionLabel: 'ZAAKCEPTOWANO',
        tone: 'success',
        carrierComment: CARRIER_NOTE,
      }),
    );
    expect(html).toContain('Komentarz przewoźnika');
    expect(html).toContain(CARRIER_NOTE);
    expect(html).not.toContain('Uzasadnienie decyzji');
  });

  it('links the CTA to the employee list deeplink', () => {
    const html = renderToStaticMarkup(InternalDecisionEmail(INTERNAL_BASE));
    expect(html).toContain(
      'href="http://localhost:3000/employee/claims?nrZgl=GWA%2F001%2F05%2F26"',
    );
  });
});

describe('buildDecisionText (plain-text fallback)', () => {
  it('carrier variant: the reason under «Powód odrzucenia», no carrier block', () => {
    const text = buildDecisionText({
      nrZgl: CARRIER_BASE.nrZgl,
      decisionLabel: 'ODRZUCONO',
      vehiclePlate: CARRIER_BASE.vehiclePlate,
      periodFrom: CARRIER_BASE.periodFrom,
      periodTo: CARRIER_BASE.periodTo,
      decisionComment: REASON,
      deeplink: CARRIER_BASE.deeplink,
    });
    expect(text).toContain(`Powód odrzucenia: ${REASON}`);
    expect(text).not.toContain('Komentarz');
    expect(text).toContain(`Otwórz: ${CARRIER_BASE.deeplink}`);
  });

  it('internal variant: both blocks, verdict first', () => {
    const text = buildDecisionText({
      nrZgl: INTERNAL_BASE.nrZgl,
      decisionLabel: 'ZAAKCEPTOWANO',
      carrierName: INTERNAL_BASE.carrierName,
      vehiclePlate: INTERNAL_BASE.vehiclePlate,
      periodFrom: INTERNAL_BASE.periodFrom,
      periodTo: INTERNAL_BASE.periodTo,
      amount: '1400.00',
      decisionComment: JUSTIFICATION,
      carrierComment: CARRIER_NOTE,
      deeplink: INTERNAL_BASE.deeplink,
    });
    expect(text).toContain('Przewoźnik: TransLogis Sp. z o.o.');
    expect(text).toContain('Kwota: 1400.00 EUR');
    expect(text).toContain(`Uzasadnienie decyzji: ${JUSTIFICATION}`);
    expect(text).toContain(`Komentarz przewoźnika: ${CARRIER_NOTE}`);
    expect(text.indexOf('Uzasadnienie decyzji')).toBeLessThan(
      text.indexOf('Komentarz przewoźnika'),
    );
  });

  it('no texts ⇒ neither heading', () => {
    const text = buildDecisionText({
      nrZgl: CARRIER_BASE.nrZgl,
      decisionLabel: 'ZAAKCEPTOWANO',
      vehiclePlate: CARRIER_BASE.vehiclePlate,
      periodFrom: CARRIER_BASE.periodFrom,
      periodTo: CARRIER_BASE.periodTo,
      deeplink: CARRIER_BASE.deeplink,
    });
    expect(text).not.toContain('Uzasadnienie decyzji');
    expect(text).not.toContain('Komentarz');
  });
});
