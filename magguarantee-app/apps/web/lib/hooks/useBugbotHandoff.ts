'use client';

// `useBugbotHandoff` — React state around `openBugbotHandoff` (lib/bugbot).
//
// Deliberately NOT a TanStack `useMutation`: the response is a single-use
// sign-in URL, and the mutation cache would keep it in `data`. The URL lives
// only inside `openBugbotHandoff`'s locals; this hook stores nothing but
// "which kind is in flight" and "did it fail".
//
// `open(kind)` must be called straight from a click handler — it opens the
// blank tab synchronously (before any await) so the popup blocker lets it
// through. A ref guards against double clicks between the click and the
// re-render that disables the buttons.
//
// ONE instance per header (<Header> owns it): the header pills (lg+) and the
// <UserMenu> items (below lg) are two triggers for the same state, so there is
// one pending flag and one inline error.

import { useLocale } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import type { BugbotHandoffKind, Role } from '@magguarantee/shared';

import { getBugbotHandoffUrl } from '@/lib/api/bugbot';
import {
  bugbotKindsFor,
  openBugbotHandoff,
  toBugbotLocale,
  type BugbotHandoffOutcome,
} from '@/lib/bugbot/handoff';

/**
 * Build-time flag (NEXT_PUBLIC_*, inlined by Next — keep the literal
 * `process.env.X` form). Off unless exactly `'true'`: the API answers 404
 * without its `BUGBOT_*` config, so the buttons must not appear by accident.
 */
const BUGBOT_ENABLED = process.env.NEXT_PUBLIC_BUGBOT_ENABLED === 'true';

const NO_KINDS: readonly BugbotHandoffKind[] = [];

export interface UseBugbotHandoffResult {
  /** Forms this user may open; empty when the integration is switched off. */
  kinds: readonly BugbotHandoffKind[];
  /** The kind whose URL is being fetched, `null` when idle. */
  pendingKind: BugbotHandoffKind | null;
  /** The last attempt failed — render the inline error. */
  failed: boolean;
  /** Start a handoff. Call directly from `onClick`. No-op while one is running. */
  open: (kind: BugbotHandoffKind) => void;
  dismissError: () => void;
}

/** @param role the signed-in user's role; `null` while anonymous → no kinds. */
export function useBugbotHandoff(role: Role | null): UseBugbotHandoffResult {
  const locale = toBugbotLocale(useLocale());
  const [pendingKind, setPendingKind] = useState<BugbotHandoffKind | null>(
    null,
  );
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const open = useCallback(
    (kind: BugbotHandoffKind) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setFailed(false);
      setPendingKind(kind);

      // Synchronous up to its first await → `window.open` runs inside the
      // click gesture.
      void openBugbotHandoff({
        openBlank: () => window.open('about:blank', '_blank'),
        fetchUrl: () => getBugbotHandoffUrl(kind, locale),
        assign: (url) => window.location.assign(url),
      })
        .catch((): BugbotHandoffOutcome => 'failed')
        .then((outcome) => {
          if (outcome === 'failed') setFailed(true);
        })
        .finally(() => {
          inFlight.current = false;
          setPendingKind(null);
        });
    },
    [locale],
  );

  const dismissError = useCallback(() => setFailed(false), []);

  return {
    kinds: role ? bugbotKindsFor(role, BUGBOT_ENABLED) : NO_KINDS,
    pendingKind,
    failed,
    open,
    dismissError,
  };
}
