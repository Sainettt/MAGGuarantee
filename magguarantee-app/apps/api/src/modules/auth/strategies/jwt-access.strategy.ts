import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy, type JwtFromRequestFunction } from 'passport-jwt';

import type { Env } from '../../../config/env.schema';
import type { AuthUser } from '../decorators/current-user.decorator';
import { COOKIE_ACCESS } from '../auth.constants';
import { UsersService } from '../../users/users.service';

interface AccessPayload {
  sub: string;
  role: AuthUser['role'];
  mustChangePassword?: boolean;
  iat?: number;
  exp?: number;
}

/**
 * Custom extractor that prefers `Authorization: Bearer ...` and falls back
 * to the HttpOnly `mt_access` cookie. Per
 * docs/15-auth-strategy.md#cookie-vs-header — both are supported.
 */
const extractFromHeaderOrCookie: JwtFromRequestFunction = (req) => {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.[COOKIE_ACCESS] ?? null;
};

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: extractFromHeaderOrCookie,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
    });
  }

  async validate(payload: AccessPayload): Promise<AuthUser> {
    // Re-fetch the user so a deactivated/deleted account immediately loses
    // API access (the access token's 15-min TTL is not enough on its own).
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active || user.deletedAt) {
      throw new UnauthorizedException('User no longer active');
    }
    if (!user.email) {
      throw new UnauthorizedException('User has no email on file');
    }
    // Password-change cutoff: reject any access token minted BEFORE the user's
    // last password change (reset / forced change / admin reset). Refresh
    // tokens are already revoked on those flows, but a still-valid access token
    // (≤15 min) would otherwise outlive the password it was issued under. `iat`
    // is in seconds; compare at second granularity so the FRESH pair minted by
    // `changePassword` right after stamping `passwordChangedAt` is never
    // rejected by a sub-second skew.
    if (payload.iat !== undefined && user.passwordChangedAt) {
      const changedAtSec = Math.floor(user.passwordChangedAt.getTime() / 1000);
      if (changedAtSec > payload.iat) {
        throw new UnauthorizedException('Token invalidated by password change');
      }
    }
    return {
      sub: user.id,
      login: user.login,
      email: user.email,
      name: user.name ?? user.login,
      role: user.role,
      // Authoritative value comes from the DB row (the token claim may be a
      // stale snapshot after an admin reset). The web gate reads the token
      // claim for edge speed, but /auth/me + guards trust this DB-sourced flag.
      mustChangePassword: user.mustChangePassword,
      // Phase 11 — dispatch-team scope resolved from the DB (NOT the JWT
      // payload), same pattern as mustChangePassword. Null for non-dyspozytor
      // roles and for an unassigned dyspozytor → empty fleet/km scope.
      teamId: user.teamId,
    };
  }
}
