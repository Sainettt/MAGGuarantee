import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { Strategy, type JwtFromRequestFunction } from 'passport-jwt';

import type { Env } from '../../../config/env.schema';
import { COOKIE_REFRESH } from '../auth.constants';

export interface RefreshPayload {
  sub: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export interface RefreshRequestData extends RefreshPayload {
  rawToken: string;
}

/**
 * Refresh tokens are extracted from the `mt_refresh` HttpOnly cookie only —
 * the refresh endpoint is NOT meant to accept a header-borne refresh JWT
 * (per docs/15-auth-strategy.md#access-vs-refresh, refresh lives in the
 * cookie exclusively). The strategy passes the raw token forward via
 * `passReqToCallback` so the service can SHA-256 it for DB lookup.
 */
const extractFromCookie: JwtFromRequestFunction = (req) => {
  const cookies = (req as Request & { cookies?: Record<string, string> })
    .cookies;
  return cookies?.[COOKIE_REFRESH] ?? null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: extractFromCookie,
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: RefreshPayload): RefreshRequestData {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const rawToken = cookies?.[COOKIE_REFRESH] ?? '';
    return { ...payload, rawToken };
  }
}
