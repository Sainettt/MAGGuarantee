// Per-key serial queue — the fix for the "checkbox × save-on-blur" race on
// `/employee/limits` (docs/14 §16.3, §18.5.2). The key is the ISO week,
// `YYYY-Www` (`2026-W23`).
//
// Clicking a field's checkbox blurs the input that was being edited, so ONE
// user gesture can fire two writes at the same week (the blur commit and the
// toggle commit). Both go through `PUT /limits/:isoWeek` + an optimistic cache
// patch; if they overlap, the responses (and the patches) can land in the
// wrong order and the week silently keeps the losing value. Enter-to-next-week
// adds a third source: the next week's first write can start while the
// previous one is still in flight (different keys — that one is fine).
//
// So every write is enqueued under its week key: writes to the SAME week run
// strictly one after another (in call order, which is gesture order — `blur`
// fires before `click`), writes to DIFFERENT weeks stay parallel.
//
// A failing task does NOT poison the queue: the next task for that key still
// runs, and only the caller of the failing task sees the rejection.
//
// `subscribe` / `getVersion` make the pending counts observable from React
// (`useSyncExternalStore`): a week tile shows its spinner while the week has
// queued writes, and leaving the page is guarded only while anything is
// pending (§18.5.2).
//
// Pure, framework-free, unit-tested (`saveQueue.test.ts`).

export interface SerialQueue {
  /** Enqueue `task` behind everything already queued for `key`. */
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  /** Tasks queued or in flight for `key` (0 ⇒ the week is idle). */
  pending(key: string): number;
  /** Tasks queued or in flight across every key. */
  totalPending(): number;
  /** Called whenever a pending count changes. Returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
  /** Bumps on every pending-count change — a `useSyncExternalStore` snapshot. */
  getVersion(): number;
}

export function createSerialQueue(): SerialQueue {
  const tails = new Map<string, Promise<void>>();
  const counts = new Map<string, number>();
  const listeners = new Set<() => void>();
  let total = 0;
  let version = 0;

  const bump = (key: string, delta: number): void => {
    const next = (counts.get(key) ?? 0) + delta;
    if (next <= 0) counts.delete(key);
    else counts.set(key, next);
    total += delta;
    version += 1;
    for (const listener of [...listeners]) listener();
  };

  return {
    run<T>(key: string, task: () => Promise<T>): Promise<T> {
      bump(key, 1);
      const previous = tails.get(key) ?? Promise.resolve();
      // `.then(task, task)` — run regardless of how the predecessor settled.
      const result = previous.then(task, task);
      // The tail must never reject, or the next enqueue would attach to a
      // rejected promise and surface an unhandled rejection.
      const tail = result.then(
        () => undefined,
        () => undefined,
      );
      tails.set(key, tail);
      void tail.then(() => {
        bump(key, -1);
        // Drop the map entry once this task was the last one — keeps the map
        // from growing one entry per week per page-lifetime.
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
    pending(key: string): number {
      return counts.get(key) ?? 0;
    },
    totalPending(): number {
      return total;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getVersion(): number {
      return version;
    },
  };
}
