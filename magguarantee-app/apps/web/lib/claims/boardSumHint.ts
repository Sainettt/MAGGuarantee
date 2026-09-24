// The «Wg tablicy przebiegów: N km» + «Zastosuj» hint under the verifier's km
// input in ClaimModal.
//
// Source: `boardSumKm` of the MAIN live preview (`POST /claims/:nrZgl/preview`)
// — the staff-only Σ `drove` km on the weryfikator's daily-km board over the
// preview body's working `[dateStart, dateEnd]`, i.e. the period as the
// verifier is editing it right now. It does NOT depend on the `mileage` the
// body carries, so applying it («Zastosuj» → `setValue('mileage')`) re-runs the
// preview without moving the hint (no feedback loop).
//
// Replaces a second preview sent WITHOUT `mileage`: for an existing claim the
// server answers that with the carrier's persisted mileage, not the board, so
// the hint went stale as soon as the weryfikator filled a day.
//
// Pure, framework-free, unit-tested (`boardSumHint.test.ts`).

import type { PreviewClaimResponse } from '@magguarantee/shared';

/**
 * The km to offer, or `undefined` to hide the hint:
 *  - hidden where the km input is not editable (`factsEditable === false`) —
 *    the hint exists only to feed that input;
 *  - hidden while there is no preview yet, and when the server says there is
 *    no board figure (`null`: no vehicle, missing / invalid date, board
 *    unavailable) or the key is absent (non-staff caller);
 *  - a real `0` is a real board sum and IS offered («0 km»).
 */
export function boardSumHintKm(
  preview: Pick<PreviewClaimResponse, 'boardSumKm'> | null | undefined,
  factsEditable: boolean,
): number | undefined {
  if (!factsEditable) return undefined;
  const km = preview?.boardSumKm;
  return typeof km === 'number' && Number.isFinite(km) ? km : undefined;
}
