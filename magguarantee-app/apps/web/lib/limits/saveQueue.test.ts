// Serialization of same-month writes — the checkbox × save-on-blur race.

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
    const blur = queue.run('2026-02', async () => {
      log.push('blur:start');
      await first.promise;
      log.push('blur:end');
    });
    const toggle = queue.run('2026-02', async () => {
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

  it('keeps different months parallel', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const jan = deferred<void>();

    const a = queue.run('2026-01', async () => {
      log.push('jan:start');
      await jan.promise;
      log.push('jan:end');
    });
    const b = queue.run('2026-02', async () => {
      log.push('feb:start');
    });

    await b;
    expect(log).toEqual(['jan:start', 'feb:start']);
    jan.resolve();
    await a;
  });

  it('a rejected task does not poison the queue', async () => {
    const queue = createSerialQueue();
    const failing = queue.run('2026-03', () =>
      Promise.reject(new Error('boom')),
    );
    await expect(failing).rejects.toThrow('boom');

    const after = await queue.run('2026-03', () => Promise.resolve('ok'));
    expect(after).toBe('ok');
  });

  it('reports pending work per key and clears it when idle', async () => {
    const queue = createSerialQueue();
    const gate = deferred<void>();
    const task = queue.run('2026-04', () => gate.promise);

    expect(queue.pending('2026-04')).toBe(1);
    expect(queue.pending('2026-05')).toBe(0);

    gate.resolve();
    await task;
    // Give the internal bookkeeping its microtask.
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.pending('2026-04')).toBe(0);
  });

  it('propagates each task own result, not the predecessor own', async () => {
    const queue = createSerialQueue();
    const first = queue.run('2026-06', () => Promise.reject(new Error('one')));
    const second = queue.run('2026-06', () => Promise.resolve(2));
    await expect(first).rejects.toThrow('one');
    await expect(second).resolves.toBe(2);
  });
});
