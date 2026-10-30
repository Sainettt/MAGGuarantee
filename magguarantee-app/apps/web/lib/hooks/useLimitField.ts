'use client';

// State of ONE limit field of `<WeekEditPanel>` in single-week mode (docs/14
// §18.5.1–§18.5.3). Two kinds:
//
//   • `guarantee` — km/day and km/Saturday: a checkbox + a number. Every
//     transition comes from the pure machine in `lib/limits/guaranteeCell`
//     (reused as is from the old monthly `<LimitsRow>`): un-ticking writes `0`,
//     ticking writes nothing (`unsaved` draft), an empty blur un-ticks again,
//     typing `0` switches off, and no path can write NULL.
//   • `rate` — €/km: a number only (a price has no on/off state, §16.1).
//
// The hook owns the input buffer, the draft flag, the save status of the
// field (spinner → green border ~0,8 s; red border + rollback on failure) and
// the session memory of the last positive value. Writing is delegated to
// `onCommit`, which the page serializes per week.
//
// Enter / Shift+Enter («save and move to the next / previous week») go
// through `commitForEnter`: an invalid value keeps the field (marked invalid)
// instead of silently reverting it like a blur does.

import { useEffect, useRef, useState } from 'react';

import {
  commitOnBlur,
  isOff as isGuaranteeOff,
  toggleGuarantee,
  type GuaranteeCellAction,
  type GuaranteeCellState,
} from '@/lib/limits/guaranteeCell';
import { formatLimitInput, parseLimitInput } from '@/lib/limits/limitState';

export type LimitFieldStatus = 'idle' | 'saving' | 'success' | 'error';

export interface UseLimitFieldOptions {
  kind: 'guarantee' | 'rate';
  /** Server value: `null` = not configured, `0` = off / zero, `> 0` = value. */
  value: number | null;
  /** km/Saturday: its NULL and `0` both mean "off". */
  nullMeansOff?: boolean;
  /** Persist a value. Rejects on failure. */
  onCommit: (value: number) => Promise<void>;
  /** «Gwarancja pozostaje wyłączona» — announced when a draft is dropped. */
  revertedAnnouncement: string;
}

export interface LimitField {
  text: string;
  setText: (text: string) => void;
  /** The checkbox is ticked (rate: always `true`). */
  checked: boolean;
  /** The input accepts typing (an un-ticked guarantee shows a read-only `0`). */
  editable: boolean;
  /** Ticked over an off value, nothing written yet (§16.3 `unsaved`). */
  unsaved: boolean;
  /** A positive value is remembered from this session (short `unsaved` line). */
  hasRemembered: boolean;
  status: LimitFieldStatus;
  /** Enter was pressed on a value that cannot be saved. */
  invalid: boolean;
  announcement: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  checkboxRef: React.RefObject<HTMLInputElement | null>;
  onToggle: (checked: boolean) => void;
  /** Wire to the checkbox label's `onPointerDown` (see `handleBlur`). */
  onTogglePointerDown: () => void;
  onBlur: () => void;
  onFocus: () => void;
  /** Save like a blur; `invalid` keeps the field where it is. */
  commitForEnter: () => 'ok' | 'invalid';
  /** Esc: drop the edit. `false` ⇒ there was nothing to revert. */
  revert: () => boolean;
  /**
   * The number on screen for the «Maks. w tygodniu» hint: `0` when switched
   * off, the typed value when valid, `null` when the caller should use the
   * stored value.
   */
  liveValue: () => number | null;
  /** Focus the input when typing is possible, otherwise the checkbox. */
  focus: () => void;
}

