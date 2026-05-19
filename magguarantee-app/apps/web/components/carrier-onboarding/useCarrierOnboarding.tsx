'use client';

// Wizard state for the chained carrier onboarding flow (Carrier → Vehicle →
// Trailer → Driver). Implemented as a React Context — zustand is not yet a
// project dependency and the wizard scope is small enough that Context is
// fine. The state lives in a Provider that wraps the wizard <Sheet>.
//
// State is mirrored to sessionStorage under `carrier-onboarding:active` so an
// accidental F5 mid-flow doesn't strand the operator with a half-onboarded
// carrier and a temp password they never copied. The mirror survives until
// the wizard is explicitly closed.
//
// IMPORTANT: when resuming an existing carrier via the "Dokończ onboarding"
// row action the temporary password is NOT in hand — that was issued exactly
// once on the original POST /carriers and the API stores only a hash. The
// banner is hidden in that case.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { OnboardingStatus } from '@magguarantee/shared';

export type StepNumber = 1 | 2 | 3 | 4;

interface PersistedState {
  carrierId: string | null;
  temporaryPassword: string | null;
  currentStep: StepNumber;
  completedSteps: number[];
  skippedSteps: number[];
}

interface WizardState extends PersistedState {
  active: boolean;
}

interface WizardCtx extends WizardState {
  /** Open the wizard at the carrier step (fresh create flow). */
  start: () => void;
  /**
   * Open the wizard mid-flow for an already-created carrier. Step is
   * inferred from the carrier's `onboardingStatus`.
   */
  resume: (args: { carrierId: string; status: OnboardingStatus }) => void;
  /** Step 1 finished — carrier created, temporary password in hand. */
  carrierCreated: (args: { carrierId: string; temporaryPassword: string }) => void;
  /** Advance from the current step to the next, marking the current as completed. */
  completeCurrentStep: () => void;
  /** Skip the current step (Vehicle, Trailer, or Driver). Never allowed on step 1. */
  skipCurrentStep: () => void;
  /** Close the wizard (preserves nothing). */
  close: () => void;
}

const STORAGE_KEY = 'carrier-onboarding:active';

const Ctx = createContext<WizardCtx | null>(null);

/**
 * Wizard step inferred from the carrier's onboarding status. Used when the
 * operator clicks "Dokończ onboarding" on an existing carrier row.
 */
function stepForStatus(status: OnboardingStatus): StepNumber | null {
  switch (status) {
    case 'PENDING_VEHICLE':
      return 2;
    case 'PENDING_TRAILER':
      return 3;
    case 'PENDING_DRIVER':
      return 4;
    case 'COMPLETE':
      return null;
  }
}

/**
 * When resuming at step N, every prior pending entity step is implicitly
 * "skipped" (the carrier exists but the row hasn't been filled). Step 1
 * (carrier) is always completed by virtue of the carrier existing.
 */
function impliedSkippedFromResume(step: StepNumber): number[] {
  // step is 2|3|4 here — carrier (1) is already done, anything before `step`
  // and after 1 is treated as skipped so the stepper visually communicates
  // "you can still fill these later" without falsely claiming they were
  // submitted.
  const skipped: number[] = [];
  for (let s = 2; s < step; s++) skipped.push(s);
  return skipped;
}

function readPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Partial<PersistedState>;
    if (typeof obj.currentStep !== 'number') return null;
    if (![1, 2, 3, 4].includes(obj.currentStep)) return null;
    return {
      carrierId: typeof obj.carrierId === 'string' ? obj.carrierId : null,
      temporaryPassword:
        typeof obj.temporaryPassword === 'string'
          ? obj.temporaryPassword
          : null,
      currentStep: obj.currentStep as StepNumber,
      completedSteps: Array.isArray(obj.completedSteps)
        ? obj.completedSteps.filter((n) => typeof n === 'number')
        : [],
      skippedSteps: Array.isArray(obj.skippedSteps)
        ? obj.skippedSteps.filter((n) => typeof n === 'number')
        : [],
    };
  } catch {
    return null;
  }
}

function writePersisted(s: PersistedState): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // quota / private mode — silently drop, F5-survival is a niceness.
  }
}

