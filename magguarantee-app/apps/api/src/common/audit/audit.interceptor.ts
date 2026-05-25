import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defaultIfEmpty, firstValueFrom, from, type Observable } from 'rxjs';

import type { Prisma } from '@magguarantee/database';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';
import { AuditWriter } from '../../modules/audit/audit.service';
import type {
  AuditActor,
  AuditEntryInput,
} from '../../modules/audit/audit.types';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { AuditContext } from './audit-context';
import { AUDIT_METADATA_KEY } from './audit.constants';
import type { AuditableRequest, AuditConfig } from './audit.decorator';
import { scrubForAudit } from './audit.scrub';

/**
 * Reads `@Audit()` metadata and writes a row to `audit_log` in the SAME
 * Prisma transaction as the controller's mutation.
 *
 * Behaviour, per docs/13-api-design.md#audit-на-уровне-api + pre-Phase-4.4
 * decision (atomic audit invariant):
 *  - No `@Audit()` decorator → no-op (handler runs outside any transaction).
 *  - With `@Audit()`:
 *      1. Open `prisma.$transaction`.
 *      2. Inside the tx callback, open `AuditContext.run({tx, actor, ip})`.
 *      3. Inside the context, await the controller handler — anything it does
 *         through `PrismaService.tx` enrolls into the same transaction.
 *      4. After the handler resolves successfully, write the audit row using
 *         `AuditWriter.log(...)` (which also picks up the ambient tx).
 *      5. Commit — both rows persist atomically.
 *  - Handler throws → transaction rolls back, audit row is never written.
 *    Exception propagates to the global filter unchanged.
 *  - `AuditWriter.log` throws (DB down, JSON too big, etc.) → transaction
 *    rolls back too, the user's mutation is undone, and a 500 is surfaced.
 *    This is intentional: losing the mutation is preferable to silently
 *    losing the audit trail (docs/04-data-model.md treats audit as
 *    non-optional for verification flows).
 *
 * Wired globally via `AuditModule` (APP_INTERCEPTOR).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditWriter: AuditWriter,
    private readonly prisma: PrismaService,
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

    return from(this._runWithAudit(config, req, next));
  }

  // ── internals ───────────────────────────────────────────

  /**
   * Open a Prisma transaction, run the handler inside an `AuditContext`,
   * write the audit row on success, and let any thrown error roll the whole
   * thing back. Returns the handler's result on success so the rxjs adapter
   * can forward it to the HTTP layer.
   */
  private async _runWithAudit(
    config: AuditConfig,
    req: AuditableRequest & { user?: AuthUser },
    next: CallHandler,
  ): Promise<unknown> {
    const actor = this._resolveActor(req);
    const ipAddress = this._extractIp(req);

    return this.prisma.$transaction(async (tx) => {
      return AuditContext.run(
        {
          tx: tx as unknown as Prisma.TransactionClient,
          actor,
          ipAddress,
        },
        async () => {
          // Convert the Observable returned by the next handler into a
          // Promise so we can await its completion inside the transaction.
          // `firstValueFrom` extracts the first emitted value; `defaultIfEmpty`
          // gives a clean `undefined` for void controllers (HttpCode 204)
          // instead of `firstValueFrom`'s default EmptyError.
          const result = await firstValueFrom(
            next.handle().pipe(defaultIfEmpty(undefined as unknown)),
          );

          await this._writeAuditRow({
            config,
            req,
            result,
            actor,
            ipAddress,
            tx: tx as unknown as Prisma.TransactionClient,
          });

          return result;
        },
      );
    });
  }

  private async _writeAuditRow(args: {
    config: AuditConfig;
    req: AuditableRequest;
    result: unknown;
    actor: AuditActor;
    ipAddress: string | null;
    tx: Prisma.TransactionClient;
  }): Promise<void> {
    const { config, req, result, actor, tx } = args;
    const targetKey = this._safeTargetKey(config, req, result);
    const userAgent = this._extractUserAgent(req);
    const after = config.omitResultBody ? undefined : scrubForAudit(result);

    const entry: AuditEntryInput = {
      action: config.action,
      targetType: config.targetType,
      targetKey: targetKey,
      // `before` is opt-in: services that diff stash a pre-mutation snapshot
      // via `AuditContext.setBefore(...)` and the interceptor reads it on
      // commit. Routes that don't bother (pure creates, status setters) leave
      // it undefined → the column stays NULL.
      before: AuditContext.current()?.before,
      after,
      actor,
      metadata: {
        method: req.method,
        route: req.url,
        userAgent,
      },
      tx,
    };

    await this.auditWriter.log(entry);
  }

  /**
   * Map the request's authenticated `user` to the AuditWriter's actor shape.
   * Falls back to `system` only when there's no user at all — the writer
   * enforces the `system.` action prefix in that case, which is fine because
   * `@Audit()`-tagged routes are always behind `JwtAuthGuard` in practice.
   * Unauthenticated requests with `@Audit()` are a misconfiguration; the
   * actor `'system'` path keeps the writer from crashing while still
   * surfacing the issue in the action prefix check.
   */
  private _resolveActor(
    req: AuditableRequest & { user?: AuthUser },
  ): AuditActor {
    if (req.user) {
      const ipAddress = this._extractIp(req);
      return ipAddress
        ? {
            userId: req.user.sub,
            userRole: req.user.role,
            ipAddress,
          }
        : {
            userId: req.user.sub,
            userRole: req.user.role,
          };
    }
    return 'system';
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
      // Don't let a buggy targetKey extractor break the audit write — the
      // row still goes in, just with a NULL targetKey.
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

