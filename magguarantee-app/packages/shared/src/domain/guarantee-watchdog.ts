// Guarantee watchdog — pure live-state computation for the "zgłaszać wyjazdy"
// obligation (Guarantee Watchdog plan §1/§4, 2026-07-07).
//
// A guaranteed vehicle (`Vehicle.agreement = true`) must have a wyjazd reported
// at least every N Polish working days. This function classifies ONE vehicle's
// current state from three inputs the caller has already resolved:
//   - whether it has an active delegation (zgloszony | gotowy | w_trasie),
//   - the date of its last zjechał return, and
//   - its agreementSince date (fallback anchor for a never-departed vehicle).
//
// Pure TypeScript, side-effect free, schema-agnostic: NO Prisma, no Nest, no
// Next, no clock reads — every date is passed in. Both the API cron and the web
// board bundle the same code so the deadline / daysLeft math never drifts.
//
// ⚠️ Working-day arithmetic is REUSED from `./polish-calendar`
// (`addPolishWorkingDays` / `workingDaysBetween`) — the Polish working-day
// engine, NOT `eu-calendar.ts` (that is the heavy-vehicle DRIVING-BAN calendar,
// the WRONG set here; `polish-calendar.ts` carries the same warning).
//
// Date convention: identical to `bucketForAnchor` — callers hand Warsaw
// calendar dates; the engine only reads `getFullYear/getMonth/getDate`, so
// time-of-day, DST and UTC offset never affect the count. `anchorAt` /
// `deadlineAt` come straight from the engine (local-midnight Dates).
//
// This function does NOT decide which reminder email to send — that is the
// cron's job because it needs the per-episode sent-flags (plan §1/§5). We only
// classify live state. `reminderOffsets` is accepted for config validation /
// future use and, optionally, for the pure `reminderThreshold` helper below.

import { addPolishWorkingDays, workingDaysBetween } from './polish-calendar';

// ─── Public types ────────────────────────────────────────

/**
 * Live watchdog state for one guaranteed vehicle (plan §1 "Состояния").
 *
 *   - `inactive`  — no anchor at all (never departed AND no agreementSince);
 *                   the counter cannot start, the vehicle is off the board.
 *   - `ok_active` — an active delegation (zgloszony/gotowy/w_trasie) silences
 *                   the counter; the obligation is being met right now.
 *   - `counting`  — the counter is running and the deadline has NOT passed
 *                   (`daysLeft >= 0`, incl. the deadline day itself).
 *   - `violated`  — the deadline has passed (`daysLeft < 0`).
 */
export type GuaranteeWatchdogStatus =
  | 'inactive'
  | 'ok_active'
  | 'counting'
  | 'violated';

/** Where the anchor came from (plan §3 `GuaranteeAnchorSource`). */
export type GuaranteeAnchorSource = 'zjechal' | 'agreement';

/** Configuration knobs (env-driven in the cron — plan §5). */
export interface GuaranteeWatchdogConfig {
  /**
   * Working days from the anchor to the deadline (default 10, plan §1). The
   * anchor day itself is NOT counted — same convention as
   * {@link addPolishWorkingDays}, so the deadline is the end of the Nth working
   * day after the anchor.
   */
  readonly deadlineWorkingDays: number;
  /**
   * Working-day offsets before the deadline at which reminders are due
   * (default `[3, 1]`, plan §1/§5). Accepted for validation and the optional
   * {@link reminderThreshold} helper; this function makes NO send decision.
   */
  readonly reminderOffsets: readonly number[];
}

/** Resolved inputs for one vehicle (plan §4 signature). */
export interface GuaranteeWatchdogInput {
  /** "Today" as a Warsaw calendar date (see {@link BUSINESS_TZ}). */
  readonly today: Date;
  /** True while a delegation in zgloszony/gotowy/w_trasie exists (anulowany excluded). */
  readonly hasActiveDelegation: boolean;
  /** `date(actualReturnAt)` of the last zjechał delegation, or `null` if never. */
  readonly lastReturnAt: Date | null;
  /** `Vehicle.agreementSince`, or `null` if unset. Fallback anchor. */
  readonly agreementSince: Date | null;
  /** Deadline / reminder configuration. */
  readonly config: GuaranteeWatchdogConfig;
}

/**
 * Live watchdog result. Anchor-related fields are `null` exactly when the
 * status carries no running counter:
 *   - `inactive`  → all four are `null` (no anchor).
 *   - `ok_active` → all four are `null` (counter deliberately silenced; a stale
 *                   deadline would be misleading, so we do NOT report it — see
 *                   the contract note on {@link computeGuaranteeWatchdog}).
 *   - `counting` / `violated` → all four are populated.
 */
