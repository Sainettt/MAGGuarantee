import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Global RFC 7807 problem-details filter.
 *
 * Per docs/13-api-design.md#формат-ответов every error response carries the
 * standard envelope:
 *
 *   { type, title, status, detail?, errors?, instance? }
 *
 * Today the api throws Nest's built-in HttpException family
 * (BadRequestException, NotFoundException, …) plus our own ZodValidationPipe
 * payloads. All of them flow through this filter so the wire shape stays
 * consistent.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const status = this._statusFor(exception);
    const title = this._titleFor(status);
    const detail = this._detailFor(exception);
    const errors = this._fieldErrorsFor(exception);
    const violations = this._violationsFor(exception);
    const extensions = this._extensionsFor(exception);
    const type = this._typeFor(status);

    if (status >= 500) {
      this.logger.error({
        msg: 'unhandled exception',
        path: req.url,
        method: req.method,
        error:
          exception instanceof Error ? exception.message : String(exception),
        // The wire body carries no `detail` for a non-HttpException (nothing
        // internal leaks to the client), so this line is the only record of
        // where the error came from — without the stack it is a mystery.
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    res.status(status).json({
      type,
      title,
      status,
      detail,
      errors,
      violations,
      extensions,
      instance: req.url,
    });
  }

  // ── helpers ──────────────────────────────────────────────

  private _statusFor(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private _titleFor(status: number): string {
    const titles: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      422: 'Unprocessable Entity',
      423: 'Locked',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      // Google SSO returns 503 when MAGSpace cannot be consulted (docs/24 №14).
      503: 'Service Unavailable',
    };
    return titles[status] ?? 'Error';
  }

  private _typeFor(status: number): string {
    const slugs: Record<number, string> = {
      400: '/problems/validation',
      401: '/problems/unauthorized',
      403: '/problems/forbidden',
      404: '/problems/not-found',
      409: '/problems/conflict',
      422: '/problems/business-rule',
      423: '/problems/locked',
      429: '/problems/rate-limit',
      500: '/problems/internal',
      503: '/problems/unavailable',
    };
    return slugs[status] ?? '/problems/error';
  }

  private _detailFor(exception: unknown): string | undefined {
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') return body;
      if (body && typeof body === 'object') {
        const obj = body as Record<string, unknown>;
        const message = obj.message ?? obj.detail ?? obj.error;
        if (typeof message === 'string') return message;
        if (Array.isArray(message)) {
          return message.map((m) => String(m)).join('; ');
        }
      }
      return exception.message;
    }
    return undefined;
  }

  /**
   * Multi-violation business-rule list — ClaimsService throws
   * `UnprocessableEntityException({ violations: string[] })` when the carrier
   * submit form has ≥1 problems and we want the UI to display them all in
   * one banner instead of forcing N round-trips.
   */
  private _violationsFor(exception: unknown): string[] | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const body = exception.getResponse();
    if (!body || typeof body !== 'object') return undefined;
    const v = (body as Record<string, unknown>).violations;
    if (!Array.isArray(v)) return undefined;
    const out = v.filter((x): x is string => typeof x === 'string');
    return out.length > 0 ? out : undefined;
  }

  /**
   * Lift the optional `extensions` bag from a 422 problem-details payload
   * into the wire envelope. ClaimsService uses this today to surface a
   * machine-readable `nextAllowedAt` ISO timestamp on the vehicle-cooldown
   * 422 so the carrier UI can render a "available from <date>" CTA without
   * re-parsing the localised message.
   *
   * The bag is opaque to the filter — any structured value the service
   * stuffs in there round-trips to the client unchanged.
   */
  private _extensionsFor(
    exception: unknown,
  ): Record<string, unknown> | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const body = exception.getResponse();
    if (!body || typeof body !== 'object') return undefined;
    const ext = (body as Record<string, unknown>).extensions;
    if (!ext || typeof ext !== 'object' || Array.isArray(ext)) return undefined;
    const obj = ext as Record<string, unknown>;
    return Object.keys(obj).length > 0 ? obj : undefined;
  }

  /**
   * Extract per-field errors (matches `ZodValidationPipe`'s payload shape:
   * `{ issues: [{ path, message, code }] }`).
   */
  private _fieldErrorsFor(
    exception: unknown,
  ): Record<string, string> | undefined {
    if (!(exception instanceof HttpException)) return undefined;
    const body = exception.getResponse();
    if (!body || typeof body !== 'object') return undefined;
    const issues = (body as Record<string, unknown>).issues;
    if (!Array.isArray(issues)) return undefined;
    const out: Record<string, string> = {};
    for (const i of issues) {
      const issue = i as { path?: string; message?: string };
      const path = issue.path ?? '_';
      const msg = issue.message ?? 'invalid';
      // Last writer wins for duplicate paths — fine for the wire envelope.
      out[path] = msg;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
}
