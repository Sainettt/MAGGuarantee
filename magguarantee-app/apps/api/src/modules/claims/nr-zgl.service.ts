import { Injectable } from '@nestjs/common';

import type { TransactionLike } from './claims.repository';

/**
 * Atomic numbering for `nrZgl` per `Code.gs:6187-6215`.
 *
 * Format: `GWA/NNN/MM/RR` where:
 *  - `NNN` is a per-month sequential counter, zero-padded to 3 digits
 *  - `MM` is the 2-digit month
 *  - `RR` is the last two digits of the year
 *
 * Implementation: `claim_sequences` is keyed by `'YY-MM'` and bumped via
 * `upsert(... update: { increment: 1 })`, which Postgres serialises through
 * the unique key. The upsert is composed into the same Prisma `$transaction`
 * as the claim insert so a duplicate insert can never burn a number — if the
 * insert fails, the whole tx (including the counter bump) rolls back.
 *
 * Replaces the legacy "scan WNIOSEK sheet for max NNN, sleep, retry" loop in
 * `Code.gs:6195-6213`. The advisory lock + script lock combo is no longer
 * needed: Postgres' row-level lock on the unique `(yearMonth)` key gives us
 * the same exclusivity for free.
 */
@Injectable()
export class NrZglService {
  /**
   * Reserve the next nrZgl using the supplied tx client. The caller is
   * expected to be inside `prisma.$transaction(...)`.
   *
   * @param tx — transaction client that has access to `claimSequence`.
   * @param now — clock injection for tests; defaults to `new Date()`.
   */
  async nextWithin(tx: TransactionLike, now: Date = new Date()): Promise<string> {
    const month = now.getMonth() + 1; // 1..12
    const year = now.getFullYear();
    const mm = month < 10 ? `0${month}` : `${month}`;
    const rr = (year % 100).toString().padStart(2, '0');
    const yearMonth = `${rr}-${mm}`;

    const seq = await tx.claimSequence.upsert({
      where: { yearMonth },
      create: { yearMonth, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });

    return formatNrZgl(seq.lastNumber, mm, rr);
  }
}

/**
 * Pure formatter — exported for unit tests.
 *
 * `Code.gs:6213-6215` zero-pads `NNN` to 3 digits with branches; we use
 * `padStart` for clarity but the output string is identical for `n in
 * [1..999]`. For `n >= 1000` (one carrier filing >999 claims/month — never)
 * we let the natural digit count through rather than collide.
 */
export function formatNrZgl(n: number, mm: string, rr: string): string {
  const nnn = n < 1000 ? n.toString().padStart(3, '0') : n.toString();
  return `GWA/${nnn}/${mm}/${rr}`;
}
