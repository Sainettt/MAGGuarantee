// Env schema — BugBot handoff keys (docs/16-jobs-and-integrations.md#bugbot-handoff).
//
// Key pairs are generated per run; no PEM fixture lives in the repo.

import { generateKeyPairSync } from 'node:crypto';

import { envSchema, validateEnv } from './env.schema';

/** The schema's required keys, nothing else — every other key has a default. */
const BASE_ENV: Readonly<Record<string, string>> = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db?schema=public',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio-secret',
  S3_BUCKET: 'magguarantee',
};

function pkcs8(
  type: 'ec' | 'rsa' | 'ed25519',
  namedCurve = 'prime256v1',
): { privateKey: string; publicKey: string } {
  const privateKeyEncoding = { type: 'pkcs8', format: 'pem' } as const;
  const publicKeyEncoding = { type: 'spki', format: 'pem' } as const;
  if (type === 'ec') {
    return generateKeyPairSync('ec', { namedCurve, privateKeyEncoding, publicKeyEncoding });
  }
  if (type === 'rsa') {
    return generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding, publicKeyEncoding });
  }
  return generateKeyPairSync('ed25519', { privateKeyEncoding, publicKeyEncoding });
}

const P256 = pkcs8('ec');

const BUGBOT_ENV: Readonly<Record<string, string>> = {
  BUGBOT_URL: 'https://bugbot.example.test',
  BUGBOT_HANDOFF_KID: 'mg-2026-10',
  BUGBOT_HANDOFF_PRIVATE_KEY: P256.privateKey,
};

function parse(extra: Record<string, string | undefined>) {
  return envSchema.safeParse({ ...BASE_ENV, ...extra });
}

/** Paths of the issues, e.g. `['BUGBOT_URL']`. */
function issuePaths(extra: Record<string, string | undefined>): string[] {
  const result = parse(extra);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
}