function clearPersisted(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface ProviderProps {
  children: ReactNode;
}

export function CarrierOnboardingProvider({ children }: ProviderProps) {
  const [state, setState] = useState<WizardState>(() => ({
    active: false,
    carrierId: null,
    temporaryPassword: null,
    currentStep: 1,
    completedSteps: [],
    skippedSteps: [],
  }));
  // Hydrate from sessionStorage on mount. We DON'T auto-open the sheet —
  // the operator left the page intentionally; on the next mount we just
  // expose the state so a "Continue setup" affordance can pick it up. F5
  // mid-flow keeps `active: true` so the wizard re-opens at the same step.
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const p = readPersisted();
    if (p) {
      setState({ active: true, ...p });
    }
  }, []);

  // Persist mirror on every meaningful change.
  useEffect(() => {
    if (!state.active) return;
    writePersisted({
      carrierId: state.carrierId,
      temporaryPassword: state.temporaryPassword,
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      skippedSteps: state.skippedSteps,
    });
  }, [
    state.active,
    state.carrierId,
    state.temporaryPassword,
    state.currentStep,
    state.completedSteps,
    state.skippedSteps,
  ]);

  const start = useCallback(() => {
    setState({
      active: true,
      carrierId: null,
      temporaryPassword: null,
      currentStep: 1,
      completedSteps: [],
      skippedSteps: [],
    });
  }, []);

  const resume = useCallback(
    ({ carrierId, status }: { carrierId: string; status: OnboardingStatus }) => {
      const step = stepForStatus(status);
      if (step === null) return;
      const completedSteps = [1];
      const skippedSteps = impliedSkippedFromResume(step);
      setState({
        active: true,
        carrierId,
        // No temp password on resume — see file header.
        temporaryPassword: null,
        currentStep: step,
        completedSteps,
        skippedSteps,
      });
    },
    [],
  );

  const carrierCreated = useCallback(
    ({
      carrierId,
      temporaryPassword,
    }: {
      carrierId: string;
      temporaryPassword: string;
    }) => {
      setState((prev) => ({
        ...prev,
        carrierId,
        temporaryPassword,
        currentStep: 2,
        completedSteps: [...new Set([...prev.completedSteps, 1])],
      }));
    },
    [],
  );

  const completeCurrentStep = useCallback(() => {
    setState((prev) => {
      const cur = prev.currentStep;
      const completed = [...new Set([...prev.completedSteps, cur])];
      // Remove from skipped if it was previously skipped (defensive).
      const skipped = prev.skippedSteps.filter((s) => s !== cur);
      if (cur === 4) {
        // Final step done — close the wizard cleanly.
        clearPersisted();
        return {
          active: false,
          carrierId: null,
          temporaryPassword: null,
          currentStep: 1,
          completedSteps: [],
          skippedSteps: [],
        };
      }
      return {
        ...prev,
        currentStep: (cur + 1) as StepNumber,
        completedSteps: completed,
        skippedSteps: skipped,
      };
    });
  }, []);

  const skipCurrentStep = useCallback(() => {
    setState((prev) => {
      const cur = prev.currentStep;
      // Skipping step 1 isn't meaningful — the carrier needs to exist for the
      // chain to make sense. Caller hides the "Skip" button on step 1 anyway.
      if (cur === 1) return prev;
      const skipped = [...new Set([...prev.skippedSteps, cur])];
      const completed = prev.completedSteps.filter((s) => s !== cur);
      if (cur === 4) {
        clearPersisted();
        return {
          active: false,
          carrierId: null,
          temporaryPassword: null,
          currentStep: 1,
          completedSteps: [],
          skippedSteps: [],
        };
      }
      return {
        ...prev,
        currentStep: (cur + 1) as StepNumber,
        skippedSteps: skipped,
        completedSteps: completed,
      };
    });
  }, []);

  const close = useCallback(() => {
    clearPersisted();
    setState({
      active: false,
      carrierId: null,
      temporaryPassword: null,
      currentStep: 1,
      completedSteps: [],
      skippedSteps: [],
    });
  }, []);

  const value = useMemo<WizardCtx>(
    () => ({
      ...state,
      start,
      resume,
      carrierCreated,
      completeCurrentStep,
      skipCurrentStep,
      close,
    }),
    [
      state,
      start,
      resume,
      carrierCreated,
      completeCurrentStep,
      skipCurrentStep,
      close,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCarrierOnboarding(): WizardCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      'useCarrierOnboarding must be used inside <CarrierOnboardingProvider>',
    );
  }
  return ctx;
}
