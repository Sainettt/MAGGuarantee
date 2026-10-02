// BugBot handoff (header «Zgłoś problem» / «Zgłoś pomysł»): who gets which
// button, locale narrowing, the http(s) guard, and the tab-opening flow with a
// fake `window` — the parts of <BugbotButtons> that do not need a DOM
// (vitest here is node-only, see vitest.config.ts).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoleSchema, type Role } from '@magguarantee/shared';

import {
  bugbotKindsFor,
  isSafeHandoffUrl,
  openBugbotHandoff,
  toBugbotLocale,
  type HandoffTab,
} from './handoff';

const ALL_ROLES: readonly Role[] = RoleSchema.options;
const NON_ADMIN = ALL_ROLES.filter((r) => r !== 'admin');
const HANDOFF_URL =
  'https://bugbot.example.eu/handoff?token=eyJhbGciOiJIUzI1NiJ9.e30.sig';

/** A `Window` stand-in that records the order of what the flow does to it. */
function fakeTab() {
  const events: string[] = [];
  let opener: unknown = { origin: 'app' };
  let href = 'about:blank';
  const tab: HandoffTab = {
    get opener() {
      return opener;
    },
    set opener(value: unknown) {
      events.push(value === null ? 'opener=null' : 'opener=set');
      opener = value;
    },
    location: {
      get href() {
        return href;
      },
      set href(value: string) {
        events.push('navigate');
        href = value;
      },
    },
    close: vi.fn(() => {
      events.push('close');
    }),
  };
  return { tab, events };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('bugbotKindsFor', () => {
  it('fixture sanity: 8 roles, 7 of them non-admin', () => {
    expect(ALL_ROLES).toHaveLength(8);
    expect(NON_ADMIN).toHaveLength(7);
  });

  it.each(ALL_ROLES)('flag off → nothing for %s', (role) => {
    expect(bugbotKindsFor(role, false)).toEqual([]);
  });

  it('admin → both buttons, bug first', () => {
    expect(bugbotKindsFor('admin', true)).toEqual(['bug', 'idea']);
  });

  it.each(NON_ADMIN)('%s → «Zgłoś problem» only', (role) => {
    expect(bugbotKindsFor(role, true)).toEqual(['bug']);
  });
});

describe('toBugbotLocale', () => {
  it.each([
    ['pl', 'pl'],
    ['en', 'en'],
    ['de', 'pl'],
    ['EN', 'pl'],
    ['', 'pl'],
  ] as const)('%j → %s', (input, expected) => {
    expect(toBugbotLocale(input)).toBe(expected);
  });
});

describe('isSafeHandoffUrl', () => {
  it.each([HANDOFF_URL, 'http://localhost:4000/handoff?token=x'])(
    'accepts %s',
    (url) => {
      expect(isSafeHandoffUrl(url)).toBe(true);
    },
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'ftp://bugbot.example.eu/x',
    '/relative/path',
    '',
    'not a url',
  ])('rejects %j', (url) => {
    expect(isSafeHandoffUrl(url)).toBe(false);
  });

  it.each([undefined, null, 42, { url: HANDOFF_URL }])(
    'rejects non-string %j',
    (value) => {
      expect(isSafeHandoffUrl(value)).toBe(false);
    },
  );
});