export interface GuaranteeWatchdogResult {
  readonly status: GuaranteeWatchdogStatus;
  /** Cycle anchor (local-midnight Date), or `null` when there is no counter. */
  readonly anchorAt: Date | null;
  /** Which input produced the anchor, or `null` when there is no counter. */
  readonly anchorSource: GuaranteeAnchorSource | null;
  /** Deadline = anchor + `deadlineWorkingDays` working days, or `null`. */
  readonly deadlineAt: Date | null;
  /** Signed working days `today → deadlineAt` (0 = today, <0 = past), or `null`. */
  readonly daysLeft: number | null;
}

// ─── Constants ───────────────────────────────────────────

/**
 * Default deadline window: a guaranteed vehicle must report a wyjazd within
 * this many Polish working days of its last return / agreement start (plan §1,
 * "10 рабочих дней"). Injectable via config for tests / env changes.
 */
export const GUARANTEE_DEADLINE_WORKING_DAYS = 10;

/**
 * Default reminder offsets (working days before the deadline): D-3 and D-1
 * (plan §1/§5). Injectable via config.
 */
export const GUARANTEE_REMINDER_OFFSETS: readonly number[] = [3, 1];

// ─── Public API ──────────────────────────────────────────

/**
 * Classify one guaranteed vehicle's live watchdog state (plan §1/§4).
 *
 * Decision order (short-circuits top to bottom):
 *   1. `hasActiveDelegation` → `ok_active`, counter silenced. **Contract note:**
 *      we return `null` for every anchor field here. The plan allows either
 *      "report anchor for context OR null" — nulling is the cleaner contract
 *      because the counter is genuinely off, so a stale deadline (e.g. from the
 *      previous cycle's old return) would be misleading on the board. Callers
 *      that want the anchor while active can read the delegation directly.
 *   2. `anchor = lastReturnAt ?? agreementSince`. If both are `null` →
 *      `inactive` (no counter can start), all fields `null`.
 *   3. Otherwise the counter runs: `anchorSource` is `'zjechal'` when
 *      `lastReturnAt` provided the anchor, else `'agreement'`;
 *      `deadlineAt = addPolishWorkingDays(anchor, config.deadlineWorkingDays)`
 *      (anchor day excluded);
 *      `daysLeft   = workingDaysBetween(today, deadlineAt)` (signed);
 *      `status = 'counting'` when `daysLeft >= 0` (incl. the deadline day),
 *      else `'violated'`.
 *
 * Pure and side-effect free: it does NOT decide which email to send (the cron
 * owns that via per-episode sent-flags). `config.reminderOffsets` is not used
 * in the classification here — see {@link reminderThreshold} for the optional
 * pure mapping.
 */
export function computeGuaranteeWatchdog(
  input: GuaranteeWatchdogInput,
): GuaranteeWatchdogResult {
  const { today, hasActiveDelegation, lastReturnAt, agreementSince, config } =
    input;

  if (hasActiveDelegation) {
    return {
      status: 'ok_active',
      anchorAt: null,
      anchorSource: null,
      deadlineAt: null,
      daysLeft: null,
    };
  }

  const anchorAt = lastReturnAt ?? agreementSince;
  if (anchorAt === null) {
    return {
      status: 'inactive',
      anchorAt: null,
      anchorSource: null,
      deadlineAt: null,
      daysLeft: null,
    };
  }

  const anchorSource: GuaranteeAnchorSource =
    lastReturnAt !== null ? 'zjechal' : 'agreement';
  const deadlineAt = addPolishWorkingDays(anchorAt, config.deadlineWorkingDays);
  const daysLeft = workingDaysBetween(today, deadlineAt);
  const status: GuaranteeWatchdogStatus = daysLeft < 0 ? 'violated' : 'counting';

  return { status, anchorAt, anchorSource, deadlineAt, daysLeft };
}

/**
 * Optional pure helper for the cron: given the current signed `daysLeft` and
 * the configured `reminderOffsets`, return the largest offset that is *due*
 * (i.e. `daysLeft <= offset`), or `null` when none is due yet.
 *
 * Example with `reminderOffsets = [3, 1]`:
 *   - `daysLeft = 5` → `null` (nothing due)
 *   - `daysLeft = 3` → `3`    (D-3 due)
 *   - `daysLeft = 1` → `1`    (D-1 due; and D-3 already passed)
 *   - `daysLeft = 0` → `1`    (still the most-urgent reached threshold)
 *
 * This makes NO send decision on its own — the cron still dedups via
 * per-episode sent-flags (plan §1). It exists purely so the offset→threshold
 * mapping lives next to the state math and is unit-testable in isolation.
 * Offsets are compared largest-first so the returned value is the most urgent
 * reminder whose threshold `daysLeft` has reached.
 */
export function reminderThreshold(
  daysLeft: number,
  reminderOffsets: readonly number[],
): number | null {
  let due: number | null = null;
  for (const offset of reminderOffsets) {
    if (daysLeft <= offset && (due === null || offset < due)) {
      due = offset;
    }
  }
  return due;
}
