import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import IORedis, { Redis } from 'ioredis';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { REFRESH_ROTATION_GRACE_MS } from '../src/modules/auth/auth.constants';
import { QUEUE_EMAIL_SEND } from '../src/modules/jobs/queue-names';
import { prisma } from '@magguarantee/database';

// Mailhog serves reads on /api/v2 but has NO v2 delete route —
// `DELETE /api/v2/messages` is a 404. Wiping the inbox is v1 only.
const MAILHOG_API = 'http://localhost:8025/api/v2';
const MAILHOG_DELETE_ALL = 'http://localhost:8025/api/v1/messages';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

interface MailhogMessage {
  ID: string;
  Content: { Body: string; Headers: Record<string, string[]> };
  To: { Mailbox: string; Domain: string }[];
}

/**
 * Empties the Mailhog inbox and fails loudly if that did not happen.
 *
 * `fetchLatestCodeFor` takes the newest message addressed to a user, and the
 * 2FA mail is delivered asynchronously (BullMQ), so it lands a few hundred ms
 * AFTER /auth/login returns. A leftover message from an earlier run is already
 * in the inbox at that moment and would be picked instead, which makes the
 * test send a stale code (401 "Invalid code"). The wipe must therefore be real.
 */
async function clearMailhog(): Promise<void> {
  const res = await fetch(MAILHOG_DELETE_ALL, { method: 'DELETE' });
  if (!res.ok) {
    throw new Error(`Mailhog wipe failed: DELETE ${MAILHOG_DELETE_ALL} → ${res.status}`);
  }
  const check = await fetch(`${MAILHOG_API}/messages?limit=1`);
  const json = (await check.json()) as { total: number };
  if (json.total !== 0) {
    throw new Error(`Mailhog wipe failed: ${json.total} message(s) still in the inbox`);
  }
}

async function fetchLatestCodeFor(email: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILHOG_API}/messages`);
    if (res.ok) {
      const json = (await res.json()) as { items: MailhogMessage[] };
      // Mailhog returns most-recent-first. Find one addressed to `email`.
      for (const item of json.items) {
        const to = (item.To ?? [])
          .map((t) => `${t.Mailbox}@${t.Domain}`)
          .join(',');
        if (!to.includes(email)) continue;
        // Decoded body sometimes has soft line breaks. Strip them first.
        const body = (item.Content?.Body ?? '').replace(/=\r?\n/g, '');
        const m = body.match(/\b(\d{6})\b/);
        if (m) return m[1] ?? '';
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No 2FA code found for ${email} within 10s`);
}

