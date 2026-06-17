// Unit tests for the pure 4-line Google Chat wyjazd formatter.
// Locked contract: docs/16-jobs-and-integrations.md#google-chat-notifications.
// Phase 11: the ZESPÓŁ line is `planista / <all team dispatcher names>` —
// the weryfikator slot was removed.

import {
  formatDateTimeWarsaw,
  formatDateWarsaw,
  formatWyjazdMessage,
  OPIEKUN_FALLBACK,
  type WyjazdMessageContext,
} from './chat-message';

/** A complete, all-fields-present base context. */
function baseCtx(overrides: Partial<WyjazdMessageContext> = {}): WyjazdMessageContext {
  return {
    // 2026-03-15 09:30 UTC. Warsaw is UTC+1 in March → 10:30 local.
    departureAt: new Date('2026-03-15T09:30:00.000Z'),
    departureCountry: 'PL',
    departurePostalCode: '00-001',
    // Date-only — Prisma @db.Date round-trips as UTC midnight.
    plannedReturnAt: new Date('2026-03-20T00:00:00.000Z'),
    returnCountry: 'DE',
    returnPostalCode: '10115',
    planista: 'Anna Planista',
    // Phase 11 — the whole dispatch team's roster (was a single dyspozytor).
    dyspozytorzy: ['Bartek Dyspozytor', 'Celina Dyspozytor'],
    opiekun: 'Damian Opiekun',
    ...overrides,
  };
}

describe('formatWyjazdMessage', () => {
  it('produces exactly four lines with planista + all team dispatchers', () => {
    const msg = formatWyjazdMessage(baseCtx());
    const lines = msg.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('WYJAZD: 15/03/2026 10:30 / PL / 00-001');
    expect(lines[1]).toBe('ZJAZD: 20/03/2026 / DE / 10115');
    expect(lines[2]).toBe(
      'ZESPÓŁ PROWADZĄCY: Anna Planista / Bartek Dyspozytor / Celina Dyspozytor',
    );
    expect(lines[3]).toBe('OPIEKUN: Damian Opiekun');
  });

  it('renders only planista when the team has no dispatchers', () => {
    const msg = formatWyjazdMessage(baseCtx({ dyspozytorzy: [] }));
    const team = msg.split('\n')[2];
    expect(team).toBe('ZESPÓŁ PROWADZĄCY: Anna Planista');
    expect(team).not.toContain('//');
  });

  it('omits planista when absent (only team dispatchers shown)', () => {
    const msg = formatWyjazdMessage(baseCtx({ planista: null }));
    expect(msg.split('\n')[2]).toBe(
      'ZESPÓŁ PROWADZĄCY: Bartek Dyspozytor / Celina Dyspozytor',
    );
  });

  it('drops a null/blank dispatcher name without a double slash', () => {
    const msg = formatWyjazdMessage(
      baseCtx({ dyspozytorzy: ['Bartek Dyspozytor', null, '   '] }),
    );
    const team = msg.split('\n')[2];
    expect(team).toBe('ZESPÓŁ PROWADZĄCY: Anna Planista / Bartek Dyspozytor');
    expect(team).not.toContain('//');
  });

  it('renders a single team dispatcher when only one is present', () => {
    const msg = formatWyjazdMessage(
      baseCtx({ planista: null, dyspozytorzy: ['Tylko Ten'] }),
    );
    expect(msg.split('\n')[2]).toBe('ZESPÓŁ PROWADZĄCY: Tylko Ten');
  });

  it('leaves the ZESPÓŁ value empty when planista + team are both absent', () => {
    const msg = formatWyjazdMessage(
      baseCtx({ planista: null, dyspozytorzy: [] }),
    );
    expect(msg.split('\n')[2]).toBe('ZESPÓŁ PROWADZĄCY: ');
  });

  it('treats empty/whitespace names as absent', () => {
    const msg = formatWyjazdMessage(
      baseCtx({ planista: '', dyspozytorzy: ['   ', 'Tylko Ten'] }),
    );
    expect(msg.split('\n')[2]).toBe('ZESPÓŁ PROWADZĄCY: Tylko Ten');
  });

  it('falls back to em dash for opiekun when null', () => {
    const msg = formatWyjazdMessage(baseCtx({ opiekun: null }));
    expect(msg.split('\n')[3]).toBe(`OPIEKUN: ${OPIEKUN_FALLBACK}`);
  });

  it('falls back to em dash for opiekun when blank', () => {
    const msg = formatWyjazdMessage(baseCtx({ opiekun: '   ' }));
    expect(msg.split('\n')[3]).toBe(`OPIEKUN: ${OPIEKUN_FALLBACK}`);
  });

  it('has no trailing newline', () => {
    const msg = formatWyjazdMessage(baseCtx());
    expect(msg.endsWith('\n')).toBe(false);
  });
});

describe('Warsaw date formatting (DST + zero-padding)', () => {
  it('formats a winter (UTC+1) departure datetime', () => {
    // 2026-01-05 23:45 UTC → Warsaw 00:45 next day (UTC+1).
    expect(formatDateTimeWarsaw(new Date('2026-01-05T23:45:00.000Z'))).toBe(
      '06/01/2026 00:45',
    );
  });

  it('formats a summer (UTC+2 DST) departure datetime', () => {
    // 2026-07-01 12:00 UTC → Warsaw 14:00 (UTC+2 in July).
    expect(formatDateTimeWarsaw(new Date('2026-07-01T12:00:00.000Z'))).toBe(
      '01/07/2026 14:00',
    );
  });

  it('zero-pads single-digit day/month/hour/minute', () => {
    // 2026-02-03 07:09 UTC → Warsaw 08:09 (UTC+1).
    expect(formatDateTimeWarsaw(new Date('2026-02-03T07:09:00.000Z'))).toBe(
      '03/02/2026 08:09',
    );
  });

  it('renders date-only return without a time', () => {
    expect(formatDateWarsaw(new Date('2026-12-31T00:00:00.000Z'))).toBe(
      '31/12/2026',
    );
  });

  it('uses h23 so Warsaw midnight is 00:00 not 24:00', () => {
    // 2026-06-14 22:00 UTC → Warsaw 00:00 on 2026-06-15 (UTC+2 DST).
    expect(formatDateTimeWarsaw(new Date('2026-06-14T22:00:00.000Z'))).toBe(
      '15/06/2026 00:00',
    );
  });
});
