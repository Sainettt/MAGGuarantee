// Serialization of same-week writes (key `YYYY-Www`) — the checkbox × save-on-blur race.

import { describe, expect, it } from 'vitest';

import { createSerialQueue } from './saveQueue';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSerialQueue', () => {
  it('runs same-key tasks strictly in call order, never overlapping', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const first = deferred<void>();
    const second = deferred<void>();

    // Gesture order: the blur commit is enqueued first, the checkbox second.
    const blur = queue.run('2026-W02', async () => {
      log.push('blur:start');
      await first.promise;
      log.push('blur:end');
    });
    const toggle = queue.run('2026-W02', async () => {
      log.push('toggle:start');
      await second.promise;
      log.push('toggle:end');
    });

    await Promise.resolve();
    // The second task must NOT have started while the first is in flight.
    expect(log).toEqual(['blur:start']);

    first.resolve();
    await blur;
    await Promise.resolve();
    expect(log).toEqual(['blur:start', 'blur:end', 'toggle:start']);

    second.resolve();
    await toggle;
    expect(log).toEqual([
      'blur:start',
      'blur:end',
      'toggle:start',
      'toggle:end',
    ]);
  });

  it('keeps different weeks parallel', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const jan = deferred<void>();

    const a = queue.run('2026-W01', async () => {
      log.push('w01:start');
      await jan.promise;
      log.push('w01:end');
    });
    const b = queue.run('2026-W02', async () => {
      log.push('w02:start');
    });

    await b;
    expect(log).toEqual(['w01:start', 'w02:start']);
    jan.resolve();
    await a;
  });

  it('a rejected task does not poison the queue', async () => {
    const queue = createSerialQueue();
    const failing = queue.run('2026-W03', () =>
      Promise.reject(new Error('boom')),
    );
    await expect(failing).rejects.toThrow('boom');

    const after = await queue.run('2026-W03', () => Promise.resolve('ok'));
    expect(after).toBe('ok');
  });

  it('reports pending work per key and clears it when idle', async () => {
    const queue = createSerialQueue();
    const gate = deferred<void>();
    const task = queue.run('2026-W04', () => gate.promise);

    expect(queue.pending('2026-W04')).toBe(1);
    expect(queue.pending('2026-W05')).toBe(0);

    gate.resolve();
    await task;
    // Give the internal bookkeeping its microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.pending('2026-W04')).toBe(0);
  });

  it('notifies subscribers on every pending change and counts all keys', async () => {
    const queue = createSerialQueue();
    const seen: number[] = [];
    const unsubscribe = queue.subscribe(() => seen.push(queue.totalPending()));
    const gate = deferred<void>();
    const versionBefore = queue.getVersion();

    const a = queue.run('2026-W10', () => gate.promise);
    const b = queue.run('2026-W11', () => Promise.resolve());
    expect(queue.totalPending()).toBe(2);
    expect(queue.getVersion()).toBeGreaterThan(versionBefore);

    await b;
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.totalPending()).toBe(1);

    gate.resolve();
    await a;
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.totalPending()).toBe(0);
    expect(seen).toEqual([1, 2, 1, 0]);

    unsubscribe();
    await queue.run('2026-W12', () => Promise.resolve());
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([1, 2, 1, 0]);
  });

  it('propagates each task own result, not the predecessor own', async () => {
    const queue = createSerialQueue();
    const first = queue.run('2026-W06', () => Promise.reject(new Error('one')));
    const second = queue.run('2026-W06', () => Promise.resolve(2));
    await expect(first).rejects.toThrow('one');
    await expect(second).resolves.toBe(2);
  });
});