function parseCookies(setCookie: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of setCookie) {
    const [namePart] = c.split(';');
    if (!namePart) continue;
    const eq = namePart.indexOf('=');
    if (eq <= 0) continue;
    const name = namePart.slice(0, eq).trim();
    const value = namePart.slice(eq + 1).trim();
    out.set(name, value);
  }
  return out;
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let redis: Redis;

  beforeAll(async () => {
    process.env.NODE_ENV ??= 'test';
    process.env.JWT_ACCESS_SECRET ??=
      'test-access-secret-aaaaaaaaaaaaaaaaaaaaaa';
    process.env.JWT_REFRESH_SECRET ??=
      'test-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbb';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    // Drop email jobs left waiting / in retry backoff by an earlier run (e.g.
    // one killed mid-flight, or one whose renders failed and were rescheduled).
    // The worker only starts in `app.init()`; without this it would deliver
    // those stale 2FA mails in the middle of this run, and the newest message
    // for a user could again carry a code from a dead session.
    const emailQueue = moduleRef.get<Queue>(getQueueToken(QUEUE_EMAIL_SEND), {
      strict: false,
    });
    await emailQueue.drain(true);
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
    await app.init();
    server = app.getHttpServer();
    redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: 3 });
  });

  beforeEach(async () => {
    // Wipe e2e state — Mailhog inbox, Redis 2fa keys, refresh tokens.
    await clearMailhog();
    const keys = await redis.keys('2fa:*');
    if (keys.length > 0) await redis.del(...keys);
    await prisma.refreshToken.deleteMany({});
    await prisma.user.updateMany({
      where: { login: 'przewoznik1' },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  });

  afterAll(async () => {
    await redis.quit();
    await app.close();
    await prisma.$disconnect();
  });

  // ── Happy path ───────────────────────────────────────

  it('full login → verify-code → /auth/me happy path', async () => {
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'przewoznik1', password: 'Test1234!' })
      .expect(200);
    expect(loginRes.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(loginRes.body.maskedEmail).toBe('pr***@magtrans.eu');

    const code = await fetchLatestCodeFor('przewoznik1@magtrans.eu');

    const verifyRes = await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken: loginRes.body.sessionToken, code })
      .expect(200);
    expect(verifyRes.body.user.login).toBe('przewoznik1');
    expect(verifyRes.body.user.role).toBe('przewoznik');
    expect(verifyRes.body.user.email).toBe('przewoznik1@magtrans.eu');

    const setCookie = verifyRes.headers['set-cookie'] as unknown as string[];
    expect(setCookie).toBeDefined();
    const cookies = parseCookies(setCookie);
    expect(cookies.get('mt_access')).toBeTruthy();
    expect(cookies.get('mt_refresh')).toBeTruthy();

    const meRes = await request(server)
      .get('/api/v1/auth/me')
      .set('Cookie', `mt_access=${cookies.get('mt_access')}`)
      .expect(200);
    expect(meRes.body.login).toBe('przewoznik1');
    expect(meRes.body.role).toBe('przewoznik');
  });

  // ── Wrong code ────────────────────────────────────────

  it('wrong code 4 times returns 401 with attempts hint, 5th locks for 5 min', async () => {
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'admin', password: 'Test1234!' })
      .expect(200);
    const sessionToken = loginRes.body.sessionToken as string;
    // Drain the mail before doing the wrong attempts (we don't need it).
    await fetchLatestCodeFor('admin@magtrans.eu');

    for (let i = 1; i <= 4; i++) {
      const res = await request(server)
        .post('/api/v1/auth/verify-code')
        .send({ sessionToken, code: '000000' })
        .expect(401);
      // Nest's UnauthorizedException with object payload exposes via `message`.
      expect(JSON.stringify(res.body)).toMatch(/Invalid code|attemptsLeft/);
    }

    // 5th wrong code → 423 LOCKED + lockedForSec.
    const fifth = await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken, code: '000000' })
      .expect(423);
    expect(fifth.body).toHaveProperty('lockedForSec');
    expect(fifth.body.lockedForSec).toBeGreaterThan(0);

    // 6th: lockout still active.
    await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken, code: '000000' })
      .expect(423);

    // Asserting the lockout key TTL is ~300s — non-negotiable per docs.
    const ttlMs = await redis.pttl(`2fa:lockout:${sessionToken}`);
    expect(ttlMs).toBeGreaterThan(290_000);
    expect(ttlMs).toBeLessThanOrEqual(300_000);
  });

  // ── Refresh rotation ──────────────────────────────────

  it('refresh rotates tokens and links replacedById', async () => {
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'opiekun1', password: 'Test1234!' })
      .expect(200);
    const code = await fetchLatestCodeFor('opiekun1@magtrans.eu');
    const verifyRes = await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken: loginRes.body.sessionToken, code })
      .expect(200);
    const cookies = parseCookies(verifyRes.headers['set-cookie'] as unknown as string[]);
    const oldRefresh = cookies.get('mt_refresh') as string;

    const refreshRes = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `mt_refresh=${oldRefresh}`)
      .expect(200);
    expect(refreshRes.body.user.login).toBe('opiekun1');
    const newCookies = parseCookies(
      refreshRes.headers['set-cookie'] as unknown as string[],
    );
    const newRefresh = newCookies.get('mt_refresh');
    expect(newRefresh).toBeTruthy();
    expect(newRefresh).not.toBe(oldRefresh);

    // DB chain check: old token is revoked and points to the new one via
    // replacedById.
    const tokens = await prisma.refreshToken.findMany({
      where: { user: { login: 'opiekun1' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(tokens.length).toBe(2);
    const first = tokens[0];
    const second = tokens[1];
    if (!first || !second) throw new Error('expected two tokens');
    expect(first.revokedAt).not.toBeNull();
    expect(first.replacedById).toBe(second.id);
    expect(second.revokedAt).toBeNull();
  });

  // ── Theft detection ───────────────────────────────────

  it('reusing a revoked refresh token revokes ALL sessions', async () => {
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'pracownik1', password: 'Test1234!' })
      .expect(200);
    const code = await fetchLatestCodeFor('pracownik1@magtrans.eu');
    const verifyRes = await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken: loginRes.body.sessionToken, code })
      .expect(200);
    const cookies = parseCookies(verifyRes.headers['set-cookie'] as unknown as string[]);
    const oldRefresh = cookies.get('mt_refresh') as string;

    // Legitimate first refresh — old token now revoked.
    const rotated = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `mt_refresh=${oldRefresh}`)
      .expect(200);
    const rotatedRefresh = parseCookies(
      rotated.headers['set-cookie'] as unknown as string[],
    ).get('mt_refresh');
    expect(rotatedRefresh).toBeTruthy();

    // Replay INSIDE the grace window is the documented benign concurrent-
    // rotation race (docs/15-auth-strategy.md#rotation, step 5): 200 with an
    // access-only token, no second rotation, no refresh cookie, nothing revoked.
    const healed = await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `mt_refresh=${oldRefresh}`)
      .expect(200);
    const healedCookies = parseCookies(
      healed.headers['set-cookie'] as unknown as string[],
    );
    expect(healedCookies.get('mt_access')).toBeTruthy();
    expect(healedCookies.has('mt_refresh')).toBe(false);
    const liveAfterHeal = await prisma.refreshToken.count({
      where: { user: { login: 'pracownik1' }, revokedAt: null },
    });
    expect(liveAfterHeal).toBe(1);

    // Move the rotation out of the grace window instead of sleeping 30 s: the
    // same replay is now genuine theft.
    const revokedRows = await prisma.refreshToken.updateMany({
      where: { user: { login: 'pracownik1' }, revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - REFRESH_ROTATION_GRACE_MS - 1_000) },
    });
    expect(revokedRows.count).toBe(1);

    // Replay — same (revoked) token outside the window: 401 + all user tokens revoked.
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `mt_refresh=${oldRefresh}`)
      .expect(401);

    const tokens = await prisma.refreshToken.findMany({
      where: { user: { login: 'pracownik1' } },
    });
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) {
      expect(t.revokedAt).not.toBeNull();
    }
  });

  // ── Account-enumeration safety ────────────────────────

  it('login with unknown user returns the same shape as wrong password', async () => {
    const unknownRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'noone-here', password: 'whatever' })
      .expect(200);
    expect(unknownRes.body).toHaveProperty('sessionToken');
    expect(unknownRes.body).toHaveProperty('maskedEmail');
    expect(unknownRes.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);

    const wrongRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'admin', password: 'wrong-password' })
      .expect(200);
    expect(wrongRes.body).toHaveProperty('sessionToken');
    expect(wrongRes.body).toHaveProperty('maskedEmail');

    // Both shapes must be identical (key sets at least).
    expect(Object.keys(unknownRes.body).sort()).toEqual(
      Object.keys(wrongRes.body).sort(),
    );

    // Decoy session must not verify with any code.
    await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken: unknownRes.body.sessionToken, code: '123456' })
      .expect(401);
  });

  // ── Logout ────────────────────────────────────────────

  it('logout revokes the refresh token row', async () => {
    const loginRes = await request(server)
      .post('/api/v1/auth/login')
      .send({ login: 'planista1', password: 'Test1234!' })
      .expect(200);
    const code = await fetchLatestCodeFor('planista1@magtrans.eu');
    const verifyRes = await request(server)
      .post('/api/v1/auth/verify-code')
      .send({ sessionToken: loginRes.body.sessionToken, code })
      .expect(200);
    const cookies = parseCookies(verifyRes.headers['set-cookie'] as unknown as string[]);
    const access = cookies.get('mt_access') as string;
    const refresh = cookies.get('mt_refresh') as string;

    await request(server)
      .post('/api/v1/auth/logout')
      .set('Cookie', `mt_access=${access}; mt_refresh=${refresh}`)
      .expect(204);

    const tokens = await prisma.refreshToken.findMany({
      where: { user: { login: 'planista1' } },
    });
    expect(tokens.length).toBe(1);
    expect(tokens[0]?.revokedAt).not.toBeNull();
  });

  // ── /auth/me without JWT ──────────────────────────────

  it('GET /auth/me without a token returns 401', async () => {
    await request(server).get('/api/v1/auth/me').expect(401);
  });
});
