// The 5xx log line is the only record of where an unhandled Error came from:
// for a non-HttpException the wire body deliberately carries no `detail`, so
// nothing internal leaks to the client. The stack therefore has to be in the
// log — without it the 2026-09-10 `/auth/google` 500 took a code read to place.

import { BadRequestException, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProblemDetailsFilter } from './problem-details.filter';

interface CapturedResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

function makeHost(): { host: ArgumentsHost; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 0, body: {} };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  const req = { url: '/api/v1/auth/google', method: 'POST' } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getResponse: <T>() => res as unknown as T,
      getRequest: <T>() => req as unknown as T,
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('ProblemDetailsFilter — 5xx logging', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('logs the stack of an unhandled Error but keeps the wire body opaque', () => {
    const err = new Error('audit.log: boom');
    const { host, captured } = makeHost();

    new ProblemDetailsFilter().catch(err, host);

    expect(captured.statusCode).toBe(500);
    expect(captured.body.detail).toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: 'unhandled exception',
        error: 'audit.log: boom',
        stack: err.stack,
      }),
    );
  });

  it('does not log a 4xx', () => {
    const { host } = makeHost();

    new ProblemDetailsFilter().catch(new BadRequestException('nope'), host);

    expect(errorSpy).not.toHaveBeenCalled();
  });
});
