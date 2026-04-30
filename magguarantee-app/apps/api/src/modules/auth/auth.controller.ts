import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

// In NODE_ENV=test we crank up the per-endpoint throttle so e2e specs that
// issue many sequential login attempts don't hit 429. Real values per
// docs/13-api-design.md#rate-limiting:
//   /auth/login        — 5 / min / IP
//   /auth/verify-code  — 10 / min / IP
//   /auth/resend-code  — 2 / min / IP
const TEST_BYPASS = process.env.NODE_ENV === 'test';
const RL = {
  login: { limit: TEST_BYPASS ? 1_000 : 5, ttl: 60_000 },
  verify: { limit: TEST_BYPASS ? 1_000 : 10, ttl: 60_000 },
  resend: { limit: TEST_BYPASS ? 1_000 : 2, ttl: 60_000 },
} as const;

import {
  LoginRequest,
  LoginResponse,
  ResendCodeRequest,
  ResendCodeResponse,
  UserDto,
  VerifyCodeRequest,
  VerifyCodeResponse,
  RefreshResponse,
} from '@magguarantee/shared';

import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AuthService, type TokenPair } from './auth.service';
import {
  COOKIE_ACCESS,
  COOKIE_REFRESH,
  REFRESH_COOKIE_PATH,
} from './auth.constants';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';
import { Public } from './decorators/public.decorator';
import { CurrentUser, type AuthUser } from './decorators/current-user.decorator';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import type { RefreshRequestData } from './strategies/jwt-refresh.strategy';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ── POST /auth/login ─────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RL.login })
  async login(
    @Body(new ZodValidationPipe(LoginRequest))
    body: LoginRequest,
  ): Promise<LoginResponse> {
    return this.auth.login(body.login, body.password);
  }

  // ── POST /auth/verify-code ───────────────────────────

  @Public()
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RL.verify })
  async verify(
    @Body(new ZodValidationPipe(VerifyCodeRequest))
    body: VerifyCodeRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<VerifyCodeResponse> {
    const { user, tokens } = await this.auth.verifyCode(
      body.sessionToken,
      body.code,
      this.requestContext(req),
    );
    this.setAuthCookies(res, tokens);
    return { user };
  }

  // ── POST /auth/resend-code ───────────────────────────

  @Public()
  @Post('resend-code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: RL.resend })
  async resend(
    @Body(new ZodValidationPipe(ResendCodeRequest))
    body: ResendCodeRequest,
  ): Promise<ResendCodeResponse> {
    return this.auth.resendCode(body.sessionToken);
  }

  // ── POST /auth/refresh ───────────────────────────────

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request & { user: RefreshRequestData },
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponse> {
    const { user, tokens } = await this.auth.refresh(
      req.user.sub,
      req.user.rawToken,
      this.requestContext(req),
    );
    this.setAuthCookies(res, tokens);
    return { user };
  }

  // ── POST /auth/logout ────────────────────────────────

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const raw = cookies?.[COOKIE_REFRESH];
    await this.auth.logout(raw);
    this.clearAuthCookies(res);
  }

  // ── GET /auth/me ─────────────────────────────────────

  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return {
      id: user.sub,
      login: user.login,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  // ── Helpers ──────────────────────────────────────────

  private setAuthCookies(res: Response, tokens: TokenPair): void {
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    const accessTtlMs = parseTtlMs(
      this.config.get('JWT_ACCESS_TTL', { infer: true }),
    );
    const refreshTtlMs = parseTtlMs(
      this.config.get('JWT_REFRESH_TTL', { infer: true }),
    );

    res.cookie(COOKIE_ACCESS, tokens.accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
      maxAge: accessTtlMs,
    });
    res.cookie(COOKIE_REFRESH, tokens.refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshTtlMs,
    });
  }

  private clearAuthCookies(res: Response): void {
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    res.clearCookie(COOKIE_ACCESS, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/',
    });
    res.clearCookie(COOKIE_REFRESH, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }

  private requestContext(req: Request): {
    ipAddress?: string;
    userAgent?: string;
  } {
    const xff = req.headers['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    const ipAddress =
      (xffStr ?? '').split(',')[0]?.trim() || req.ip || undefined;
    const ua = req.headers['user-agent'];
    return {
      ipAddress: ipAddress || undefined,
      userAgent: typeof ua === 'string' ? ua : undefined,
    };
  }
}

function parseTtlMs(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(ttl.trim());
  if (!match) return 0;
  const n = Number.parseInt(match[1] ?? '0', 10);
  const unit = match[2] ?? 'ms';
  const factor: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return n * (factor[unit] ?? 1);
}
