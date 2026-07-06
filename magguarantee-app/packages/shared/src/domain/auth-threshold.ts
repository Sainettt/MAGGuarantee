// Pure-TS port of `getAuthThreshold` (`Code.gs:5967`).
//
// Lives in `@magguarantee/shared` so both the API (NestJS) and the web
// (Next.js) derive the same authorization threshold from one source — no drift
// between the server-side email hint and any client-side "poproś o autoryzację"
// nudge that a follow-up web change may add.
//
// SOFT HINT ONLY. This is NOT a gate. The legacy app surfaced the threshold in
// the Maksim authorization email ("Próg autoryzacji: 500 €") as context and
// never enforced it — porting exactly that intent. Nothing in the API or web
// blocks a decision on the basis of this value.

/**
 * The authorization threshold (in EUR) for a trip of the given length in
 * driven working days. If the dopłata exceeds this value, the pracownik is
 * expected to request Maksim's authorization — but this is informational
 * guidance, never a hard rule.
 *
 * Bands (pure port of `Code.gs:5967-5974`, keyed on `Math.floor(drivenDays)`):
 *
 * | driven working days | threshold (EUR) |
 * | ------------------- | --------------- |
 * | 61+                 | 1000            |
 * | 31–60               | 800             |
 * | 16–30               | 500             |
 * | 10–15               | 300             |
 * | < 10                | 300 (fallback)  |
 *
 * The legacy `< 10` case falls through to the same `return 300` as the 10–15
 * band — that is deliberate legacy behavior, preserved here. Likewise `NaN`,
 * negative, and non-finite inputs collapse to `0` via the legacy
 * `parseFloat(...) || 0` semantics and therefore also return 300.
 *
 * @param drivenDays Trip length in driven working days (`dni jezdne`). May be
 *   fractional — it is floored, matching the legacy `Math.floor` (e.g. `15.9`
 *   floors to `15` → 300; `16.0` → 500).
 * @returns Threshold in EUR: one of `300 | 500 | 800 | 1000`.
 */
export function getAuthThreshold(drivenDays: number): number {
  // Legacy `Math.floor(parseFloat(dniJezdne) || 0)`: the `|| 0` fallback fires
  // for NaN, 0, and any other falsy numeric, so those inputs floor to 0.
  const days = Math.floor(Number.isFinite(drivenDays) ? drivenDays || 0 : 0);
  if (days >= 61) return 1000;
  if (days >= 31) return 800;
  if (days >= 16) return 500;
  return 300; // 10–15, and the legacy fall-through for < 10.
}
