'use client';

// Persists React Hook Form values to sessionStorage during the page session.
// Used in CREATE mode only — in edit mode the server is the source of truth,
// so we never spy on those forms.
//
// Behavior:
// - When `enabled`, subscribes to `form.watch()` with a 300ms debounce and
//   writes the latest values back to sessionStorage on every change.
// - `hydrate()` is a manual call: it reads the stored draft (if any) and
//   calls `form.reset(draft)`. The caller decides when to invoke it —
//   typically right after a `form.reset(defaults)` triggered by the sheet
//   opening, so a stored draft wins over the empty defaults. If there is
//   no stored draft, `hydrate()` is a no-op and the empty defaults stand.
// - `clear()` removes the entry from storage but does NOT mutate the form —
//   the caller decides whether to call `form.reset()` afterwards (e.g. on
//   successful submit, or on an explicit "Clear" button).
//
// Closing the modal / pressing Esc / clicking outside does NOT clear the
// draft. That's the whole point — we want the user's typing to survive
// accidental dismissal of the sheet.
//
// SSR-safe: every sessionStorage access is guarded with a window check so
// the hook can run during Next.js server-side rendering without crashing.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

interface Options {
  /**
   * Toggle persistence on/off. Pass `false` for edit mode so we don't
   * accidentally trample server-loaded values with a stale draft.
   */
  enabled: boolean;
}

interface DraftHandle {
  /**
   * Read the stored draft (if any) and `form.reset(draft)` it into the
   * form. Safe to call multiple times — no draft means no-op. Caller
   * usually invokes this right after their own `form.reset(defaults)`
   * when the sheet opens, so the draft layered on top wins.
   */
  hydrate: () => void;
  /**
   * Erase the persisted draft. Does not touch the form state — call
   * `form.reset(emptyDefaults)` separately if you also want to clear the
   * inputs in the UI.
   */
  clear: () => void;
}

const DEBOUNCE_MS = 300;

function readDraft(key: string): unknown {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    // Corrupted JSON or storage blocked — ignore and act as if there's no
    // draft. Don't surface to the user; this is a best-effort niceness.
    return null;
  }
}

function writeDraft(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode — silently drop.
  }
}

function removeDraft(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function useFormDraft<T extends FieldValues>(
  form: UseFormReturn<T>,
  storageKey: string,
  { enabled }: Options,
): DraftHandle {
  // RHF's `useForm` returns a fresh object every render. To keep our
  // returned `hydrate` / `clear` callbacks referentially stable (so
  // consumers can safely list them in effect deps), funnel `form` through
  // a ref — the callbacks read it lazily at call time.
  const formRef = useRef(form);
  formRef.current = form;

  // Subscribe to form changes; debounce so a fast typist doesn't pound
  // sessionStorage on every keystroke. We use a plain setTimeout — no
  // lodash, no extra deps.
  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const subscription = formRef.current.watch((values) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        writeDraft(storageKey, values);
      }, DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [enabled, storageKey]);

  const hydrate = useCallback(() => {
    if (!enabled) return;
    const draft = readDraft(storageKey);
    if (draft && typeof draft === 'object') {
      formRef.current.reset(draft as T);
    }
  }, [enabled, storageKey]);

  const clear = useCallback(() => {
    removeDraft(storageKey);
  }, [storageKey]);

  // Memoize so consumers can safely list `draft` in effect deps without
  // triggering a re-run on every render.
  return useMemo(() => ({ hydrate, clear }), [hydrate, clear]);
}
