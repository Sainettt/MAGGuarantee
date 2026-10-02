// Unit tests for the BugBot handoff signer (contract: MAGGuaranteeBugBot
// docs/06-contracts.md §1.3; summary in docs/16-jobs-and-integrations.md#bugbot-handoff).
//
// The key pair is generated per run — no PEM fixture lives in the repo. Tokens
// are checked the way BugBot checks them: signature with the PUBLIC half, ES256
// pinned, `aud` / `iss` enforced.

import { generateKeyPairSync } from 'node:crypto';

import {
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { BugbotHandoffQuery, Role } from '@magguarantee/shared';

import type { Env } from '../../../config/env.schema';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { BugbotHandoffService, emailClaim, nameClaim } from './bugbot-handoff.service';

const SLUG = 'magguarantee';
const KID = 'mg-2026-10';
const BASE_URL = 'https://bugbot.example.test';

function p256Pair(): { privateKey: string; publicKey: string } {
  return generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
}

const KEYS = p256Pair();

function makeConfig(overrides: Partial<Record<keyof Env, unknown>> = {}): ConfigService<Env, true> {
  const values: Partial<Record<keyof Env, unknown>> = {
    BUGBOT_URL: BASE_URL,
    BUGBOT_PROJECT_SLUG: SLUG,
    BUGBOT_HANDOFF_KID: KID,
    BUGBOT_HANDOFF_PRIVATE_KEY: KEYS.privateKey,
    ...overrides,
  };
  return {
    get: (key: keyof Env) => values[key],
  } as unknown as ConfigService<Env, true>;
}

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    sub: '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
    login: 'jkowalski',
    email: 'Jan.Kowalski@magtrans.eu',
    name: 'Jan Kowalski',
    role: 'przewoznik',
    mustChangePassword: false,
    lider: false,
    ...overrides,
  };
}

const BUG_PL: BugbotHandoffQuery = { kind: 'bug', locale: 'pl' };

interface DecodedToken {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
}

/** Pulls the token out of the URL the way BugBot's callback page reads it. */
function tokenOf(url: string): string {
  const token = new URL(url).searchParams.get('token');
  if (!token) throw new Error('no token in the handoff URL');
  return token;
}

const jwt = new JwtService({});

function decode(token: string): DecodedToken {
  return jwt.decode(token, { complete: true }) as unknown as DecodedToken;
}

/** BugBot's verification: public key, ES256 only, aud + iss. */
function verify(token: string, publicKey = KEYS.publicKey): Promise<Record<string, unknown>> {
  return jwt.verifyAsync<Record<string, unknown>>(token, {
    publicKey,
    algorithms: ['ES256'],
    audience: 'bugbot',
    issuer: SLUG,
  });
}

