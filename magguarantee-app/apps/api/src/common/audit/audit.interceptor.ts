import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';
import { AUDIT_METADATA_KEY } from './audit.constants';
import type { AuditableRequest, AuditConfig } from './audit.decorator';
import { AuditService } from './audit.service';
import { scrubForAudit } from './audit.scrub';

/**
 * Reads `@Audit()` metadata and writes a row to `audit_log` after the
 * controller returns successfully.
 *
 * Behaviour, per docs/13-api-design.md#audit-на-уровне-api:
 *  - No `@Audit()` decorator → no-op.
 *  - Successful response (controller returns / observable next) → write.
 *  - Thrown exception → no write (the audit row would be misleading).
 *  - Audit write failures are logged but never propagated — the user's
 *    mutation already succeeded.
 *
 * Wired globally via `AuditModule` (APP_INTERCEPTOR).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const config = this.reflector.getAllAndOverride<AuditConfig | undefined>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!config) return next.handle();

    const req = context.switchToHttp().getRequest<
      AuditableRequest & {
        user?: AuthUser;
      }
    >();

    return next.handle().pipe(
      tap({
        next: (result: unknown) => {
          // fire-and-forget — never block the response on audit IO.
          void this._emit(config, req, result);
        },
        // on error: do nothing. The exception filter will format the
        // response; we deliberately don't write a row (per docs).
      }),
    );
  }

  // ── internals ───────────────────────────────────────────

  private async _emit(
    config: AuditConfig,
    req: AuditableRequest & { user?: AuthUser },
    result: unknown,
  ): Promise<void> {
    const targetKey = this._safeTargetKey(config, req, result);
    const ipAddress = this._extractIp(req);
    const userAgent = this._extractUserAgent(req);
    const after = config.omitResultBody ? undefined : scrubForAudit(result);

    await this.audit.write({
      userId: req.user?.sub ?? null,
      userRole: req.user?.role ?? null,
      action: config.action,
      targetType: config.targetType ?? null,
      targetKey: targetKey ?? null,
      // Wave 2 doesn't capture `before` — services that need to diff have to
      // load + pass it via a future `AuditAccumulator`. Today we leave it
      // explicitly null so the column is still populated coherently.
      before: undefined,
      after,
      reason: null,
      ipAddress,
      metadata: {
        method: req.method,
        route: req.url,
        userAgent,
      },
    });
  }

  private _safeTargetKey(
    config: AuditConfig,
    req: AuditableRequest,
    result: unknown,
  ): string | undefined {
    if (!config.targetKey) return undefined;
    try {
      const value = config.targetKey(req, result);
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    } catch {
      // Don't let a buggy targetKey extractor break the audit write.
      return undefined;
    }
  }

  private _extractIp(req: AuditableRequest): string | null {
    const xff = req.headers?.['x-forwarded-for'];
    const xffStr = Array.isArray(xff) ? xff[0] : xff;
    if (typeof xffStr === 'string' && xffStr.length > 0) {
      return xffStr.split(',')[0]?.trim() || null;
    }
    return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : null;
  }

  private _extractUserAgent(req: AuditableRequest): string | null {
    const ua = req.headers?.['user-agent'];
    return typeof ua === 'string' ? ua : null;
  }
}