export function useLimitField({
  kind,
  value,
  nullMeansOff = false,
  onCommit,
  revertedAnnouncement,
}: UseLimitFieldOptions): LimitField {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  // Set while the pointer goes down on THIS field's checkbox, so the blur it
  // causes doesn't commit the text the toggle is about to override.
  const togglingRef = useRef(false);
  // Set once Enter committed; the blur that follows must not commit again.
  const skipBlurRef = useRef(false);
  const lastPositive = useRef<number | null>(
    value != null && value > 0 ? value : null,
  );

  const [text, setTextState] = useState(() => formatLimitInput(value));
  const [draft, setDraft] = useState(false);
  const [status, setStatus] = useState<LimitFieldStatus>('idle');
  const [invalid, setInvalid] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  // Mirror external changes (refetch, optimistic patch, «Kopiuj z tyg.»).
  useEffect(() => {
    setTextState(formatLimitInput(value));
    if (value != null && value > 0) lastPositive.current = value;
    // A real value landed ⇒ the draft has been persisted (or overridden).
    if (!(value === 0 || (nullMeansOff && value == null))) setDraft(false);
  }, [value, nullMeansOff]);

  useEffect(() => {
    if (status !== 'success') return;
    const timer = window.setTimeout(() => setStatus('idle'), 800);
    return () => window.clearTimeout(timer);
  }, [status]);

  const machineState: GuaranteeCellState = {
    value,
    nullMeansOff,
    text,
    draft,
    lastPositive: lastPositive.current,
  };

  const off = kind === 'guarantee' && isGuaranteeOff(machineState);
  const checked = !off || draft;
  const editable = checked;
  const unsaved = off && draft;

  const commit = async (next: number): Promise<void> => {
    setStatus('saving');
    try {
      await onCommit(next);
      setStatus('success');
    } catch {
      setTextState(formatLimitInput(value));
      setStatus('error');
    }
  };

  // Apply the effects of one machine transition — the hook decides nothing
  // itself, which keeps "un-tick writes 0 / tick writes nothing / never NULL"
  // testable in `guaranteeCell.test.ts`.
  const apply = (action: GuaranteeCellAction): void => {
    if (action.remember !== undefined) lastPositive.current = action.remember;
    if (action.text !== undefined) setTextState(action.text);
    setDraft(action.draft);
    setAnnouncement(action.announceReverted ? revertedAnnouncement : '');
    if (action.focusInput) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (action.write !== undefined) void commit(action.write);
  };

  /** The rate's blur: no checkbox, no draft — save a valid change, else revert. */
  const rateCommit = (): void => {
    const parsed = parseLimitInput(text);
    if (parsed.kind !== 'value') {
      setTextState(formatLimitInput(value));
      return;
    }
    if (parsed.value === value) return;
    void commit(parsed.value);
  };

  const blurCommit = (): void => {
    if (kind === 'rate') rateCommit();
    else if (editable) apply(commitOnBlur(machineState));
  };

  return {
    text,
    setText: (next) => {
      skipBlurRef.current = false;
      setInvalid(false);
      if (status === 'error') setStatus('idle');
      setTextState(next);
    },
    checked,
    editable,
    unsaved,
    hasRemembered: lastPositive.current != null,
    status,
    invalid,
    announcement,
    inputRef,
    checkboxRef,
    onToggle: (next) => {
      // A write of this field is in flight — let it land first.
      if (status === 'saving' || kind === 'rate') return;
      setInvalid(false);
      apply(toggleGuarantee(machineState, next));
    },
    onTogglePointerDown: () => {
      togglingRef.current = true;
      window.setTimeout(() => {
        togglingRef.current = false;
      }, 0);
    },
    onBlur: () => {
      if (togglingRef.current || skipBlurRef.current) return;
      if (invalid) {
        // Leaving an invalid value by Tab / click behaves like before: revert.
        setInvalid(false);
      }
      blurCommit();
    },
    onFocus: () => {
      skipBlurRef.current = false;
    },
    commitForEnter: () => {
      if (!editable) return 'ok';
      if (parseLimitInput(text).kind === 'invalid') {
        setInvalid(true);
        return 'invalid';
      }
      skipBlurRef.current = true;
      blurCommit();
      return 'ok';
    },
    revert: () => {
      setInvalid(false);
      const stored = formatLimitInput(value);
      if (draft) {
        apply({ draft: false, text: stored, announceReverted: true });
        return true;
      }
      if (editable && text !== stored) {
        setTextState(stored);
        return true;
      }
      return false;
    },
    liveValue: () => {
      if (!checked) return 0;
      const parsed = parseLimitInput(text);
      return parsed.kind === 'value' ? parsed.value : null;
    },
    focus: () => {
      if (editable) {
        inputRef.current?.focus();
        inputRef.current?.select();
      } else {
        checkboxRef.current?.focus();
      }
    },
  };
}
