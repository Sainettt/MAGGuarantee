// Verifies the claim-gate 422s / 409s surface their machine code on the WIRE via
// the global RFC-7807 filter — the exact JSON path the web reads is
// `body.extensions.code`. Covers the Maksim authorization gate, the in-transit
// gate and (REWORK 2026-07-31) the reklamacja gates.
//
// `_assertMaksimGateCleared` (and the upload guard) throw
// `UnprocessableEntityException({ code, message, extensions: { code } })`. The
// `ProblemDetailsFilter` only forwards `detail`/`errors`/`violations`/
// `extensions` — a top-level `code` alone is dropped. These tests run the REAL
// filter over the REAL exception to prove `extensions.code` round-trips.

import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
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

describe('Claim gates — machine code on the RFC-7807 wire', () => {
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

  it('REKLAMACJA_CLAIM_NOT_DECIDED surfaces at body.extensions.code', () => {
    // Same shape `_assertReklamacjaEligible` throws.
    const exception = new UnprocessableEntityException({
      code: 'REKLAMACJA_CLAIM_NOT_DECIDED',
      message:
        'Reklamację można złożyć tylko dla wniosku zaakceptowanego lub odrzuconego.',
      extensions: { code: 'REKLAMACJA_CLAIM_NOT_DECIDED' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('REKLAMACJA_CLAIM_NOT_DECIDED');
  });

  it('REKLAMACJA_WINDOW_EXPIRED forwards the machine deadline alongside the code', () => {
    const exception = new UnprocessableEntityException({
      code: 'REKLAMACJA_WINDOW_EXPIRED',
      message:
        'Czas na złożenie reklamacji minął. Reklamację można złożyć maksymalnie 48 godzin od rozpatrzenia wniosku.',
      extensions: {
        code: 'REKLAMACJA_WINDOW_EXPIRED',
        deadlineAt: '2026-07-22T10:00:00.000Z',
      },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    const ext = captured.body.extensions as {
      code?: string;
      deadlineAt?: string;
    };
    expect(ext.code).toBe('REKLAMACJA_WINDOW_EXPIRED');
    expect(ext.deadlineAt).toBe('2026-07-22T10:00:00.000Z');
  });

  it('REKLAMACJA_NO_DELTA surfaces at body.extensions.code', () => {
    const exception = new UnprocessableEntityException({
      code: 'REKLAMACJA_NO_DELTA',
      message:
        'Brak kwoty do reklamacji — wypłacona kwota odpowiada kwocie wnioskowanej.',
      extensions: { code: 'REKLAMACJA_NO_DELTA' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('REKLAMACJA_NO_DELTA');
  });

  it('REKLAMACJA_AMOUNT_EXCEEDS_CAP forwards the ceiling in extensions', () => {
    const exception = new UnprocessableEntityException({
      code: 'REKLAMACJA_AMOUNT_EXCEEDS_CAP',
      message: 'Kwota reklamacji (50.01 €) przekracza maksimum (50.00 €).',
      extensions: { code: 'REKLAMACJA_AMOUNT_EXCEEDS_CAP', maxAmount: 50 },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    const ext = captured.body.extensions as {
      code?: string;
      maxAmount?: number;
    };
    expect(ext.code).toBe('REKLAMACJA_AMOUNT_EXCEEDS_CAP');
    expect(ext.maxAmount).toBe(50);
  });

  it('REKLAMACJA_NOT_PENDING (synthetic PATCH target guard) surfaces at body.extensions.code', () => {
    const exception = new UnprocessableEntityException({
      code: 'REKLAMACJA_NOT_PENDING',
      message: 'Ten wniosek nie ma reklamacji oczekującej na rozpatrzenie.',
      extensions: { code: 'REKLAMACJA_NOT_PENDING' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(422);
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('REKLAMACJA_NOT_PENDING');
  });

  it('REKLAMACJA_ALREADY_SUBMITTED is a 409 and still carries extensions.code', () => {
    // The one-shot conflict is the only reklamacja gate that is NOT a 422.
    const exception = new ConflictException({
      code: 'REKLAMACJA_ALREADY_SUBMITTED',
      message: 'Reklamacja została już złożona dla tego wniosku.',
      extensions: { code: 'REKLAMACJA_ALREADY_SUBMITTED' },
    });
    const { host, captured } = makeHost();

    filter.catch(exception, host);

    expect(captured.statusCode).toBe(409);
    expect(
      (captured.body.extensions as { code?: string } | undefined)?.code,
    ).toBe('REKLAMACJA_ALREADY_SUBMITTED');
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
