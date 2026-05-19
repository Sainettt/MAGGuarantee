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
//
// After the May 2026 drop of `Carrier.onboardingStatus`, this hook reads the
// derived `onboarding: { hasVehicle, hasTrailer, hasDriver, isComplete }`
// block on resume and infers the first missing step on its own. Steps whose
// entity already exists are pre-populated into `completedSteps`; nothing is
// auto-marked as skipped on resume any more (skippedSteps is reserved for
// active "Skip" clicks during the session).

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
import type { OnboardingDto } from '@magguarantee/shared';

export type StepNumber = 1 | 2 | 3 | 4;

interface ExistingEntities {
  vehicle: boolean;
  trailer: boolean;
  driver: boolean;
}

interface PersistedState {
  carrierId: string | null;
  /**
   * Display label of the created/resumed carrier (e.g. `login — name`).
   * Carried through wizard state so steps 2..4 can render it directly,
   * without depending on the `useCarriers` list query which may still be
   * refetching after step 1's invalidation — see CarrierOnboardingWizard.
   */
  carrierLabel: string | null;
  temporaryPassword: string | null;
  currentStep: StepNumber;
  completedSteps: number[];
  skippedSteps: number[];
  /**
   * Snapshot of which carrier-owned entities already exist when the wizard
   * was opened (or were created during the current wizard session). Drives
   * the "ten przewoźnik ma już pojazd" info banner on the Vehicle/Trailer/
   * Driver sheets — see CarrierOnboardingWizard.
   */
  existingEntities: ExistingEntities;
}

interface WizardState extends PersistedState {
  active: boolean;
}

