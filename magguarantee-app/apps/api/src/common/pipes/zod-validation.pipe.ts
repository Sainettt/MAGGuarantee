import {
  BadRequestException,
  PipeTransform,
  ArgumentMetadata,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ZodIssue, ZodType, ZodTypeDef } from 'zod';

/** One Zod issue as it goes on the wire (read back by the RFC 7807 filter as `errors`). */
interface WireIssue {
  path: string;
  message: string;
  code: string;
}

/**
 * Thin Zod validation pipe used by every controller for body / query / params.
 *
 * On failure: throws BadRequestException carrying the Zod issues — the global
 * exception filter will format them per RFC 7807.
 *
 * One exception: a shared schema may express a BUSINESS rule as a refine — the
 * `(role, lider)` pair of docs/28 is the first (`refineLiderPair`). Such an
 * issue is `code: 'custom'` and carries `params.code` (the machine code the web
 * reads from `extensions.code`). When EVERY issue is of that kind the body is
 * well-formed and merely breaks a rule, which docs/13 «Формат ответов» answers
 * with 422, not 400 — so the pipe throws `UnprocessableEntityException` with
 * `extensions.code`, exactly what a service would throw for the same rule on a
 * merged row. Any shape error in the mix keeps the plain 400.
 *
 * We deliberately avoid the `nestjs-zod` package: a 30-line shim here keeps
 * deps minimal and the contract obvious.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  // Input is `unknown`: the pipe parses raw request data, and a schema that
  // transforms (e.g. `'true' | 'false'` → boolean query params) has an input
  // type different from its output `T`.
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      const issues: WireIssue[] = parsed.error.issues.map((issue: ZodIssue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      }));
      const rule = businessRuleOf(parsed.error.issues);
      if (rule) {
        throw new UnprocessableEntityException({
          message: rule.message,
          extensions: { code: rule.code },
          issues,
        });
      }
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues,
      });
    }
    return parsed.data;
  }
}

/**
 * The first business-rule issue, provided ALL issues are business rules (a
 * `custom` issue with a string `params.code`); otherwise null.
 */
function businessRuleOf(issues: readonly ZodIssue[]): { code: string; message: string } | null {
  let first: { code: string; message: string } | null = null;
  for (const issue of issues) {
    if (issue.code !== 'custom') return null;
    const params: Record<string, unknown> | undefined = issue.params;
    const code = params?.code;
    if (typeof code !== 'string') return null;
    first ??= { code, message: issue.message };
  }
  return first;
}
