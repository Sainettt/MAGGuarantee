import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard for the /auth/refresh endpoint. Validates the refresh JWT signature
 * (using JWT_REFRESH_SECRET) and attaches `{ sub, jti, rawToken }` to
 * `req.user`. The service then matches the SHA-256 of `rawToken` against
 * the refresh_tokens table to enforce rotation + theft detection.
 */
@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}
