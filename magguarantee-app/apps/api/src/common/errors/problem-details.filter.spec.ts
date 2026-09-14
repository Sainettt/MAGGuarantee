// The 5xx log line is the only record of where an unhandled Error came from:
// for a non-HttpException the wire body deliberately carries no `detail`, so
// nothing internal leaks to the client. The stack therefore has to be in the
// log — without it the 2026-09-10 `/auth/google` 500 took a code read to place.
//
// 401 / 403 / 429 are the security signal (2026-09-14 logging audit, item 4)
// and get a WARN line with who / from where / which route — never a body.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProblemDetailsFilter } from './problem-details.filter';

interface CapturedResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

function makeHost(reqOverrides: Record<string, unknown> = {}): {
  host: ArgumentsHost;
  captured: CapturedResponse;
} {
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
  const req = {
    url: '/api/v1/auth/google',
    method: 'POST',
    ip: '203.0.113.7',
    ...reqOverrides,
  } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getResponse: <T>() => res as unknown as T,
      getRequest: <T>() => req as unknown as T,
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('ProblemDetailsFilter — logging', () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
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

  it('adds userId, IP and the route template to the 5xx line', () => {
    const { host } = makeHost({
      url: '/api/v1/claims/GWA_1?debug=1',
      method: 'PATCH',
      route: { path: '/api/v1/claims/:nrZgl' },
      baseUrl: '',
      user: { sub: 'u-42', role: 'pracownik' },
    });

    new ProblemDetailsFilter().catch(new Error('db down'), host);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 500,
        method: 'PATCH',
        route: '/api/v1/claims/:nrZgl',
        userId: 'u-42',
        ip: '203.0.113.7',
      }),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    [new UnauthorizedException('Invalid token'), 401, 'request unauthorized'],
    [new ForbiddenException('Brak uprawnień dla tej roli'), 403, 'request forbidden'],
    [
      new HttpException('ThrottlerException: Too Many Requests', HttpStatus.TOO_MANY_REQUESTS),
      429,
      'request rate-limited',
    ],
  ])('WARNs a %s with who / from where / which route', (exception, status, msg) => {
    const { host, captured } = makeHost({
      url: '/api/v1/users?email=jan@magtrans.eu',
      method: 'GET',
      route: { path: '/api/v1/users' },
      baseUrl: '',
      user: status === 401 ? undefined : { sub: 'u-7', role: 'dyspozytor' },
      body: { password: 'hunter2' },
    });

    new ProblemDetailsFilter().catch(exception, host);

    expect(captured.statusCode).toBe(status);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith({
      msg,
      status,
      method: 'GET',
      route: '/api/v1/users',
      userId: status === 401 ? undefined : 'u-7',
      ip: '203.0.113.7',
    });
    const logged = JSON.stringify(warnSpy.mock.calls);
    expect(logged).not.toContain('hunter2');
    expect(logged).not.toContain('jan@magtrans.eu');
  });

  it('strips the query string when no route matched', () => {
    const { host } = makeHost({ url: '/api/v1/nope?nip=1234567890', method: 'GET' });

    new ProblemDetailsFilter().catch(new UnauthorizedException(), host);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ route: '/api/v1/nope' }),
    );
  });

  it.each([
    new BadRequestException('nope'),
    new NotFoundException(),
    new ConflictException(),
    new UnprocessableEntityException({ violations: ['x'] }),
  ])('does not log business 4xx (%s)', (exception) => {
    const { host } = makeHost();

    new ProblemDetailsFilter().catch(exception, host);

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
