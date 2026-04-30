"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const testing_1 = require("@nestjs/testing");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const ioredis_1 = __importDefault(require("ioredis"));
const supertest_1 = __importDefault(require("supertest"));
const app_module_1 = require("../src/app.module");
const database_1 = require("@magguarantee/database");
const MAILHOG_API = 'http://localhost:8025/api/v2';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
async function clearMailhog() {
    // Mailhog wipe — best-effort. Ignore network errors so tests still proceed.
    try {
        await fetch(`${MAILHOG_API}/messages`, { method: 'DELETE' });
    }
    catch {
        // ignore
    }
}
async function fetchLatestCodeFor(email) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
        const res = await fetch(`${MAILHOG_API}/messages`);
        if (res.ok) {
            const json = (await res.json());
            // Mailhog returns most-recent-first. Find one addressed to `email`.
            for (const item of json.items) {
                const to = (item.To ?? [])
                    .map((t) => `${t.Mailbox}@${t.Domain}`)
                    .join(',');
                if (!to.includes(email))
                    continue;
                // Decoded body sometimes has soft line breaks. Strip them first.
                const body = (item.Content?.Body ?? '').replace(/=\r?\n/g, '');
                const m = body.match(/\b(\d{6})\b/);
                if (m)
                    return m[1] ?? '';
            }
        }
        await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No 2FA code found for ${email} within 10s`);
}
function parseCookies(setCookie) {
    const out = new Map();
    for (const c of setCookie) {
        const [namePart] = c.split(';');
        if (!namePart)
            continue;
        const eq = namePart.indexOf('=');
        if (eq <= 0)
            continue;
        const name = namePart.slice(0, eq).trim();
        const value = namePart.slice(eq + 1).trim();
        out.set(name, value);
    }
    return out;
}
describe('Auth (e2e)', () => {
    let app;
    let server;
    let redis;
    beforeAll(async () => {
        process.env.NODE_ENV ??= 'test';
        process.env.JWT_ACCESS_SECRET ??=
            'test-access-secret-aaaaaaaaaaaaaaaaaaaaaa';
        process.env.JWT_REFRESH_SECRET ??=
            'test-refresh-secret-bbbbbbbbbbbbbbbbbbbbbbbb';
        const moduleRef = await testing_1.Test.createTestingModule({
            imports: [app_module_1.AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        app.use((0, cookie_parser_1.default)());
        app.setGlobalPrefix('api/v1', { exclude: ['health', 'ready'] });
        await app.init();
        server = app.getHttpServer();
        redis = new ioredis_1.default(REDIS_URL, { maxRetriesPerRequest: 3 });
    });
    beforeEach(async () => {
        // Wipe e2e state — Mailhog inbox, Redis 2fa keys, refresh tokens.
        await clearMailhog();
        const keys = await redis.keys('2fa:*');
        if (keys.length > 0)
            await redis.del(...keys);
        await database_1.prisma.refreshToken.deleteMany({});
        await database_1.prisma.user.updateMany({
            where: { login: 'przewoznik1' },
            data: { failedAttempts: 0, lockedUntil: null },
        });
    });
    afterAll(async () => {
        await redis.quit();
        await app.close();
        await database_1.prisma.$disconnect();
    });
    // ── Happy path ───────────────────────────────────────
    it('full login → verify-code → /auth/me happy path', async () => {
        const loginRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'przewoznik1', password: 'Test1234!' })
            .expect(200);
        expect(loginRes.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
        expect(loginRes.body.maskedEmail).toBe('pr***@magtrans.eu');
        const code = await fetchLatestCodeFor('przewoznik1@magtrans.eu');
        const verifyRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/verify-code')
            .send({ sessionToken: loginRes.body.sessionToken, code })
            .expect(200);
        expect(verifyRes.body.user.login).toBe('przewoznik1');
        expect(verifyRes.body.user.role).toBe('przewoznik');
        expect(verifyRes.body.user.email).toBe('przewoznik1@magtrans.eu');
        const setCookie = verifyRes.headers['set-cookie'];
        expect(setCookie).toBeDefined();
        const cookies = parseCookies(setCookie);
        expect(cookies.get('mt_access')).toBeTruthy();
        expect(cookies.get('mt_refresh')).toBeTruthy();
        const meRes = await (0, supertest_1.default)(server)
            .get('/api/v1/auth/me')
            .set('Cookie', `mt_access=${cookies.get('mt_access')}`)
            .expect(200);
        expect(meRes.body.login).toBe('przewoznik1');
        expect(meRes.body.role).toBe('przewoznik');
    });
    // ── Wrong code ────────────────────────────────────────
    it('wrong code 4 times returns 401 with attempts hint, 5th locks for 5 min', async () => {
        const loginRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'admin', password: 'Test1234!' })
            .expect(200);
        const sessionToken = loginRes.body.sessionToken;
        // Drain the mail before doing the wrong attempts (we don't need it).
        await fetchLatestCodeFor('admin@magtrans.eu');
        for (let i = 1; i <= 4; i++) {
            const res = await (0, supertest_1.default)(server)
                .post('/api/v1/auth/verify-code')
                .send({ sessionToken, code: '000000' })
                .expect(401);
            // Nest's UnauthorizedException with object payload exposes via `message`.
            expect(JSON.stringify(res.body)).toMatch(/Invalid code|attemptsLeft/);
        }
        // 5th wrong code → 423 LOCKED + lockedForSec.
        const fifth = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/verify-code')
            .send({ sessionToken, code: '000000' })
            .expect(423);
        expect(fifth.body).toHaveProperty('lockedForSec');
        expect(fifth.body.lockedForSec).toBeGreaterThan(0);
        // 6th: lockout still active.
        await (0, supertest_1.default)(server)
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
        const loginRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'opiekun1', password: 'Test1234!' })
            .expect(200);
        const code = await fetchLatestCodeFor('opiekun1@magtrans.eu');
        const verifyRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/verify-code')
            .send({ sessionToken: loginRes.body.sessionToken, code })
            .expect(200);
        const cookies = parseCookies(verifyRes.headers['set-cookie']);
        const oldRefresh = cookies.get('mt_refresh');
        const refreshRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/refresh')
            .set('Cookie', `mt_refresh=${oldRefresh}`)
            .expect(200);
        expect(refreshRes.body.user.login).toBe('opiekun1');
        const newCookies = parseCookies(refreshRes.headers['set-cookie']);
        const newRefresh = newCookies.get('mt_refresh');
        expect(newRefresh).toBeTruthy();
        expect(newRefresh).not.toBe(oldRefresh);
        // DB chain check: old token is revoked and points to the new one via
        // replacedById.
        const tokens = await database_1.prisma.refreshToken.findMany({
            where: { user: { login: 'opiekun1' } },
            orderBy: { createdAt: 'asc' },
        });
        expect(tokens.length).toBe(2);
        const first = tokens[0];
        const second = tokens[1];
        if (!first || !second)
            throw new Error('expected two tokens');
        expect(first.revokedAt).not.toBeNull();
        expect(first.replacedById).toBe(second.id);
        expect(second.revokedAt).toBeNull();
    });
    // ── Theft detection ───────────────────────────────────
    it('reusing a revoked refresh token revokes ALL sessions', async () => {
        const loginRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'pracownik1', password: 'Test1234!' })
            .expect(200);
        const code = await fetchLatestCodeFor('pracownik1@magtrans.eu');
        const verifyRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/verify-code')
            .send({ sessionToken: loginRes.body.sessionToken, code })
            .expect(200);
        const cookies = parseCookies(verifyRes.headers['set-cookie']);
        const oldRefresh = cookies.get('mt_refresh');
        // Legitimate first refresh — old token now revoked.
        await (0, supertest_1.default)(server)
            .post('/api/v1/auth/refresh')
            .set('Cookie', `mt_refresh=${oldRefresh}`)
            .expect(200);
        // Replay — same (revoked) token: 401 + all user tokens revoked.
        await (0, supertest_1.default)(server)
            .post('/api/v1/auth/refresh')
            .set('Cookie', `mt_refresh=${oldRefresh}`)
            .expect(401);
        const tokens = await database_1.prisma.refreshToken.findMany({
            where: { user: { login: 'pracownik1' } },
        });
        expect(tokens.length).toBeGreaterThan(0);
        for (const t of tokens) {
            expect(t.revokedAt).not.toBeNull();
        }
    });
    // ── Account-enumeration safety ────────────────────────
    it('login with unknown user returns the same shape as wrong password', async () => {
        const unknownRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'noone-here', password: 'whatever' })
            .expect(200);
        expect(unknownRes.body).toHaveProperty('sessionToken');
        expect(unknownRes.body).toHaveProperty('maskedEmail');
        expect(unknownRes.body.sessionToken).toMatch(/^[0-9a-f]{64}$/);
        const wrongRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'admin', password: 'wrong-password' })
            .expect(200);
        expect(wrongRes.body).toHaveProperty('sessionToken');
        expect(wrongRes.body).toHaveProperty('maskedEmail');
        // Both shapes must be identical (key sets at least).
        expect(Object.keys(unknownRes.body).sort()).toEqual(Object.keys(wrongRes.body).sort());
        // Decoy session must not verify with any code.
        await (0, supertest_1.default)(server)
            .post('/api/v1/auth/verify-code')
            .send({ sessionToken: unknownRes.body.sessionToken, code: '123456' })
            .expect(401);
    });
    // ── Logout ────────────────────────────────────────────
    it('logout revokes the refresh token row', async () => {
        const loginRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/login')
            .send({ login: 'planista1', password: 'Test1234!' })
            .expect(200);
        const code = await fetchLatestCodeFor('planista1@magtrans.eu');
        const verifyRes = await (0, supertest_1.default)(server)
            .post('/api/v1/auth/verify-code')
            .send({ sessionToken: loginRes.body.sessionToken, code })
            .expect(200);
        const cookies = parseCookies(verifyRes.headers['set-cookie']);
        const access = cookies.get('mt_access');
        const refresh = cookies.get('mt_refresh');
        await (0, supertest_1.default)(server)
            .post('/api/v1/auth/logout')
            .set('Cookie', `mt_access=${access}; mt_refresh=${refresh}`)
            .expect(204);
        const tokens = await database_1.prisma.refreshToken.findMany({
            where: { user: { login: 'planista1' } },
        });
        expect(tokens.length).toBe(1);
        expect(tokens[0]?.revokedAt).not.toBeNull();
    });
    // ── /auth/me without JWT ──────────────────────────────
    it('GET /auth/me without a token returns 401', async () => {
        await (0, supertest_1.default)(server).get('/api/v1/auth/me').expect(401);
    });
});
//# sourceMappingURL=auth.e2e-spec.js.map