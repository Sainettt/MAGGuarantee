// Niedojazd (km shortfall) readout under the dopłata field in ClaimModal —
// docs/14 §16.5.10.
//
// Two rules make the readout trustworthy:
//  1. ONE source. Every number of the readout comes from the SAME object the
//     dopłata field takes its amount from (`selectAmountSource`): the stored
//     claim for a decided mixed period (§16.5.9 p.1), otherwise the live
//     preview with a fallback to the claim. So «niedojazd × stawka» always
//     matches the amount right above it — before the preview lands, while it
//     refetches (placeholderData) and on error the readout follows the field.
//  2. NO negative number, ever. A negative `kmDifference` (the vehicle drove
//     more than guaranteed) is rendered as «o N km więcej», with |N|.
//
// States (by the source object):
//   kmGuaranteed === 0                    → nothing (the table's EmptyState
//                                           already explains it, §16.5.4)
//   isCompensationDue(kmDifference) (>0)  → `line` + `formula`
//   kmDifference === 0                    → `metEqual`
//   kmDifference < 0                      → `metOver` with |kmDifference|
//
// `scope` = 'board' when the SOURCE's breakdown says `mileageSource: 'board'`
// (mixed period — driven = the board total of the guaranteed months), else
// 'declared' (driven = the «Przebieg» after the pracownik's corrections).
//
// Numbers are pre-formatted strings (ICU gets them verbatim): km with up to 2
// decimals (`mileageEffective` can carry cents — `formatInt` would visibly
// disagree with the amount), the rate with 2–4 decimals (the effective rate of
// a multi-month period need not be round). `pl-PL` in every locale, like the
// breakdown table next to it.
//
// Pure, framework-free, unit-tested (`shortfall.test.ts`).

import {
  isCompensationDue,
  type ClaimStatus,
  type KmCalcBreakdown,
} from '@magguarantee/shared';

import { isBoardSettled } from './breakdownGuarantee';

/** The fields the dopłata field and the readout read — on ClaimDto and preview alike. */
export interface AmountSource {
  kmGuaranteed: number;
  kmDifference: number;
  ratePerKmEffective: number;
  paymentEur: number;
  breakdown?: Pick<KmCalcBreakdown, 'mileageSource'> | null;
}

/**
 * A DECIDED mixed period shows what was decided, not the live board: the
 * preview re-prices it on the board as it stands now, which drifts from the
 * decided dopłata once the weryfikator edits a day (§16.5.9 p.1). Exactly
 * mixed (`claim.breakdown.mileageSource === 'board'`) + ZAAKCEPTOWANO /
 * ODRZUCONO.
 */
export function showsStoredAmount(claim: {
  status: ClaimStatus;
  breakdown?: Pick<KmCalcBreakdown, 'mileageSource'> | null;
}): boolean {
  return (
    isBoardSettled(claim.breakdown) &&
    (claim.status === 'ZAAKCEPTOWANO' || claim.status === 'ODRZUCONO')
  );
}

/**
 * The ONE object the dopłata field and the niedojazd readout both read: the
 * stored claim for a decided mixed period, otherwise the live preview once it
 * exists, else the claim.
 */
export function selectAmountSource<
  C extends AmountSource & { status: ClaimStatus },
  P extends AmountSource,
>(claim: C, preview: P | null | undefined): C | P {
  if (showsStoredAmount(claim)) return claim;
  return preview ?? claim;
}

export type ShortfallScope = 'board' | 'declared';

/** What to render. All numbers are pre-formatted, never negative. */
export type ShortfallView =
  | { kind: 'none' }
  | {
      kind: 'shortfall';
      scope: ShortfallScope;
      /** Niedojazd — `kmDifference`. */
      km: string;
      guaranteed: string;
      /** `kmGuaranteed − kmDifference` = `mileageEffective`. */
      driven: string;
      rate: string;
    }
  | { kind: 'metEqual'; scope: ShortfallScope; guaranteed: string }
  | {
      kind: 'metOver';
      scope: ShortfallScope;
      /** Overshoot — `|kmDifference|`. */
      km: string;
      guaranteed: string;
      driven: string;
    };

const KM_FORMAT = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const RATE_FORMAT = new Intl.NumberFormat('pl-PL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** Up to 2 decimals — also absorbs the float noise of `kmGuaranteed − kmDifference`. */
export function formatShortfallKm(km: number): string {
  return KM_FORMAT.format(km);
}

/** 2–4 decimals: `0,50`, `0,4875`. */
export function formatShortfallRate(rate: number): string {
  return RATE_FORMAT.format(rate);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function shortfallView(src: AmountSource): ShortfallView {
  const { kmGuaranteed, kmDifference, ratePerKmEffective } = src;
  // Runtime guard: the client does not re-parse API responses.
  if (!isFiniteNumber(kmGuaranteed) || !isFiniteNumber(kmDifference)) {
    return { kind: 'none' };
  }
  // No guarantee anywhere in the period — one explanation per fact.
  if (kmGuaranteed === 0) return { kind: 'none' };

  const scope: ShortfallScope = isBoardSettled(src.breakdown)
    ? 'board'
    : 'declared';
  const guaranteed = formatShortfallKm(kmGuaranteed);
  const driven = formatShortfallKm(kmGuaranteed - kmDifference);

  if (isCompensationDue(kmDifference)) {
    return {
      kind: 'shortfall',
      scope,
      km: formatShortfallKm(kmDifference),
      guaranteed,
      driven,
      rate: formatShortfallRate(
        isFiniteNumber(ratePerKmEffective) ? ratePerKmEffective : 0,
      ),
    };
  }
  if (kmDifference === 0) return { kind: 'metEqual', scope, guaranteed };
  return {
    kind: 'metOver',
    scope,
    km: formatShortfallKm(Math.abs(kmDifference)),
    guaranteed,
    driven,
  };
}
