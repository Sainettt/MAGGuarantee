-- ─── Carrier wniosek-submission threshold: 9 → 10 ─────────
-- Product decision (2026-05): tighten the worked-days gate for carriers
-- from "round(hours/24, 2) > 9" to "round(hours/24, 2) >= 10". Same business
-- intent (a meaningful trip must have happened before a claim can be filed),
-- but the new semantic is `>= 10` integer days rather than `> 9` fractional.
--
-- `seed.ts` already carries the new value, but seeds are upsert-with-update
-- skipped on existing keys for some setups and, more importantly, staging +
-- prod databases already have the row sitting with value='9' from prior
-- seed runs. A targeted UPDATE is required to actually move them forward.
-- Description is rewritten so the new semantic is unambiguous to whoever
-- reads `app_config` next.
UPDATE "app_config"
   SET value = '10',
       description = 'Próg round(hours/24, 2) >= N — carrier może złożyć wniosek, gdy liczba przepracowanych dni (godziny/24, 2 miejsca) jest większa lub równa N.'
 WHERE key = 'carrier_rounded_days_override_threshold';

-- ─── Claim.amountRequested default: NOT NULL + DEFAULT 0 ──
-- Product decision (2026-05): carriers no longer enter the requested amount
-- by hand on the wniosek form — the api layer derives it server-side from
-- the km-calc output (`calc.paymentEur`). The column stays NOT NULL because
-- reklamacja logic (claims.service.ts:592) caps the reklamacja amount against
-- `claim.amountRequested`, and a NULL there would silently degrade to 0
-- through the `?? 0` fallback. Making it DEFAULT 0 gives us a safe insert
-- value if anything ever omits the field, without weakening the NOT NULL
-- contract that downstream code already relies on.
ALTER TABLE "claims" ALTER COLUMN "amountRequested" SET DEFAULT 0;
