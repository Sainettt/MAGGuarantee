/**
 * Minimal request shape this helper needs. Structural rather than
 * `express.Request` so interceptor/controller tests can pass plain objects —
 * same reasoning as `AuditableRequest` in `common/audit/audit.decorator.ts`.
 */
export interface RequestWithIp {
  ip?: string;
}

/**
 * The client's address for audit rows and rate-limit buckets.
 *
 * ⚠️ Do NOT "improve" this by reading `X-Forwarded-For` here. That was the
 * previous implementation and it was subtly wrong — the reasoning is worth
 * keeping, because the wrong version looks more thorough than the right one.
 *
 * A request carries two very different kinds of evidence about who sent it:
 *
 *  - `req.socket.remoteAddress` — who the TCP connection is actually with.
 *    Unforgeable (the handshake completes only if the peer receives the
 *    replies), but behind a proxy it is the proxy, not the user.
 *  - `X-Forwarded-For` — a plain text header, `client, proxy1, proxy2`, each
 *    proxy appending on the right. These are *claims*, not facts: anyone can
 *    send the header themselves.
 *
 * `req.ip` is Express reconciling the two. It starts from the socket address
 * and walks left through the header exactly `trust proxy` hops (our
 * `TRUST_PROXY_HOPS` env, see `config/env.schema.ts`), then stops. Everything
 * further left came from an untrusted source and is ignored.
 *
 * Reading `X-Forwarded-For[0]` directly — the leftmost entry — takes the value
 * that is furthest from the unforgeable socket and fully controlled by whoever
 * sent the request. It is correct only while every proxy in the chain
 * OVERWRITES the header instead of appending to it. Ours does today
 * (`X-Forwarded-For $remote_addr` is a documented requirement of the nginx
 * vhost — docs/23-prod-deployment-runbook.md §1.1), but that invariant lives in
 * a config file we neither own nor test, `$proxy_add_x_forwarded_for` is the
 * far more common idiom, and the failure is silent: no exception, no failing
 * test, just audit rows with attacker-chosen addresses in them.
 *
 * Going through `req.ip` moves the trust decision into our own env var, where
 * it is documented and tested, and makes the audit log agree with what
 * ThrottlerGuard already uses.
 *
 * Returns `undefined` when nothing is available; the audit writer accepts an
 * absent address and leaves the column NULL.
 */
export function clientIp(req: RequestWithIp): string | undefined {
  return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : undefined;
}
