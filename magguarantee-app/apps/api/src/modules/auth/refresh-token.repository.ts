import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * Row shape returned by the refresh-token repository. Mirrors the
 * `RefreshToken` Prisma model — only the columns the auth slice touches.
 */
export interface RefreshTokenRow {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

/**
 * Owns all `refresh_tokens` table access (api-agent guideline: repositories own
 * DB access; services orchestrate). Extracted from AuthService so the
 * password-management flows (admin reset, self-service reset/change) can revoke
 * a user's refresh tokens without reaching into `prisma.refreshToken` directly.
 *
 * The rotation transaction itself stays in AuthService.issuePair — it needs an
 * interactive `$transaction` spanning the claim+insert+chain link, which is
 * orchestration, not a single-statement repo call.
 */
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByHash(tokenHash: string): Promise<RefreshTokenRow | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    return (row as RefreshTokenRow | null) ?? null;
  }

  /** Used by the benign-race heal to walk the `replacedById` successor chain. */
  async findById(id: string): Promise<RefreshTokenRow | null> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { id },
    });
    return (row as RefreshTokenRow | null) ?? null;
  }

  async revokeById(id: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes every still-active refresh token for a user. Used on:
   *  - refresh-token reuse detection (theft),
   *  - self-service reset-password confirm,
   *  - admin reset-password (kill the victim's old sessions).
   *
   * Returns the number of rows revoked (0 when the user had no live sessions).
   */
  async revokeAllForUser(userId: string): Promise<number> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }

  /**
   * Hard-deletes refresh tokens nobody can use any more (token-cleanup cron,
   * 2026-08-14 logging audit, item 14):
   *  - expired before `cutoff`, or
   *  - revoked before `cutoff` AND already expired.
   *
   * The `expiresAt < now` guard on the revoked branch protects reuse detection:
   * a revoked token that has not yet expired is still a theft tripwire
   * (presenting it revokes the whole family), so it must survive until it could
   * no longer be replayed anyway. With the default 30-day refresh TTL the guard
   * never bites; it only matters for a longer `JWT_REFRESH_TTL`.
   *
   * `refresh_tokens` is not a soft-delete model, so this is a real DELETE. The
   * self-referencing `replacedById` FK is ON DELETE SET NULL. Returns the count.
   */
  async deleteStale(cutoff: Date, now: Date): Promise<number> {
    const res: unknown = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: cutoff } },
          { revokedAt: { lt: cutoff }, expiresAt: { lt: now } },
        ],
      },
    });
    if (res && typeof res === 'object' && 'count' in res) {
      const count = (res as { count: unknown }).count;
      if (typeof count === 'number') return count;
    }
    return 0;
  }

  /**
   * Revokes every active refresh token for a user EXCEPT one (by id). Used by
   * change-password, which mints a fresh pair for the current session and must
   * keep that one alive while killing all others.
   */
  async revokeAllForUserExcept(
    userId: string,
    keepId: string,
  ): Promise<number> {
    const res = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, id: { not: keepId } },
      data: { revokedAt: new Date() },
    });
    return res.count;
  }
}
