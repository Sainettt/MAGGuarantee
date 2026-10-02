import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import {
  BUGBOT_HANDOFF_RATE_LIMIT,
  BUGBOT_HANDOFF_THROTTLER_NAME,
} from './bugbot-handoff.constants';

/**
 * 10 requests / 60 s PER USER on `GET /integrations/bugbot/handoff`
 * (docs/13-api-design.md#rate-limiting).
 *
 * Why not `@Throttle({ default: { limit: 10 } })`: the global ThrottlerGuard is
 * the FIRST `APP_GUARD` (app.module.ts), runs before JwtAuthGuard and keys on
 * the IP. It reads the same `@Throttle` metadata, so the route would get
 * 10/min per IP — and the whole office behind one NAT would share it. So the
 * global guard keeps its 100/min/IP default here, and this guard adds the
 * per-user bucket on top. It is mounted with `@UseGuards` on the controller, so
 * it runs after every global guard: `req.user` is already set.
 *
 * Written against @nestjs/throttler 6.x: `canActivate` is overridden so the
 * limit and the tracker come from here only — never from `@Throttle` /
 * `ThrottlerModule` options — and `handleRequest` (6.x signature: a single
 * `ThrottlerRequest` object) does the counting, headers and the 429.
 */
@Injectable()
export class BugbotHandoffThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const { limit, ttl } = BUGBOT_HANDOFF_RATE_LIMIT;
    return this.handleRequest({
      context,
      limit,
      ttl,
      blockDuration: ttl,
      // `ignoreUserAgents` / `setHeaders` set explicitly so handleRequest never
      // falls back to the module-wide common options.
      throttler: {
        name: BUGBOT_HANDOFF_THROTTLER_NAME,
        limit,
        ttl,
        ignoreUserAgents: [],
        setHeaders: true,
      },
      getTracker: (req) => this.getTracker(req),
      generateKey: (ctx, tracker, name) => this.generateKey(ctx, tracker, name),
    });
  }

  /** Bucket key: the user id from the session. The IP plays no part. */
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const user = req.user as Pick<AuthUser, 'sub'> | undefined;
    if (!user?.sub) {
      // Only reachable if the route ever lost the global JwtAuthGuard. Refuse
      // rather than fall back to an IP bucket — or to one shared bucket.
      throw new UnauthorizedException();
    }
    return `user:${user.sub}`;
  }
}
