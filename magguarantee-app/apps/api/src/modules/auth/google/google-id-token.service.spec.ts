// Unit tests for the Google `id_token` gate (docs/24 §A1).
//
// `OAuth2Client` is mocked wholesale: these tests are about OUR checks, not
// about Google's signature verification, and hitting the real JWKS endpoint
// would make the suite depend on the network.

import { ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../../config/env.schema';
import { GoogleIdTokenService, libraryErrorSummary } from './google-id-token.service';

const verifyIdToken = jest.fn();

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: unknown[]) => verifyIdToken(...args),
  })),
}));

const CLIENT_ID = 'client-123.apps.googleusercontent.com';

function makeConfig(
  overrides: Partial<Record<string, unknown>> = {},
): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
    SSO_ALLOWED_HD: 'magtrans.eu',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
}

/** A payload that passes every check; individual tests break one field. */
function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    sub: 'google-sub-1',
    email: 'Jan.Kowalski@magtrans.eu',
    email_verified: true,
    hd: 'magtrans.eu',
    name: 'Jan Kowalski',
    ...overrides,
  };
}

function resolveWith(p: Record<string, unknown> | undefined): void {
  verifyIdToken.mockResolvedValue({ getPayload: () => p });
}

describe('GoogleIdTokenService', () => {
  beforeEach(() => {
    verifyIdToken.mockReset();
  });

  it('returns the identity with a normalised, lower-cased email', async () => {
    resolveWith(payload());
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).resolves.toEqual({
      sub: 'google-sub-1',
      // MAGSpace stores addresses lower-cased and matches on them exactly.
      email: 'jan.kowalski@magtrans.eu',
      name: 'Jan Kowalski',
    });
  });

  it('passes the configured client id as the audience', async () => {
    resolveWith(payload());
    const svc = new GoogleIdTokenService(makeConfig());

    await svc.verifyIdToken('a.b.c');

    // Without `audience` the library would accept a token minted for ANY other
    // Google client — the signature is Google's either way.
    expect(verifyIdToken).toHaveBeenCalledWith({
      idToken: 'a.b.c',
      audience: CLIENT_ID,
    });
  });

  it('rejects a token the library refuses (bad signature, wrong aud, expired)', async () => {
    verifyIdToken.mockRejectedValue(new Error('Token used too late'));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a token whose issuer is not Google', async () => {
    resolveWith(payload({ iss: 'https://evil.example.com' }));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the bare "accounts.google.com" issuer spelling', async () => {
    resolveWith(payload({ iss: 'accounts.google.com' }));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).resolves.toMatchObject({
      sub: 'google-sub-1',
    });
  });

  it('rejects an unverified email', async () => {
    resolveWith(payload({ email_verified: false }));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a consumer account (no hd claim at all)', async () => {
    // This is the check that matters most: a personal @gmail.com whose address
    // happens to match an employee's would otherwise sail through.
    resolveWith(payload({ hd: undefined, email: 'jan.kowalski@gmail.com' }));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a Workspace account from another domain', async () => {
    resolveWith(payload({ hd: 'someone-else.eu' }));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('honours a non-default SSO_ALLOWED_HD', async () => {
    resolveWith(payload({ hd: 'other.example' }));
    const svc = new GoogleIdTokenService(makeConfig({ SSO_ALLOWED_HD: 'other.example' }));

    await expect(svc.verifyIdToken('a.b.c')).resolves.toMatchObject({
      sub: 'google-sub-1',
    });
  });

  it('rejects an empty payload', async () => {
    resolveWith(undefined);
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('answers 503 — not 403 — when no client id is configured', async () => {
    const svc = new GoogleIdTokenService(makeConfig({ GOOGLE_OAUTH_CLIENT_ID: undefined }));

    expect(svc.isConfigured).toBe(false);
    // A misconfigured server is not the caller's fault; 403 would tell them to
    // go find a different Google account, which would not help.
    await expect(svc.verifyIdToken('a.b.c')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it('surfaces the SSO error code in the RFC 7807 extensions bag', async () => {
    resolveWith(payload({ hd: undefined }));
    const svc = new GoogleIdTokenService(makeConfig());

    // The web branches on `err.data.extensions.code`, never on the message.
    await expect(svc.verifyIdToken('a.b.c')).rejects.toMatchObject({
      response: { extensions: { code: 'SSO_DOMAIN_NOT_ALLOWED' } },
    });
  });
});

describe('GoogleIdTokenService — rejection log', () => {
  const CTX = { ipAddress: '192.0.2.77', userAgent: 'jest-ua' };
  let warn: jest.SpyInstance;

  beforeEach(() => {
    verifyIdToken.mockReset();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('records who was turned away and from where', async () => {
    resolveWith(payload({ hd: 'someone-else.eu' }));
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c', CTX)).rejects.toBeInstanceOf(ForbiddenException);

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'googleLoginRefused',
        reason: 'id_token_rejected',
        ipAddress: CTX.ipAddress,
        userAgent: CTX.userAgent,
      }),
    );
  });

  it('strips the decoded payload google-auth-library appends to its messages', async () => {
    // Verbatim shape of the library's expiry error: the whole payload, e-mail
    // and name included, after ": ".
    verifyIdToken.mockRejectedValue(
      new Error(
        'Token used too late, 1757840000 > 1757836700: {"email":"jan.kowalski@magtrans.eu","name":"Jan Kowalski"}',
      ),
    );
    const svc = new GoogleIdTokenService(makeConfig());

    await expect(svc.verifyIdToken('a.b.c', CTX)).rejects.toBeInstanceOf(ForbiddenException);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('Token used too late, 1757840000 > 1757836700');
    expect(logged).not.toContain('jan.kowalski');
    expect(logged).not.toContain('Jan Kowalski');
  });

  it('libraryErrorSummary keeps messages without evidence intact and drops raw tokens', () => {
    expect(libraryErrorSummary('Wrong recipient, payload audience != requiredAudience')).toBe(
      'Wrong recipient, payload audience != requiredAudience',
    );
    expect(libraryErrorSummary('Invalid token signature: eyJhbGciOi.eyJzdWIi.sig')).toBe(
      'Invalid token signature',
    );
  });
});
