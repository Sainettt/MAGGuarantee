// Leak guard for the shared outbound-HTTP helper (2026-09-14 logging audit,
// item 2): upstream URLs carry NIPs, bank accounts, VAT ids and e-mails, and
// upstream bodies may echo them — neither may reach a log line or the
// client-facing error `detail`.

import { HttpException, Logger } from '@nestjs/common';

import {
  fetchJsonWithRetry,
  INTEGRATION_UPSTREAM_REJECTED,
  INTEGRATION_UPSTREAM_UNAVAILABLE,
  IntegrationUpstreamError,
} from './http-fetch';

const NIP = '1234567890';
const ACCOUNT = '12345678901234567890123456';
const URL_WITH_PII = `https://wl-api.mf.gov.pl/api/check/nip/${NIP}/bank-account/${ACCOUNT}?date=2026-09-14`;
const ECHOING_BODY = `{"message":"Nieprawidłowy NIP ${NIP} dla konta ${ACCOUNT}","stack":"at internal.java:42"}`;

describe('fetchJsonWithRetry', () => {
  const realFetch = global.fetch;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((cb: () => void) => {
        cb();
        return 0 as unknown as NodeJS.Timeout;
      }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function loggedText(): string {
    return JSON.stringify(warnSpy.mock.calls);
  }

  it('returns parsed JSON on 2xx', async () => {
    global.fetch = jest.fn(async () => new Response('{"ok":true}', { status: 200 })) as unknown as typeof fetch;

    await expect(fetchJsonWithRetry(URL_WITH_PII, { tag: 'whitelist' })).resolves.toEqual({ ok: true });
  });

  it('4xx: no retry, logs tag + host + status only, generic error without the upstream body', async () => {
    const fetchSpy = jest.fn(async () => new Response(ECHOING_BODY, { status: 400 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const err = await fetchJsonWithRetry(URL_WITH_PII, { tag: 'whitelist' }).catch((e: unknown) => e);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(IntegrationUpstreamError);
    expect(err).toBeInstanceOf(HttpException);
    const ex = err as IntegrationUpstreamError;
    expect(ex.getStatus()).toBe(400);
    expect(ex.upstreamStatus).toBe(400);
    expect(ex.getResponse()).toEqual({
      statusCode: 400,
      message: 'The external service rejected the request',
      extensions: { code: INTEGRATION_UPSTREAM_REJECTED },
    });
    const wire = JSON.stringify(ex.getResponse()) + ex.message;
    expect(wire).not.toContain(NIP);
    expect(wire).not.toContain('internal.java');

    expect(warnSpy).toHaveBeenCalledWith({
      msg: 'whitelist: upstream 4xx',
      tag: 'whitelist',
      host: 'wl-api.mf.gov.pl',
      status: 400,
    });
    expect(loggedText()).not.toContain(NIP);
    expect(loggedText()).not.toContain(ACCOUNT);
    expect(loggedText()).not.toContain('internal.java');
  });

  it('keeps a 404 status so callers can treat it as "not found"', async () => {
    global.fetch = jest.fn(async () => new Response('not here', { status: 404 })) as unknown as typeof fetch;

    const err = await fetchJsonWithRetry(URL_WITH_PII, { tag: 'magspace.lookup' }).catch((e: unknown) => e);

    expect((err as HttpException).getStatus()).toBe(404);
  });

  it('5xx: retries, then throws the upstream status with a generic message; URL never logged', async () => {
    const fetchSpy = jest.fn(async () => new Response(ECHOING_BODY, { status: 502 }));
    global.fetch = fetchSpy as unknown as typeof fetch;

    const err = await fetchJsonWithRetry(URL_WITH_PII, { tag: 'vies' }).catch((e: unknown) => e);

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const ex = err as IntegrationUpstreamError;
    expect(ex.getStatus()).toBe(502);
    expect(ex.getResponse()).toMatchObject({
      message: 'The external service is unavailable',
      extensions: { code: INTEGRATION_UPSTREAM_UNAVAILABLE },
    });
    expect(warnSpy).toHaveBeenCalledTimes(3);
    expect(loggedText()).not.toContain(NIP);
    expect(loggedText()).not.toContain('/api/check');
    expect(loggedText()).not.toContain('internal.java');
  });

  it('network failure: 503 after retries, logs error class + cause code, not the message', async () => {
    const netErr = Object.assign(new TypeError(`fetch failed for ${URL_WITH_PII}`), {
      cause: { code: 'ECONNREFUSED' },
    });
    const fetchSpy = jest.fn(async () => {
      throw netErr;
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const err = await fetchJsonWithRetry(URL_WITH_PII, { tag: 'whitelist', attempts: 2 }).catch(
      (e: unknown) => e,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const ex = err as IntegrationUpstreamError;
    expect(ex.getStatus()).toBe(503);
    expect(ex.upstreamStatus).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'TypeError', cause: 'ECONNREFUSED', host: 'wl-api.mf.gov.pl' }),
    );
    expect(loggedText()).not.toContain(NIP);
  });

  it('does not log the Authorization header', async () => {
    global.fetch = jest.fn(async () => new Response('', { status: 401 })) as unknown as typeof fetch;

    await fetchJsonWithRetry('http://magspace-api:3001/internal/v1/employees/lookup?email=jan%40magtrans.eu', {
      tag: 'magspace.lookup',
      headers: { Authorization: 'Bearer top-secret' },
      attempts: 1,
    }).catch(() => undefined);

    expect(loggedText()).not.toContain('top-secret');
    expect(loggedText()).not.toContain('jan');
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ host: 'magspace-api:3001' }));
  });
});
