/**
 * In-process fixed-window limiter: at most ONE event per key per window, with
 * a count of what was swallowed in between so the next emission can say so.
 *
 * Used for ops alerts (a dead SMTP server must not post 200 Chat messages in a
 * minute) and for connection-error log lines (ioredis emits `error` on every
 * reconnect attempt, i.e. every couple of seconds while Redis is down).
 *
 * In-process on purpose: it has to keep working when Redis is the thing that
 * is broken. N replicas would each emit once per window — acceptable.
 */
export type RateLimitDecision =
  | { allowed: true; suppressedSince: number }
  | { allowed: false };

interface WindowState {
  windowStart: number;
  suppressed: number;
}

export class KeyedRateLimiter {
  private readonly state = new Map<string, WindowState>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    /** Hard cap on tracked keys — the oldest key is evicted beyond it. */
    private readonly maxKeys = 500,
  ) {}

  take(key: string): RateLimitDecision {
    const now = this.now();
    const entry = this.state.get(key);
    if (entry && now - entry.windowStart < this.windowMs) {
      entry.suppressed += 1;
      return { allowed: false };
    }
    const suppressedSince = entry?.suppressed ?? 0;
    // Delete + set moves the key to the end of the Map's insertion order, so
    // eviction below always drops the least recently emitted key.
    this.state.delete(key);
    this.state.set(key, { windowStart: now, suppressed: 0 });
    this._evict();
    return { allowed: true, suppressedSince };
  }

  private _evict(): void {
    while (this.state.size > this.maxKeys) {
      const oldest = this.state.keys().next();
      if (oldest.done) return;
      this.state.delete(oldest.value);
    }
  }
}