describe('BugbotHandoffService', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('token', () => {
    it('is ES256 with our kid and verifies with the paired PUBLIC key', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const { url } = await svc.createHandoff(user(), BUG_PL);
      const token = tokenOf(url);

      expect(decode(token).header).toEqual({ alg: 'ES256', kid: KID, typ: 'JWT' });
      await expect(verify(token)).resolves.toEqual(expect.objectContaining({ sub: user().sub }));
    });

    it('does not verify with a different public key', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const { url } = await svc.createHandoff(user(), BUG_PL);

      await expect(verify(tokenOf(url), p256Pair().publicKey)).rejects.toThrow(/invalid signature/);
    });

    it('carries exactly the contract claims, identity from the session', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const { url } = await svc.createHandoff(user({ role: 'opiekun', lider: true }), {
        kind: 'bug',
        locale: 'en',
      });
      const claims = await verify(tokenOf(url));

      expect(claims).toEqual({
        iss: SLUG,
        aud: 'bugbot',
        sub: '3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c',
        iat: expect.any(Number),
        exp: expect.any(Number),
        jti: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
        // The role as is — no `lider` flag, no extra claims.
        roles: ['opiekun'],
        email: 'Jan.Kowalski@magtrans.eu',
        name: 'Jan Kowalski',
        locale: 'en',
        kind: 'bug',
      });
      expect((claims.exp as number) - (claims.iat as number)).toBe(60);
    });

    it('issues a fresh jti on every call', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const a = await verify(tokenOf((await svc.createHandoff(user(), BUG_PL)).url));
      const b = await verify(tokenOf((await svc.createHandoff(user(), BUG_PL)).url));

      expect(a.jti).not.toEqual(b.jti);
    });

    it.each<Role>(['admin', 'pracownik', 'opiekun', 'przewoznik', 'planista', 'dyspozytor', 'weryfikator', 'eksport'])(
      'puts role %s into roles[] for a bug report',
      async (role) => {
        const svc = new BugbotHandoffService(makeConfig());
        const claims = await verify(tokenOf((await svc.createHandoff(user({ role }), BUG_PL)).url));

        expect(claims.roles).toEqual([role]);
        expect(claims.kind).toBe('bug');
      },
    );
  });

  describe('kind = idea', () => {
    it('is refused with 403 for a non-admin', async () => {
      const svc = new BugbotHandoffService(makeConfig());

      await expect(
        svc.createHandoff(user({ role: 'pracownik' }), { kind: 'idea', locale: 'pl' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('is signed for an admin', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const { url } = await svc.createHandoff(user({ role: 'admin' }), { kind: 'idea', locale: 'pl' });

      expect((await verify(tokenOf(url))).kind).toBe('idea');
    });
  });

  describe('integration switched off', () => {
    it.each<[string, Partial<Record<keyof Env, unknown>>]>([
      ['no BUGBOT_URL', { BUGBOT_URL: undefined }],
      ['no BUGBOT_HANDOFF_KID', { BUGBOT_HANDOFF_KID: undefined }],
      ['no BUGBOT_HANDOFF_PRIVATE_KEY', { BUGBOT_HANDOFF_PRIVATE_KEY: undefined }],
    ])('answers 404 with %s', async (_label, overrides) => {
      const svc = new BugbotHandoffService(makeConfig(overrides));

      await expect(svc.createHandoff(user(), BUG_PL)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 404 (not 403) for idea by a non-admin too', async () => {
      const svc = new BugbotHandoffService(makeConfig({ BUGBOT_URL: undefined }));

      await expect(
        svc.createHandoff(user({ role: 'przewoznik' }), { kind: 'idea', locale: 'pl' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('email claim', () => {
    /**
     * A valid address of exactly `length` characters (197–259): 64-char local
     * part, DNS labels of at most 63 chars.
     */
    const addressOfLength = (length: number): string =>
      `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(length - 196)}.pl`;

    it('helper sanity: lengths are exact', () => {
      expect(addressOfLength(254)).toHaveLength(254);
      expect(addressOfLength(255)).toHaveLength(255);
    });

    it('is sent at exactly 254 characters', async () => {
      const email = addressOfLength(254);
      const svc = new BugbotHandoffService(makeConfig());
      const claims = await verify(tokenOf((await svc.createHandoff(user({ email }), BUG_PL)).url));

      expect(claims.email).toBe(email);
    });

    it.each<[string, string]>([
      ['empty', ''],
      ['whitespace', '   '],
      ['not an address', 'jan.kowalski'],
      ['255 characters long', addressOfLength(255)],
    ])('is omitted when the address is %s', async (_label, email) => {
      const svc = new BugbotHandoffService(makeConfig());
      const claims = await verify(tokenOf((await svc.createHandoff(user({ email }), BUG_PL)).url));

      expect(claims).not.toHaveProperty('email');
      // The rest of the token is unaffected.
      expect(claims.sub).toBe(user().sub);
    });

    it('is sent trimmed when valid', () => {
      expect(emailClaim('  jan@magtrans.eu ')).toBe('jan@magtrans.eu');
    });

    it('is omitted when there is no address at all', () => {
      expect(emailClaim(undefined)).toBeUndefined();
      expect(emailClaim(null)).toBeUndefined();
    });
  });

  describe('name claim', () => {
    it('is cut to 200 characters', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const claims = await verify(
        tokenOf((await svc.createHandoff(user({ name: 'N'.repeat(250) }), BUG_PL)).url),
      );

      expect(claims.name).toBe('N'.repeat(200));
    });

    it('is omitted when empty or blank', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      for (const name of ['', '   ']) {
        const claims = await verify(tokenOf((await svc.createHandoff(user({ name }), BUG_PL)).url));
        expect(claims).not.toHaveProperty('name');
      }
    });

    it('never splits a surrogate pair at the cut', () => {
      // 199 units + a 2-unit emoji would be 201 → the emoji goes, whole.
      expect(nameClaim(`${'a'.repeat(199)}😀`)).toBe('a'.repeat(199));
      expect(nameClaim(`${'a'.repeat(198)}😀`)).toBe(`${'a'.repeat(198)}😀`);
    });

    it('is trimmed, also after the cut', () => {
      expect(nameClaim('  Jan Kowalski  ')).toBe('Jan Kowalski');
      expect(nameClaim(`${'a'.repeat(199)} b`)).toBe('a'.repeat(199));
    });
  });

  describe('URL', () => {
    it('is <BUGBOT_URL>/p/<slug>/auth/callback?token=<jwt> and nothing else', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      const { url } = await svc.createHandoff(user(), BUG_PL);
      const parsed = new URL(url);

      expect(`${parsed.origin}${parsed.pathname}`).toBe(`${BASE_URL}/p/${SLUG}/auth/callback`);
      expect([...parsed.searchParams.keys()]).toEqual(['token']);
      expect(url).toBe(`${BASE_URL}/p/${SLUG}/auth/callback?token=${encodeURIComponent(tokenOf(url))}`);
    });

    it.each(['https://bugbot.example.test/', 'https://bugbot.example.test///'])(
      'does not double the slash when BUGBOT_URL is %s',
      async (base) => {
        const svc = new BugbotHandoffService(makeConfig({ BUGBOT_URL: base }));
        const { url } = await svc.createHandoff(user(), BUG_PL);

        expect(url.startsWith(`${BASE_URL}/p/${SLUG}/auth/callback?token=`)).toBe(true);
        expect(url).not.toContain('//p/');
      },
    );

    it('keeps a path prefix of BUGBOT_URL', async () => {
      const svc = new BugbotHandoffService(makeConfig({ BUGBOT_URL: 'https://tools.example.test/bugbot/' }));
      const { url } = await svc.createHandoff(user(), BUG_PL);

      expect(url.startsWith('https://tools.example.test/bugbot/p/magguarantee/auth/callback?token=')).toBe(true);
    });

    it('uses BUGBOT_PROJECT_SLUG for both the path and iss', async () => {
      const svc = new BugbotHandoffService(makeConfig({ BUGBOT_PROJECT_SLUG: 'mag-staging' }));
      const { url } = await svc.createHandoff(user(), BUG_PL);

      expect(new URL(url).pathname).toBe('/p/mag-staging/auth/callback');
      expect(decode(tokenOf(url)).payload.iss).toBe('mag-staging');
    });
  });

  describe('logging', () => {
    it('logs { userId, kind } once — never the token or the URL', async () => {
      const svc = new BugbotHandoffService(makeConfig());
      logSpy.mockClear();
      const { url } = await svc.createHandoff(user(), BUG_PL);

      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith({
        msg: 'bugbot handoff issued',
        userId: user().sub,
        kind: 'bug',
      });
      const logged = JSON.stringify([...logSpy.mock.calls, ...errorSpy.mock.calls]);
      expect(logged).not.toContain(tokenOf(url));
      expect(logged).not.toContain('token=');
    });

    it('turns a signing failure into a 500 that names neither key nor token', async () => {
      // Bypasses env validation on purpose — the only way to reach this path.
      const svc = new BugbotHandoffService(
        makeConfig({ BUGBOT_HANDOFF_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nnot-a-key\n-----END PRIVATE KEY-----' }),
      );

      const err: unknown = await svc.createHandoff(user(), BUG_PL).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InternalServerErrorException);
      expect((err as Error).message).not.toContain('BEGIN');
      const logged = JSON.stringify(errorSpy.mock.calls);
      expect(logged).toContain('bugbot handoff signing failed');
      expect(logged).not.toContain('not-a-key');
      expect(logged).not.toContain('BEGIN');
    });
  });
});