interface WizardCtx extends WizardState {
  /** Open the wizard at the carrier step (fresh create flow). */
  start: () => void;
  /**
   * Open the wizard mid-flow for an already-created carrier. The wizard
   * jumps to the first missing step (vehicle → trailer → driver). Steps
   * whose entity already exists are pre-marked as completed in the stepper
   * so the operator sees their progress, not a blank slate. Pre-existing
   * gaps are NOT marked as skipped — `skippedSteps` is reserved for
   * "Pomiń" clicks during the current session.
   */
  resume: (args: {
    carrierId: string;
    carrierLabel: string;
    onboarding: OnboardingDto;
  }) => void;
  /** Step 1 finished — carrier created, temporary password in hand. */
  carrierCreated: (args: {
    carrierId: string;
    temporaryPassword: string;
    carrierLabel: string;
  }) => void;
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
 * Pick the first missing step from the carrier's derived onboarding block.
 * Returns null when everything is already in place — caller should no-op.
 */
function firstMissingStep(onboarding: OnboardingDto): StepNumber | null {
  if (!onboarding.hasVehicle) return 2;
  if (!onboarding.hasTrailer) return 3;
  if (!onboarding.hasDriver) return 4;
  return null;
}

/**
 * Build the `completedSteps` array for a resume — step 1 is always done (the
 * carrier exists) and any step whose entity is already present counts as
 * completed so the stepper reflects reality.
 */
function completedFromOnboarding(onboarding: OnboardingDto): number[] {
  const completed = [1];
  if (onboarding.hasVehicle) completed.push(2);
  if (onboarding.hasTrailer) completed.push(3);
  if (onboarding.hasDriver) completed.push(4);
  return completed;
}

function readPersisted(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Partial<PersistedState> & {
      existingEntities?: Partial<ExistingEntities>;
    };
    if (typeof obj.currentStep !== 'number') return null;
    if (![1, 2, 3, 4].includes(obj.currentStep)) return null;
    const ee: Partial<ExistingEntities> = obj.existingEntities ?? {};
    return {
      carrierId: typeof obj.carrierId === 'string' ? obj.carrierId : null,
      carrierLabel:
        typeof obj.carrierLabel === 'string' ? obj.carrierLabel : null,
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
      existingEntities: {
        vehicle: ee.vehicle === true,
        trailer: ee.trailer === true,
        driver: ee.driver === true,
      },
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

const EMPTY_EXISTING: ExistingEntities = {
  vehicle: false,
  trailer: false,
  driver: false,
};

export function CarrierOnboardingProvider({ children }: ProviderProps) {
  const [state, setState] = useState<WizardState>(() => ({
    active: false,
    carrierId: null,
    carrierLabel: null,
    temporaryPassword: null,
    currentStep: 1,
    completedSteps: [],
    skippedSteps: [],
    existingEntities: { ...EMPTY_EXISTING },
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
      carrierLabel: state.carrierLabel,
      temporaryPassword: state.temporaryPassword,
      currentStep: state.currentStep,
      completedSteps: state.completedSteps,
      skippedSteps: state.skippedSteps,
      existingEntities: state.existingEntities,
    });
  }, [
    state.active,
    state.carrierId,
    state.carrierLabel,
    state.temporaryPassword,
    state.currentStep,
    state.completedSteps,
    state.skippedSteps,
    state.existingEntities,
  ]);

  const start = useCallback(() => {
    setState({
      active: true,
      carrierId: null,
      carrierLabel: null,
      temporaryPassword: null,
      currentStep: 1,
      completedSteps: [],
      skippedSteps: [],
      existingEntities: { ...EMPTY_EXISTING },
    });
  }, []);

  const resume = useCallback(
    ({
      carrierId,
      carrierLabel,
      onboarding,
    }: {
      carrierId: string;
      carrierLabel: string;
      onboarding: OnboardingDto;
    }) => {
      // Nothing to resume — caller may have raced a state refresh. No-op.
      if (onboarding.isComplete) return;
      const step = firstMissingStep(onboarding);
      if (step === null) return;
      setState({
        active: true,
        carrierId,
        carrierLabel,
        // No temp password on resume — see file header.
        temporaryPassword: null,
        currentStep: step,
        completedSteps: completedFromOnboarding(onboarding),
        // Per the orchestrator brief: `skippedSteps` is session-scoped only.
        // Pre-existing gaps render as neutral "pending" in the stepper.
        skippedSteps: [],
        existingEntities: {
          vehicle: onboarding.hasVehicle,
          trailer: onboarding.hasTrailer,
          driver: onboarding.hasDriver,
        },
      });
    },
    [],
  );

  const carrierCreated = useCallback(
    ({
      carrierId,
      temporaryPassword,
      carrierLabel,
    }: {
      carrierId: string;
      temporaryPassword: string;
      carrierLabel: string;
    }) => {
      setState((prev) => ({
        ...prev,
        carrierId,
        carrierLabel,
        temporaryPassword,
        currentStep: 2,
        completedSteps: [...new Set([...prev.completedSteps, 1])],
        // Fresh carrier — no pre-existing entities yet.
        existingEntities: { ...EMPTY_EXISTING },
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
      // Flip the corresponding existingEntities flag — the entity now exists
      // in the database. Step 1 (carrier) is tracked separately in
      // `completedSteps`/`carrierId`, not here.
      const existing: ExistingEntities = { ...prev.existingEntities };
      if (cur === 2) existing.vehicle = true;
      else if (cur === 3) existing.trailer = true;
      else if (cur === 4) existing.driver = true;
      if (cur === 4) {
        // Final step done — close the wizard cleanly.
        clearPersisted();
        return {
          active: false,
          carrierId: null,
          carrierLabel: null,
          temporaryPassword: null,
          currentStep: 1,
          completedSteps: [],
          skippedSteps: [],
          existingEntities: { ...EMPTY_EXISTING },
        };
      }
      return {
        ...prev,
        currentStep: (cur + 1) as StepNumber,
        completedSteps: completed,
        skippedSteps: skipped,
        existingEntities: existing,
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
          carrierLabel: null,
          temporaryPassword: null,
          currentStep: 1,
          completedSteps: [],
          skippedSteps: [],
          existingEntities: { ...EMPTY_EXISTING },
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
      carrierLabel: null,
      temporaryPassword: null,
      currentStep: 1,
      completedSteps: [],
      skippedSteps: [],
      existingEntities: { ...EMPTY_EXISTING },
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
