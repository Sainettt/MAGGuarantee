// Reklamacja eligibility rules — the SINGLE source of the 48 h window and the
// «unpaid remainder» ceiling shared by the api (`ClaimsService.submitReklamacja`)
// and the web (`ReklamacjaSheet`). Pinning the matrix here is what keeps the two
// layers from drifting again (they had, twice).

import { describe, expect, it } from 'vitest';

import {
  getReklamacjaEligibility,
  isWithinReklamacjaCap,
  reklamacjaDeadline,
  resolveReklamacjaCap,
  REKLAMACJA_WINDOW_HOURS,
  type ReklamacjaEligibilityInput,
} from '../src/domain/reklamacja-rules';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** Decision stamp used by every window case. */
const DECIDED_AT = new Date('2026-07-20T10:00:00.000Z');
/** 1 h after the decision — comfortably inside the window. */
const NOW = new Date(DECIDED_AT.getTime() + HOUR);

function input(
  overrides: Partial<ReklamacjaEligibilityInput> = {},
): ReklamacjaEligibilityInput {
  return {
    status: 'ODRZUCONO',
    origPaymentEur: 200,
    paymentEur: 200,
    amountApproved: null,
    reklamacjaSubmitted: false,
    statusChangedAt: DECIDED_AT,
    ...overrides,
  };
}

describe('REKLAMACJA_WINDOW_HOURS', () => {
  it('is 48 (docs/04-data-model.md — one reklamacja, 48 h from statusChangedAt)', () => {
    expect(REKLAMACJA_WINDOW_HOURS).toBe(48);
  });
});

describe('resolveReklamacjaCap', () => {
  it('accepted: origPaymentEur − amountApproved (the unpaid remainder)', () => {
    expect(
      resolveReklamacjaCap({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        paymentEur: 180,
        amountApproved: 150,
      }),
    ).toBe(50);
  });

  it('rejected: the whole originally-requested amount (nothing was paid)', () => {
    expect(
      resolveReklamacjaCap({
        status: 'ODRZUCONO',
        origPaymentEur: 200,
        paymentEur: 180,
        amountApproved: null,
      }),
    ).toBe(200);
  });

  it('rejected: a stale amountApproved must NOT shrink the ceiling', () => {
    expect(
      resolveReklamacjaCap({
        status: 'ODRZUCONO',
        origPaymentEur: 200,
        paymentEur: 200,
        // Should never happen (only an acceptance writes it) — but if it does,
        // a rejected wniosek paid nothing, so the full 200 stays claimable.
        amountApproved: 150,
      }),
    ).toBe(200);
  });

  it('legacy row (origPaymentEur null) falls back to paymentEur', () => {
    expect(
      resolveReklamacjaCap({
        status: 'ODRZUCONO',
        origPaymentEur: null,
        paymentEur: 175.5,
        amountApproved: null,
      }),
    ).toBe(175.5);
  });

  it('legacy ACCEPTED row (origPaymentEur null, approved ≈ paymentEur) yields 0', () => {
    // Fail-closed: without the snapshot we never invent a ceiling.
    expect(
      resolveReklamacjaCap({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: null,
        paymentEur: 1_400,
        amountApproved: 1_400,
      }),
    ).toBe(0);
  });

  it('can be negative when we overpaid the request', () => {
    expect(
      resolveReklamacjaCap({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        paymentEur: 200,
        amountApproved: 250,
      }),
    ).toBe(-50);
  });

  it('rounds to cent precision (no float dust)', () => {
    const cap = resolveReklamacjaCap({
      status: 'ZAAKCEPTOWANO',
      origPaymentEur: 0.3,
      paymentEur: 0.3,
      amountApproved: 0.1,
    });
    // 0.3 − 0.1 in IEEE-754 is 0.19999999999999998; cents math gives 0.2.
    expect(cap).toBe(0.2);
  });
});

