'use client';

// Phase 3.2 — guided carrier onboarding stepper.
//
// 4-step indicator rendered inside the Sheet header of the carrier-onboarding
// wizard: Carrier → Vehicle → Trailer → Driver. Each step is one of:
//   - completed: solid brand-red fill with <Check>
//   - active:    hollow ring around the step number
//   - skipped:   dashed border + <Minus> + italic label (second non-color cue)
//   - future:    plain neutral
//
// Non-interactive in v1: backend creates entities sequentially so clicking
// back into a previous step would orphan IDs. Renders as <ol role="list">
// only — no buttons, no onClick.
//
// Per docs/14-design-system.md § Phase 3.2 #1.

import { Check, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

type StepNumber = 1 | 2 | 3 | 4;

interface Props {
  currentStep: StepNumber;
  completedSteps: number[];
  skippedSteps: number[];
}

type State = 'completed' | 'active' | 'skipped' | 'future';

const STEP_KEYS: Record<StepNumber, string> = {
  1: 'wizard.step.carrier',
  2: 'wizard.step.vehicle',
  3: 'wizard.step.trailer',
  4: 'wizard.step.driver',
};

const STATE_KEYS: Record<State, string> = {
  completed: 'wizard.state.completed',
  active: 'wizard.state.active',
  skipped: 'wizard.state.skipped',
  future: 'wizard.state.future',
};

export function WizardStepper({
  currentStep,
  completedSteps,
  skippedSteps,
}: Props) {
  const t = useTranslations();
  const stateFor = (n: StepNumber): State => {
    if (completedSteps.includes(n)) return 'completed';
    if (skippedSteps.includes(n)) return 'skipped';
    if (n === currentStep) return 'active';
    return 'future';
  };

  const steps: StepNumber[] = [1, 2, 3, 4];
  const states = steps.map((n) => stateFor(n));
  // Segment i (0..steps.length-2) connects step i and step i+1. Brand-colored
  // iff both neighbours are `completed`.
  const segmentBrand = states
    .slice(0, -1)
    .map((s, i) => s === 'completed' && states[i + 1] === 'completed');

  return (
    <ol
      role="list"
      aria-label={t('wizard.ariaLabel')}
      className="flex items-start w-full px-1 pt-1 pb-3"
    >
      {steps.map((n, idx) => {
        const state = states[idx]!;
        // Left half belongs to segment (idx-1); right half to segment (idx).
        const leftBrand = idx > 0 ? segmentBrand[idx - 1] : false;
        const rightBrand = idx < steps.length - 1 ? segmentBrand[idx] : false;
        return (
          <li
            key={n}
            aria-current={state === 'active' ? 'step' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div className="flex w-full items-center">
              <div
                aria-hidden="true"
                className={cn(
                  'h-px flex-1',
                  idx === 0
                    ? 'opacity-0'
                    : leftBrand
                      ? 'bg-brand'
                      : 'bg-border',
                )}
              />
              <Circle
                stepNumber={n}
                state={state}
                ariaLabel={`${t(`wizard.aria.stepPrefix`, { n })} ${t(STEP_KEYS[n])} — ${t(STATE_KEYS[state])}`}
              />
              <div
                aria-hidden="true"
                className={cn(
                  'h-px flex-1',
                  idx === steps.length - 1
                    ? 'opacity-0'
                    : rightBrand
                      ? 'bg-brand'
                      : 'bg-border',
                )}
              />
            </div>
            <span
              className={cn(
                'mt-0.5 text-center text-[11px] font-semibold uppercase tracking-wider truncate max-w-[7ch] sm:max-w-[9ch]',
                state === 'active' && 'text-text font-bold',
                state === 'completed' && 'text-text',
                state === 'skipped' && 'text-text-sub italic',
                state === 'future' && 'text-text-sub',
              )}
            >
              {t(STEP_KEYS[n])}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

interface CircleProps {
  stepNumber: StepNumber;
  state: State;
  ariaLabel: string;
}

function Circle({ stepNumber, state, ariaLabel }: CircleProps) {
  let content: React.ReactNode;
  if (state === 'completed') {
    content = <Check size={14} aria-hidden="true" />;
  } else if (state === 'skipped') {
    content = <Minus size={14} aria-hidden="true" />;
  } else {
    content = stepNumber;
  }

  return (
    <span
      role="img"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center justify-center size-7 rounded-full border text-xs font-bold tabular-nums',
        state === 'completed' &&
          'bg-brand text-white border-brand',
        state === 'active' &&
          'bg-card text-brand border-brand border-2',
        state === 'skipped' &&
          'bg-card text-text-sub border-border border-dashed',
        state === 'future' && 'bg-card text-text-sub border-border',
      )}
    >
      {content}
    </span>
  );
}
