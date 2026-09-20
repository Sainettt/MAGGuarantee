// Per-key serial queue — the fix for the "checkbox × save-on-blur" race on
// `/employee/limits` (docs/14 §16.3).
//
// Clicking a row's checkbox blurs the input that was being edited, so ONE user
// gesture can fire two writes at the same `yearMonth` (the blur commit and the
// toggle commit). Both go through `PUT /limits/:yearMonth` + an optimistic
// cache patch; if they overlap, the responses (and the patches) can land in the
// wrong order and the row silently keeps the losing value.
//
// So every write is enqueued under its `yearMonth`: writes to the SAME month
// run strictly one after another (in call order, which is gesture order —
// `blur` fires before `click`), writes to DIFFERENT months stay parallel.
//
// A failing task does NOT poison the queue: the next task for that key still
// runs, and only the caller of the failing task sees the rejection.
//
// Pure, framework-free, unit-tested (`saveQueue.test.ts`).

export interface SerialQueue {
  /** Enqueue `task` behind everything already queued for `key`. */
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
  /** Tasks queued or in flight for `key` (0 ⇒ the row is idle). */
  pending(key: string): number;
}

export function createSerialQueue(): SerialQueue {
  const tails = new Map<string, Promise<void>>();
  const counts = new Map<string, number>();

  const bump = (key: string, delta: number): void => {
    const next = (counts.get(key) ?? 0) + delta;
    if (next <= 0) counts.delete(key);
    else counts.set(key, next);
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
        // from growing one entry per month per page-lifetime.
        if (tails.get(key) === tail) tails.delete(key);
      });
      return result;
    },
    pending(key: string): number {
      return counts.get(key) ?? 0;
    },
  };
}
