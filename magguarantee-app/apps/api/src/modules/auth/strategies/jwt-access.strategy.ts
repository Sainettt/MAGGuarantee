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
    return {
      sub: user.id,
      login: user.login,
      email: user.email,
      name: user.name ?? user.login,
      role: user.role,
    };
  }
}
