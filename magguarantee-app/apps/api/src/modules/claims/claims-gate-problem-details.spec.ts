// Verifies the Maksim authorization-gate 422s surface their machine code on the
// WIRE via the global RFC-7807 filter — the exact JSON path the web reads is
// `body.extensions.code`.
//
// `_assertMaksimGateCleared` (and the upload guard) throw
// `UnprocessableEntityException({ code, message, extensions: { code } })`. The
// `ProblemDetailsFilter` only forwards `detail`/`errors`/`violations`/
// `extensions` — a top-level `code` alone is dropped. These tests run the REAL
// filter over the REAL exception to prove `extensions.code` round-trips.

import { UnprocessableEntityException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ProblemDetailsFilter } from '../../common/errors/problem-details.filter';

interface CapturedResponse {
  statusCode: number;
  body: Record<string, unknown>;
}

/** Minimal ArgumentsHost that captures the JSON the filter writes. */
function makeHost(url = '/api/v1/claims/GWA%2F001%2F04%2F26'): {
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
  const req = { url, method: 'PATCH' } as unknown as Request;
  const host = {
    switchToHttp: () => ({
      getResponse: <T>() => res as unknown as T,
      getRequest: <T>() => req as unknown as T,
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('Maksim gate 422 — machine code on the RFC-7807 wire', () => {
  const filter = new ProblemDetailsFilter();

  it('CLAIM_AUTHORIZATION_REQUIRED surfaces at body.extensions.code', () => {
    // Same shape `_assertMaksimGateCleared` throws.
    const exception = new UnprocessableEntityException({
      code: 'CLAIM_AUTHORIZATION_REQUIRED',
      message: 'Wgraj potwierdzenie autoryzacji od Maksima, aby podjąć decyzję.',
      extensions: { code: 'CLAIM_AUTHORIZATION_REQUIRED' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    // The exact JSON path the web keys on.
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('CLAIM_AUTHORIZATION_REQUIRED');
    // Human-readable detail still travels for the banner text.
    expect(captured.body.detail).toBe(
      'Wgraj potwierdzenie autoryzacji od Maksima, aby podjąć decyzję.',
    );
  });

  it('CLAIM_AUTHORIZATION_NOT_APPLICABLE (upload guard sibling) also surfaces at body.extensions.code', () => {
    const exception = new UnprocessableEntityException({
      code: 'CLAIM_AUTHORIZATION_NOT_APPLICABLE',
      message:
        'Potwierdzenie autoryzacji można wgrać tylko dla zweryfikowanego wniosku wymagającego autoryzacji.',
      extensions: { code: 'CLAIM_AUTHORIZATION_NOT_APPLICABLE' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('CLAIM_AUTHORIZATION_NOT_APPLICABLE');
  });

  it('CLAIM_DELEGATION_IN_TRANSIT (in-transit gate) surfaces at body.extensions.code', () => {
    // Same shape `_assertDelegationReturned` throws.
    const exception = new UnprocessableEntityException({
      code: 'CLAIM_DELEGATION_IN_TRANSIT',
      message:
        'Nie można podjąć akcji — wyjazd jest jeszcze w trasie. Poczekaj na zjazd auta.',
      extensions: { code: 'CLAIM_DELEGATION_IN_TRANSIT' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    // The exact JSON path the web stale-state handler keys on.
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('CLAIM_DELEGATION_IN_TRANSIT');
    // Human-readable detail still travels for the banner text.
    expect(captured.body.detail).toBe(
      'Nie można podjąć akcji — wyjazd jest jeszcze w trasie. Poczekaj na zjazd auta.',
    );
  });
});
