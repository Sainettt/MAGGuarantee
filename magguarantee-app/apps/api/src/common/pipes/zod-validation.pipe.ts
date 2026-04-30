import {
  BadRequestException,
  PipeTransform,
  ArgumentMetadata,
  Injectable,
} from '@nestjs/common';
import type { ZodSchema, ZodIssue } from 'zod';

/**
 * Thin Zod validation pipe used by every controller for body / query / params.
 *
 * On failure: throws BadRequestException carrying the Zod issues — the global
 * exception filter will format them per RFC 7807.
 *
 * We deliberately avoid the `nestjs-zod` package: a 30-line shim here keeps
 * deps minimal and the contract obvious.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: parsed.error.issues.map((issue: ZodIssue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }
    return parsed.data;
  }
}
