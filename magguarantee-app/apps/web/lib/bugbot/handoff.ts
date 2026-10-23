// BugBot handoff — the framework-free part of the header «Zgłoś problem» /
// «Zgłoś pomysł» buttons (<BugbotButtons>). Kept out of the component so the
// node-only vitest setup can cover it (vitest.config.ts: no jsdom, no `.tsx`).
//
// Tab-opening order is the whole point (same reasoning as
// `lib/hooks/useOpenBlobInTab.ts`):
//   1. `openBlank()` — `window.open('about:blank', '_blank')` — runs
//      SYNCHRONOUSLY, before the first `await`, so it is still inside the
//      click's user gesture and the popup blocker lets it through. No
//      `noopener` in the features: that makes `window.open` return `null` and
//      we would lose the handle we navigate afterwards.
//   2. Fetch the one-time URL from our API.
//   3. Cut `opener` (BugBot is another origin and must not script us), then
//      navigate the pre-opened tab.
// A blocked popup (`null` handle) falls back to navigating the current tab; a
// failed request closes the blank tab and reports `failed` for the inline error.
//
// The URL carries a single-use token: it only ever lives in local variables
// here — never logged, never returned, never stored.

import {
  BugbotHandoffLocaleSchema,
  type BugbotHandoffKind,
  type BugbotHandoffLocale,
} from '@magguarantee/shared';

import type { Permission } from '@/lib/auth/permissions';

/**
 * Which BugBot forms a signed-in user gets, from his EFFECTIVE permissions:
 * «Zgłoś problem» for everyone, «Zgłoś pomysł» only with `bugbot.submit_idea`
 * (admin — the API 403s otherwise).
 */
export function bugbotKindsFor(
  permissions: readonly Permission[],
  enabled: boolean,
): readonly BugbotHandoffKind[] {
  if (!enabled) return [];
  return permissions.includes('bugbot.submit_idea') ? ['bug', 'idea'] : ['bug'];
}

/** The UI locale narrowed to what BugBot renders; anything unknown → `pl`. */
export function toBugbotLocale(locale: string): BugbotHandoffLocale {
  const parsed = BugbotHandoffLocaleSchema.safeParse(locale);
  return parsed.success ? parsed.data : 'pl';
}

/** Only absolute http(s) URLs may be navigated to — never `javascript:` & co. */
export function isSafeHandoffUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const { protocol } = new URL(value);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** The slice of `Window` the flow touches — lets tests pass a plain object. */
export interface HandoffTab {
  opener: unknown;
  location: { href: string };
  close: () => void;
}

export interface OpenBugbotHandoffDeps {
  /** `() => window.open('about:blank', '_blank')`. Called synchronously. */
  openBlank: () => HandoffTab | null;
  /** Resolves the one-time URL (`getBugbotHandoffUrl`). */
  fetchUrl: () => Promise<string>;
  /** Same-tab fallback when the popup was blocked: `window.location.assign`. */
  assign: (url: string) => void;
}

/**
 * - `new-tab`  — the pre-opened tab now points at BugBot;
 * - `same-tab` — the popup was blocked, the current tab navigates instead;
 * - `failed`   — request failed or the URL was not http(s); the blank tab
 *                (if any) is closed. The caller shows the inline error.
 */
export type BugbotHandoffOutcome = 'new-tab' | 'same-tab' | 'failed';

/**
 * Runs the handoff. Must be CALLED from the click handler: everything up to the
 * first `await` (i.e. `openBlank`) executes synchronously inside the gesture.
 */
export async function openBugbotHandoff({
  openBlank,
  fetchUrl,
  assign,
}: OpenBugbotHandoffDeps): Promise<BugbotHandoffOutcome> {
  let tab: HandoffTab | null;
  try {
    tab = openBlank();
  } catch {
    // Some embedders throw instead of returning `null`; same fallback.
    tab = null;
  }

  let url: string;
  try {
    url = await fetchUrl();
  } catch {
    tab?.close();
    return 'failed';
  }

  if (!isSafeHandoffUrl(url)) {
    tab?.close();
    return 'failed';
  }

  if (tab === null) {
    assign(url);
    return 'same-tab';
  }

  tab.opener = null;
  tab.location.href = url;
  return 'new-tab';
}
