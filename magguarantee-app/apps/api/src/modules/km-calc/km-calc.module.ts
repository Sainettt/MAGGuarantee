import { Module } from '@nestjs/common';

import { KmCalcService } from './km-calc.service';

/**
 * Phase 3 — km-calc module per docs/17-migration-roadmap.md#phase-3.
 *
 * Thin Nest wrapper around the pure-TS engine in `@magguarantee/shared`
 * (`domain/km-calc.ts`). Loads the `WeeklyLimit` rows of the ISO weeks a
 * period touches + the `AppConfig` fallbacks from Postgres and delegates the
 * math to `calcKmGwarant` (limits per ISO week since 2026-10-29,
 * docs/01-overview.md §«Расчёт гарантии»).
 *
 * Exported so `ClaimsModule` can inject it directly — no controller of its
 * own (preview is exposed via `POST /claims/preview` per
 * docs/13-api-design.md#claims).
 */
@Module({
  providers: [KmCalcService],
  exports: [KmCalcService],
})
export class KmCalcModule {}
