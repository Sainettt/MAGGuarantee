'use client';

// Phase 3.2 — top-level controller for the guided carrier onboarding flow.
//
// Renders exactly ONE Sheet at a time, swapping content based on the wizard's
// `currentStep`. Each sheet is the existing standalone Sheet running in
// `mode='wizard'`, which adds:
//   - <WizardStepper> in the header,
//   - <TemporaryPasswordBanner> at the top of the body (steps 2..4 only),
//   - locked carrier picker on Vehicle/Trailer/Driver,
//   - footer rewired to «Save and continue» / «Skip» / «Exit».
//
// Backend advances the carrier's `onboardingStatus` automatically as a side
// effect of each vehicle/trailer/driver create, so the wizard never calls a
// status-bump endpoint — it just chains the sheets in order and lets the API
// move the marker.

import { CarrierSheet } from '@/app/(employee)/employee/(admin)/carriers/CarrierSheet';
import { DriverSheet } from '@/app/(employee)/employee/(admin)/drivers/DriverSheet';
import { TrailerSheet } from '@/app/(employee)/employee/(admin)/trailers/TrailerSheet';
import { VehicleSheet } from '@/app/(employee)/employee/(admin)/vehicles/VehicleSheet';

import { useCarrierOnboarding } from './useCarrierOnboarding';

export function CarrierOnboardingWizard() {
  const wizard = useCarrierOnboarding();

  if (!wizard.active) return null;

  // Step 1 — carrier create. No banner yet (no password); Skip not allowed.
  if (wizard.currentStep === 1) {
    return (
      <CarrierSheet
        open
        carrier={null}
        onClose={() => wizard.close()}
        mode="wizard"
        wizardCurrentStep={1}
        wizardCompletedSteps={wizard.completedSteps}
        wizardSkippedSteps={wizard.skippedSteps}
        onCompleted={(created) => {
          wizard.carrierCreated({
            carrierId: created.id,
            temporaryPassword: created.temporaryPassword,
          });
        }}
        onExit={() => wizard.close()}
      />
    );
  }

  // Steps 2..4 — assume carrier id exists (the orchestrator's contract).
  // Defensive: if we somehow got here without one, close.
  if (!wizard.carrierId) {
    wizard.close();
    return null;
  }

  const commonWizardProps = {
    wizardCarrierId: wizard.carrierId,
    wizardTempPassword: wizard.temporaryPassword,
    wizardCompletedSteps: wizard.completedSteps,
    wizardSkippedSteps: wizard.skippedSteps,
    onSkip: () => wizard.skipCurrentStep(),
    onExit: () => wizard.close(),
  } as const;

  if (wizard.currentStep === 2) {
    return (
      <VehicleSheet
        open
        vehicle={null}
        onClose={() => wizard.close()}
        mode="wizard"
        wizardCurrentStep={2}
        {...commonWizardProps}
        onCompleted={() => wizard.completeCurrentStep()}
      />
    );
  }

  if (wizard.currentStep === 3) {
    return (
      <TrailerSheet
        open
        trailer={null}
        onClose={() => wizard.close()}
        mode="wizard"
        wizardCurrentStep={3}
        {...commonWizardProps}
        onCompleted={() => wizard.completeCurrentStep()}
      />
    );
  }

  // currentStep === 4
  return (
    <DriverSheet
      open
      driver={null}
      onClose={() => wizard.close()}
      mode="wizard"
      wizardCurrentStep={4}
      {...commonWizardProps}
      onCompleted={() => wizard.completeCurrentStep()}
    />
  );
}