describe('isWithinReklamacjaCap', () => {
  it('exactly the cap passes (inclusive boundary)', () => {
    expect(isWithinReklamacjaCap(50, 50)).toBe(true);
  });

  it('cap + 0.01 fails (STRICT — the legacy +1 € tolerance is gone)', () => {
    expect(isWithinReklamacjaCap(50.01, 50)).toBe(false);
  });

  it('cap + 1 fails (the exact legacy tolerance that was dropped)', () => {
    expect(isWithinReklamacjaCap(51, 50)).toBe(false);
  });

  it('compares at cent precision, immune to float dust', () => {
    expect(isWithinReklamacjaCap(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('a zero cap admits nothing positive', () => {
    expect(isWithinReklamacjaCap(0.01, 0)).toBe(false);
  });
});

describe('reklamacjaDeadline', () => {
  it('is statusChangedAt + 48 h', () => {
    expect(reklamacjaDeadline(DECIDED_AT)?.toISOString()).toBe(
      '2026-07-22T10:00:00.000Z',
    );
  });

  it('accepts an ISO string (the web passes the DTO value verbatim)', () => {
    expect(reklamacjaDeadline('2026-07-20T10:00:00.000Z')?.toISOString()).toBe(
      '2026-07-22T10:00:00.000Z',
    );
  });

  it('null stamp ⇒ no deadline', () => {
    expect(reklamacjaDeadline(null)).toBeNull();
  });

  it('malformed stamp ⇒ no deadline (never throws mid-render)', () => {
    expect(reklamacjaDeadline('not-a-date')).toBeNull();
  });
});

describe('getReklamacjaEligibility — happy paths', () => {
  it('rejected wniosek inside the window can be disputed for the full request', () => {
    const out = getReklamacjaEligibility(input(), NOW);
    expect(out).toEqual({
      canFile: true,
      maxAmount: 200,
      deadlineAt: new Date('2026-07-22T10:00:00.000Z'),
      blockedReason: null,
    });
  });

  it('accepted wniosek can be disputed for the unpaid remainder', () => {
    const out = getReklamacjaEligibility(
      input({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        amountApproved: 150,
      }),
      NOW,
    );
    expect(out.canFile).toBe(true);
    expect(out.maxAmount).toBe(50);
  });

  it('null statusChangedAt ⇒ no deadline, never expired (legacy rows)', () => {
    const out = getReklamacjaEligibility(
      input({ statusChangedAt: null }),
      new Date('2030-01-01T00:00:00.000Z'),
    );
    expect(out.deadlineAt).toBeNull();
    expect(out.canFile).toBe(true);
  });
});

describe('getReklamacjaEligibility — window boundary', () => {
  it('exactly 48 h after the decision is STILL allowed (inclusive)', () => {
    const at48h = new Date(
      DECIDED_AT.getTime() + REKLAMACJA_WINDOW_HOURS * HOUR,
    );
    const out = getReklamacjaEligibility(input(), at48h);
    expect(out.canFile).toBe(true);
    expect(out.blockedReason).toBeNull();
  });

  it('48 h + 1 min is expired', () => {
    const past = new Date(
      DECIDED_AT.getTime() + REKLAMACJA_WINDOW_HOURS * HOUR + MINUTE,
    );
    const out = getReklamacjaEligibility(input(), past);
    expect(out.canFile).toBe(false);
    expect(out.blockedReason).toBe('WINDOW_EXPIRED');
    // The ceiling is still reported — the UI renders it in the dead-end copy.
    expect(out.maxAmount).toBe(200);
    expect(out.deadlineAt).toEqual(new Date('2026-07-22T10:00:00.000Z'));
  });
});

describe('getReklamacjaEligibility — blocked reasons', () => {
  it('NA_WERYFIKACJI ⇒ NOT_DECIDED', () => {
    const out = getReklamacjaEligibility(
      input({ status: 'NA_WERYFIKACJI' }),
      NOW,
    );
    expect(out.blockedReason).toBe('NOT_DECIDED');
  });

  it('OCZEKUJE_NA_AUTORYZACJE ⇒ NOT_DECIDED', () => {
    const out = getReklamacjaEligibility(
      input({ status: 'OCZEKUJE_NA_AUTORYZACJE' }),
      NOW,
    );
    expect(out.blockedReason).toBe('NOT_DECIDED');
  });

  it('REKLAMACJA (pending) ⇒ NOT_DECIDED', () => {
    const out = getReklamacjaEligibility(input({ status: 'REKLAMACJA' }), NOW);
    expect(out.blockedReason).toBe('NOT_DECIDED');
  });

  it('already submitted ⇒ ALREADY_SUBMITTED (one-shot flag)', () => {
    const out = getReklamacjaEligibility(
      input({ reklamacjaSubmitted: true }),
      NOW,
    );
    expect(out.blockedReason).toBe('ALREADY_SUBMITTED');
  });

  it('paid == requested ⇒ NO_DELTA', () => {
    const out = getReklamacjaEligibility(
      input({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        amountApproved: 200,
      }),
      NOW,
    );
    expect(out.blockedReason).toBe('NO_DELTA');
    expect(out.maxAmount).toBe(0);
  });

  it('paid > requested ⇒ NO_DELTA with a negative ceiling', () => {
    const out = getReklamacjaEligibility(
      input({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        amountApproved: 260,
      }),
      NOW,
    );
    expect(out.blockedReason).toBe('NO_DELTA');
    expect(out.maxAmount).toBe(-60);
  });

  it('a 0.01 € remainder is NOT NO_DELTA (cent precision, not euro)', () => {
    const out = getReklamacjaEligibility(
      input({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        amountApproved: 199.99,
      }),
      NOW,
    );
    expect(out.canFile).toBe(true);
    expect(out.maxAmount).toBe(0.01);
  });
});

describe('getReklamacjaEligibility — precedence', () => {
  it('NOT_DECIDED beats ALREADY_SUBMITTED', () => {
    const out = getReklamacjaEligibility(
      input({ status: 'REKLAMACJA', reklamacjaSubmitted: true }),
      NOW,
    );
    expect(out.blockedReason).toBe('NOT_DECIDED');
  });

  it('ALREADY_SUBMITTED beats WINDOW_EXPIRED', () => {
    const out = getReklamacjaEligibility(
      input({ reklamacjaSubmitted: true }),
      new Date(DECIDED_AT.getTime() + 100 * HOUR),
    );
    expect(out.blockedReason).toBe('ALREADY_SUBMITTED');
  });

  it('WINDOW_EXPIRED beats NO_DELTA', () => {
    const out = getReklamacjaEligibility(
      input({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        amountApproved: 200,
      }),
      new Date(DECIDED_AT.getTime() + 100 * HOUR),
    );
    expect(out.blockedReason).toBe('WINDOW_EXPIRED');
  });

  it('NO_DELTA is last — everything else already passed', () => {
    const out = getReklamacjaEligibility(
      input({
        status: 'ZAAKCEPTOWANO',
        origPaymentEur: 200,
        amountApproved: 200,
        reklamacjaSubmitted: false,
      }),
      NOW,
    );
    expect(out.blockedReason).toBe('NO_DELTA');
  });
});
