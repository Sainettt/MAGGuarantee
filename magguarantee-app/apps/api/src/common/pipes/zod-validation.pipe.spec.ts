// The pipe answers shape errors with 400 (docs/13 «Формат ответов»), and a
// business-rule refine — a `custom` issue carrying `params.code`, the first
// being the docs/28 `(role, lider)` pair — with 422 + `extensions.code`, the
// same wire answer a service gives for the rule on a merged row.

import {
  BadRequestException,
  HttpException,
  UnprocessableEntityException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import {
  CreateUserRequestSchema,
  USER_LIDER_REQUIRES_LIDER_ROLE,
  UserFiltersSchema,
} from '@magguarantee/shared';

import { ProblemDetailsFilter } from '../errors/problem-details.filter';
import { ZodValidationPipe } from './zod-validation.pipe';

const BODY = { type: 'body' } as const;

function thrown(fn: () => unknown): HttpException {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpException) return err;
    throw err;
  }
  throw new Error('expected the pipe to throw');
}

/** Runs an exception through the global filter and returns the wire body. */
function wireBody(exception: HttpException): { status: number; body: Record<string, unknown> } {
  const out = { status: 0, body: {} as Record<string, unknown> };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      out.body = payload;
      return this;
    },
  } as unknown as Response;
  const req = { url: '/api/v1/users', method: 'POST', ip: '127.0.0.1' } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getResponse: <T>() => res as unknown as T,
      getRequest: <T>() => req as unknown as T,
    }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(exception, host);
  return out;
}

const USER = { login: 'jan.k', email: 'jan.k@magtrans.eu', name: 'Jan K' };

describe('ZodValidationPipe', () => {
  it('returns the parsed value', () => {
    const pipe = new ZodValidationPipe(CreateUserRequestSchema);
    expect(pipe.transform({ ...USER, role: 'planista', lider: true }, BODY)).toMatchObject({
      role: 'planista',
      lider: true,
    });
  });

  it('returns the OUTPUT of a transforming schema (strict query boolean)', () => {
    const pipe = new ZodValidationPipe(UserFiltersSchema);
    expect(pipe.transform({ lider: 'false' }, { type: 'query' })).toEqual({ lider: false, limit: 50 });
  });

  it('answers a shape error with 400 and the issues', () => {
    const pipe = new ZodValidationPipe(CreateUserRequestSchema);
    const err = thrown(() => pipe.transform({ ...USER, role: 'nobody' }, BODY));

    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({
      message: 'Validation failed',
      issues: [expect.objectContaining({ path: 'role' })],
    });
  });

  it('answers a coded business-rule refine with 422 + extensions.code', () => {
    const pipe = new ZodValidationPipe(CreateUserRequestSchema);
    const err = thrown(() => pipe.transform({ ...USER, role: 'weryfikator', lider: true }, BODY));

    expect(err).toBeInstanceOf(UnprocessableEntityException);
    const { status, body } = wireBody(err);
    expect(status).toBe(422);
    expect(body).toMatchObject({
      type: '/problems/business-rule',
      status: 422,
      extensions: { code: USER_LIDER_REQUIRES_LIDER_ROLE },
      // The field error survives too, for a form to attach to the checkbox.
      errors: { lider: expect.any(String) },
    });
    expect(typeof body.detail).toBe('string');
  });

  it('keeps 400 when a shape error travels with the business rule', () => {
    // `.strict()` makes an unknown key a "dirty" (not aborted) result, so the
    // refine still runs and both issues are reported — the shape one wins.
    const pipe = new ZodValidationPipe(CreateUserRequestSchema);
    const err = thrown(() =>
      pipe.transform({ ...USER, role: 'weryfikator', lider: true, stray: 1 }, BODY),
    );

    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('keeps 400 for a custom issue without a code — plain refines are still validation', () => {
    const schema = z.object({ a: z.number() }).refine((v) => v.a > 0, { message: 'positive' });
    const err = thrown(() => new ZodValidationPipe(schema).transform({ a: -1 }, BODY));

    expect(err).toBeInstanceOf(BadRequestException);
  });
});
