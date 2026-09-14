import { CancelledError } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { ApiResponseError } from '@/lib/api/client';
import { classifyApiError } from '@/lib/api/errors';

import {
  SUPPRESS_GLOBAL_ERROR,
  globalErrorToast,
  shouldToastMutationError,
  shouldToastQueryError,
} from './globalErrors';

const networkError = new TypeError('Failed to fetch');
const http = (status: number) => new ApiResponseError(status, `HTTP ${status}`);

describe('classifyApiError', () => {
  it.each([
    [http(401), 'unauthorized'],
    [http(403), 'forbidden'],
    [http(404), 'notFound'],
    [http(409), 'client'],
    [http(422), 'client'],
    [http(429), 'rateLimited'],
    [http(500), 'server'],
    [http(503), 'server'],
    [networkError, 'network'],
    [new Error('boom'), 'unknown'],
    ['string', 'unknown'],
  ])('%s → %s', (err, kind) => {
    expect(classifyApiError(err)).toBe(kind);
  });
});

describe('shouldToastQueryError', () => {
  it('toasts network / 5xx / 403 failures', () => {
    expect(shouldToastQueryError(networkError, {})).toBe(true);
    expect(shouldToastQueryError(http(500), {})).toBe(true);
    expect(shouldToastQueryError(http(403), {})).toBe(true);
  });

  it('never toasts 401 (auth refresh flow owns it)', () => {
    expect(shouldToastQueryError(http(401), {})).toBe(false);
  });

  it('never toasts cancellations', () => {
    expect(shouldToastQueryError(new CancelledError(), {})).toBe(false);
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(shouldToastQueryError(abort, {})).toBe(false);
  });

  it('respects meta.suppressGlobalError', () => {
    expect(
      shouldToastQueryError(http(422), { meta: SUPPRESS_GLOBAL_ERROR }),
    ).toBe(false);
  });
});

describe('shouldToastMutationError', () => {
  it('toasts a mutation with no local error handling', () => {
    expect(shouldToastMutationError(http(500), { options: {} })).toBe(true);
  });

  it('skips a mutation that owns a hook-level onError', () => {
    expect(
      shouldToastMutationError(http(500), { options: { onError: () => {} } }),
    ).toBe(false);
  });

  it('skips a mutation tagged with SUPPRESS_GLOBAL_ERROR', () => {
    expect(
      shouldToastMutationError(http(500), {
        meta: SUPPRESS_GLOBAL_ERROR,
        options: {},
      }),
    ).toBe(false);
  });

  it('never toasts 401', () => {
    expect(shouldToastMutationError(http(401), { options: {} })).toBe(false);
  });
});

describe('globalErrorToast', () => {
  it('dedupes by scope + kind', () => {
    const a = globalErrorToast('query', networkError);
    const b = globalErrorToast('query', new TypeError('NetworkError'));
    expect(a.id).toBe(b.id);
    expect(a.messageKey).toBe('errors.toast.query.network');
  });

  it('keeps query and mutation toasts apart', () => {
    expect(globalErrorToast('query', http(500)).id).not.toBe(
      globalErrorToast('mutation', http(500)).id,
    );
  });

  it('maps 4xx client errors to the generic copy', () => {
    expect(globalErrorToast('mutation', http(409)).messageKey).toBe(
      'errors.toast.mutation.generic',
    );
  });
});
