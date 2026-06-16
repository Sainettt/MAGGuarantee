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