/** Everything a failed boot would print: the thrown message of validateEnv. */
function bootError(extra: Record<string, string | undefined>): string {
  try {
    validateEnv({ ...BASE_ENV, ...extra });
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  throw new Error('expected validateEnv to throw');
}

/** The base64 body of a PEM — what must never appear in an error message. */
function pemBody(pem: string): string {
  return pem.split('\n').filter((l) => l && !l.startsWith('-----')).join('');
}

describe('envSchema — BugBot handoff', () => {
  it('base env (no BugBot keys) parses: integration off, slug defaulted', () => {
    const result = parse({});

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.BUGBOT_URL).toBeUndefined();
    expect(result.data.BUGBOT_HANDOFF_KID).toBeUndefined();
    expect(result.data.BUGBOT_HANDOFF_PRIVATE_KEY).toBeUndefined();
    expect(result.data.BUGBOT_PROJECT_SLUG).toBe('magguarantee');
  });

  it('blank values == absent: integration off, slug defaulted', () => {
    const result = parse({
      BUGBOT_URL: '',
      BUGBOT_PROJECT_SLUG: '',
      BUGBOT_HANDOFF_KID: '  ',
      BUGBOT_HANDOFF_PRIVATE_KEY: '',
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.BUGBOT_URL).toBeUndefined();
    expect(result.data.BUGBOT_HANDOFF_KID).toBeUndefined();
    expect(result.data.BUGBOT_HANDOFF_PRIVATE_KEY).toBeUndefined();
    expect(result.data.BUGBOT_PROJECT_SLUG).toBe('magguarantee');
  });

  it('a full configuration parses and the PEM comes through unchanged', () => {
    const result = parse({ ...BUGBOT_ENV, BUGBOT_PROJECT_SLUG: 'mag-staging' });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.BUGBOT_URL).toBe('https://bugbot.example.test');
    expect(result.data.BUGBOT_HANDOFF_KID).toBe('mg-2026-10');
    expect(result.data.BUGBOT_HANDOFF_PRIVATE_KEY).toBe(P256.privateKey);
    expect(result.data.BUGBOT_PROJECT_SLUG).toBe('mag-staging');
  });

  it('turns literal \\n of a one-line PEM back into newlines', () => {
    const oneLine = P256.privateKey.replace(/\n/g, '\\n');
    expect(oneLine).not.toContain('\n');

    const result = parse({ ...BUGBOT_ENV, BUGBOT_HANDOFF_PRIVATE_KEY: oneLine });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.BUGBOT_HANDOFF_PRIVATE_KEY).toBe(P256.privateKey);
  });

  describe('all or nothing', () => {
    it.each(['BUGBOT_URL', 'BUGBOT_HANDOFF_KID', 'BUGBOT_HANDOFF_PRIVATE_KEY'])(
      'rejects the set without %s, with an issue on exactly that key',
      (missing) => {
        expect(issuePaths({ ...BUGBOT_ENV, [missing]: undefined })).toEqual([missing]);
        // Blank counts as missing too.
        expect(issuePaths({ ...BUGBOT_ENV, [missing]: '' })).toEqual([missing]);
      },
    );

    it('names every missing key when only one is set', () => {
      expect(issuePaths({ BUGBOT_URL: BUGBOT_ENV.BUGBOT_URL }).sort()).toEqual([
        'BUGBOT_HANDOFF_KID',
        'BUGBOT_HANDOFF_PRIVATE_KEY',
      ]);
    });

    it('does not count BUGBOT_PROJECT_SLUG (it has a default)', () => {
      expect(parse({ BUGBOT_PROJECT_SLUG: 'magguarantee' }).success).toBe(true);
    });
  });

  describe('private key', () => {
    it.each<[string, () => string]>([
      ['an RSA key', () => pkcs8('rsa').privateKey],
      ['an EC P-384 key', () => pkcs8('ec', 'secp384r1').privateKey],
      ['an EC secp256k1 key', () => pkcs8('ec', 'secp256k1').privateKey],
      ['an Ed25519 key', () => pkcs8('ed25519').privateKey],
      ['the P-256 PUBLIC key', () => P256.publicKey],
      ['garbage', () => 'not-a-key-at-all'],
      ['a truncated PEM', () => P256.privateKey.slice(0, 80)],
      [
        'an encrypted PKCS#8 key',
        () =>
          generateKeyPairSync('ec', {
            namedCurve: 'prime256v1',
            privateKeyEncoding: { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'pw' },
            publicKeyEncoding: { type: 'spki', format: 'pem' },
          }).privateKey,
      ],
    ])('rejects %s', (_label, key) => {
      expect(issuePaths({ ...BUGBOT_ENV, BUGBOT_HANDOFF_PRIVATE_KEY: key() })).toEqual([
        'BUGBOT_HANDOFF_PRIVATE_KEY',
      ]);
    });

    it('never echoes the key in the error', () => {
      const rsa = pkcs8('rsa').privateKey;
      const message = bootError({ ...BUGBOT_ENV, BUGBOT_HANDOFF_PRIVATE_KEY: rsa });

      expect(message).toContain('BUGBOT_HANDOFF_PRIVATE_KEY');
      expect(message).not.toContain('BEGIN');
      expect(message).not.toContain(pemBody(rsa).slice(0, 32));
      expect(message).not.toContain(pemBody(P256.privateKey).slice(0, 32));
    });

    it('never echoes garbage input either', () => {
      const message = bootError({ ...BUGBOT_ENV, BUGBOT_HANDOFF_PRIVATE_KEY: 'zzz-secret-looking-value-zzz' });

      expect(message).not.toContain('zzz-secret-looking-value-zzz');
    });
  });

  describe('other BugBot keys', () => {
    it.each(['not-a-url', 'ftp://bugbot.example.test', 'javascript:alert(1)'])(
      'rejects BUGBOT_URL=%s',
      (url) => {
        expect(issuePaths({ ...BUGBOT_ENV, BUGBOT_URL: url })).toContain('BUGBOT_URL');
      },
    );

    it('accepts a trailing slash on BUGBOT_URL (stripped later by the service)', () => {
      expect(parse({ ...BUGBOT_ENV, BUGBOT_URL: 'https://bugbot.example.test/' }).success).toBe(true);
    });

    it.each(['MAGGUARANTEE', 'm', '1mag', 'mag_guarantee', 'a'.repeat(41)])(
      'rejects BUGBOT_PROJECT_SLUG=%s',
      (slug) => {
        expect(issuePaths({ BUGBOT_PROJECT_SLUG: slug })).toEqual(['BUGBOT_PROJECT_SLUG']);
      },
    );

    it.each(['has space', 'kid/with/slash', 'k'.repeat(65)])('rejects BUGBOT_HANDOFF_KID=%s', (kid) => {
      expect(issuePaths({ ...BUGBOT_ENV, BUGBOT_HANDOFF_KID: kid })).toEqual(['BUGBOT_HANDOFF_KID']);
    });
  });
});
