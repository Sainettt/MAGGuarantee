// The `<LimitsRow>` guarantee-cell state machine (docs/14 §16.3), extracted so
// the mechanics that MUST hold can be unit-tested without a DOM:
//
//   • un-ticking the box WRITES `0` immediately;
//   • ticking the box WRITES NOTHING — it unlocks the input and enters the
//     `unsaved` draft state (writing NULL there would hand the month back the
//     540 km/day fallback, the exact trap this feature removes);
//   • blurring an empty / invalid field un-ticks the box again and announces
//     it, instead of writing anything;
//   • the last positive value is remembered for the session and pre-filled as
//     a DRAFT on re-tick — still unwritten;
//   • NO transition ever produces a `null` write. There is no code path here
//     that can.
//
// Pure, framework-free, unit-tested (`guaranteeCell.test.ts`).

import { formatLimitInput, parseLimitInput } from './limitState';

export interface GuaranteeCellState {
  /** Server value: `null` = not configured, `0` = off, `> 0` = on. */
  value: number | null;
  /**
   * `kmPerSaturday`: its NULL and `0` mean the same thing (the Saturday
   * fallback IS zero), so NULL renders as plain "off".
   */
  nullMeansOff: boolean;
  /** Current input buffer. */
  text: string;
  /** Box ticked over an off month, nothing written yet. */
  draft: boolean;
  /** Last `> 0` value seen this session (session memory, never persisted). */
  lastPositive: number | null;
}

export interface GuaranteeCellAction {
  /** Next input buffer; `undefined` = leave the buffer alone. */
  text?: string;
  /** Next draft flag. */
  draft: boolean;
  /** Value to PUT. `undefined` = write nothing. Never `null`, by design. */
  write?: number;
  /** Move focus into the input (ticking the box). */
  focusInput?: boolean;
  /** Announce «Gwarancja pozostaje wyłączona» to screen readers. */
  announceReverted?: boolean;
  /** Update the session memory with this value. */
  remember?: number;
}

/** Is the guarantee currently OFF on the server? */
export function isOff(state: GuaranteeCellState): boolean {
  if (state.nullMeansOff && state.value == null) return true;
  return state.value === 0;
}

/** Is the checkbox ticked? (server-on, or a local draft over an off month) */
export function isChecked(state: GuaranteeCellState): boolean {
  return !isOff(state) || state.draft;
}

export function toggleGuarantee(
  state: GuaranteeCellState,
  checked: boolean,
): GuaranteeCellAction {
  if (checked) {
    // Ticking writes NOTHING — it only unlocks the input.
    return {
      draft: true,
      text: state.lastPositive != null ? String(state.lastPositive) : '',
      focusInput: true,
    };
  }

  // Remember whatever positive number is on screen before switching off, so
  // an accidental un-tick doesn't cost the admin the value.
  const parsed = parseLimitInput(state.text);
  const remember =
    parsed.kind === 'value' && parsed.value > 0 ? parsed.value : undefined;

  if (isOff(state)) {
    // We were only in a draft — the server already holds "off".
    return {
      draft: false,
      text: formatLimitInput(state.value),
      ...(remember === undefined ? {} : { remember }),
    };
  }
  return {
    draft: false,
    text: '',
    write: 0,
    ...(remember === undefined ? {} : { remember }),
  };
}

export function commitOnBlur(
  state: GuaranteeCellState,
): GuaranteeCellAction {
  const parsed = parseLimitInput(state.text);

  if (parsed.kind !== 'value') {
    // Empty / garbage. NULL is not writable, so there is nothing to save: a
    // draft falls back to "off", a configured cell keeps its stored value.
    return {
      draft: false,
      text: formatLimitInput(state.value),
      ...(state.draft ? { announceReverted: true } : {}),
    };
  }
  if (parsed.value === state.value) {
    return { draft: false };
  }
  if (state.draft && parsed.value === 0 && isOff(state)) {
    // An explicit 0 typed into a draft means "stay off" — already true.
    return { draft: false };
  }
  // Keep the draft until the new value actually lands: a failed write must
  // leave the box ticked so the admin can retry without re-ticking.
  return { draft: state.draft, write: parsed.value };
}