describe('openBugbotHandoff', () => {
  const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const;
  let consoleSpies: { mockRestore: () => void }[] = [];

  beforeEach(() => {
    consoleSpies = consoleMethods.map((m) =>
      vi.spyOn(console, m).mockImplementation(() => undefined),
    );
  });

  afterEach(() => {
    for (const spy of consoleSpies) {
      // The URL carries a one-time token: nothing may be logged, ever.
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });

  it('opens the blank tab synchronously, before the URL request resolves', async () => {
    const { tab } = fakeTab();
    const openBlank = vi.fn(() => tab);
    const pending = deferred<string>();
    const fetchUrl = vi.fn(() => pending.promise);
    const assign = vi.fn();

    const run = openBugbotHandoff({ openBlank, fetchUrl, assign });

    // No microtask has run yet: the popup was opened inside the gesture.
    expect(openBlank).toHaveBeenCalledTimes(1);
    expect(openBlank.mock.invocationCallOrder[0]).toBeLessThan(
      fetchUrl.mock.invocationCallOrder[0] ?? Infinity,
    );
    expect(tab.location.href).toBe('about:blank');

    pending.resolve(HANDOFF_URL);
    await expect(run).resolves.toBe('new-tab');
  });

  it('success → cuts opener, then points the pre-opened tab at the URL', async () => {
    const { tab, events } = fakeTab();
    const assign = vi.fn();

    const outcome = await openBugbotHandoff({
      openBlank: () => tab,
      fetchUrl: () => Promise.resolve(HANDOFF_URL),
      assign,
    });

    expect(outcome).toBe('new-tab');
    expect(tab.opener).toBeNull();
    expect(tab.location.href).toBe(HANDOFF_URL);
    expect(events).toEqual(['opener=null', 'navigate']);
    expect(tab.close).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it('popup blocked (window.open → null) → navigates the current tab', async () => {
    const assign = vi.fn();

    const outcome = await openBugbotHandoff({
      openBlank: () => null,
      fetchUrl: () => Promise.resolve(HANDOFF_URL),
      assign,
    });

    expect(outcome).toBe('same-tab');
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(HANDOFF_URL);
  });

  it('window.open throwing is treated like a blocked popup', async () => {
    const assign = vi.fn();

    const outcome = await openBugbotHandoff({
      openBlank: () => {
        throw new Error('blocked by embedder');
      },
      fetchUrl: () => Promise.resolve(HANDOFF_URL),
      assign,
    });

    expect(outcome).toBe('same-tab');
    expect(assign).toHaveBeenCalledWith(HANDOFF_URL);
  });

  it('request fails → closes the blank tab, navigates nowhere', async () => {
    const { tab, events } = fakeTab();
    const assign = vi.fn();

    const outcome = await openBugbotHandoff({
      openBlank: () => tab,
      fetchUrl: () => Promise.reject(new Error('HTTP 404')),
      assign,
    });

    expect(outcome).toBe('failed');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('about:blank');
    expect(events).toEqual(['close']);
    expect(assign).not.toHaveBeenCalled();
  });

  it('request fails with the popup blocked → failed, no same-tab fallback', async () => {
    const assign = vi.fn();

    const outcome = await openBugbotHandoff({
      openBlank: () => null,
      fetchUrl: () => Promise.reject(new Error('HTTP 429')),
      assign,
    });

    expect(outcome).toBe('failed');
    expect(assign).not.toHaveBeenCalled();
  });

  it.each(['javascript:alert(document.cookie)', '/handoff?token=x', ''])(
    'a non-http(s) URL %j is an error: tab closed, nothing navigated',
    async (badUrl) => {
      const { tab } = fakeTab();
      const assign = vi.fn();

      const outcome = await openBugbotHandoff({
        openBlank: () => tab,
        fetchUrl: () => Promise.resolve(badUrl),
        assign,
      });

      expect(outcome).toBe('failed');
      expect(tab.close).toHaveBeenCalledTimes(1);
      expect(tab.location.href).toBe('about:blank');
      expect(assign).not.toHaveBeenCalled();
    },
  );

  it('a non-http(s) URL with the popup blocked is not assigned either', async () => {
    const assign = vi.fn();

    const outcome = await openBugbotHandoff({
      openBlank: () => null,
      fetchUrl: () => Promise.resolve('javascript:alert(1)'),
      assign,
    });

    expect(outcome).toBe('failed');
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('bugbot messages', () => {
  type Messages = { [key: string]: string | Messages };

  function lookup(locale: 'pl' | 'en', key: string): unknown {
    const file = fileURLToPath(
      new URL(`../../messages/${locale}.json`, import.meta.url),
    );
    let node: unknown = JSON.parse(readFileSync(file, 'utf8')) as Messages;
    for (const part of key.split('.')) {
      if (typeof node !== 'object' || node === null) return undefined;
      node = (node as Record<string, unknown>)[part];
    }
    return node;
  }

  it.each(['pl', 'en'] as const)(
    'every key <BugbotButtons> renders exists in %s.json',
    (locale) => {
      const keys = ['bugbot.report', 'bugbot.idea', 'bugbot.error', 'common.close'];
      expect(
        keys.filter((k) => typeof lookup(locale, k) !== 'string'),
      ).toEqual([]);
    },
  );
});
