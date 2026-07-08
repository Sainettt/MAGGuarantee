'use client';

// Phase 3.2 — top-level controller for the guided carrier onboarding flow.
//
// Renders exactly ONE Sheet at a time, swapping content based on the wizard's
// `currentStep`. Each sheet is the existing standalone Sheet running in
// `mode='wizard'`, which adds:
//   - <WizardStepper> in the header,
//   - <TemporaryPasswordRow> inside the SheetHeader below the stepper (steps 2..4 only),
//   - locked carrier picker on Vehicle/Trailer/Driver,
//   - footer rewired to «Save and continue» / «Skip» / «Exit».
//
// Onboarding completeness is now derived on the API side from the live
// child-row counts (vehicles/trailers/drivers) — no more
// `Carrier.onboardingStatus` enum to bump. The wizard just chains the sheets
// in order; the next read of /carriers will reflect the new fleet shape.
//
// When the wizard resumes mid-flow against a carrier that ALREADY has some
// of those entities (e.g. a vehicle was added outside the wizard), the
// corresponding sheet renders an info banner so the operator knows they can
// either add another or skip. `existingEntities` is sourced from
// useCarrierOnboarding and is also flipped to true as the operator creates
// new entities through the wizard itself.

import { CarrierSheet } from '@/app/(employee)/employee/carriers/CarrierSheet';
import { DriverFormDialog } from '@/app/(employee)/employee/drivers/DriverFormDialog';
import { TrailerFormDialog } from '@/app/(employee)/employee/trailers/TrailerFormDialog';
import { VehicleFormDialog } from '@/app/(employee)/employee/vehicles/VehicleFormDialog';

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
          // Mirror the legacy carrier-picker option text (`login — name`) so
          // step 2..4 can render the label directly. This decouples the
          // downstream sheets from the `useCarriers` list query which is
          // still refetching at this exact moment due to the create
          // invalidation — without the label the picker would flash empty.
          const carrierLabel =
            created.login + (created.name ? ` — ${created.name}` : '');
          wizard.carrierCreated({
            carrierId: created.id,
            temporaryPassword: created.temporaryPassword,
            carrierLabel,
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
    wizardCarrierLabel: wizard.carrierLabel ?? '',
    wizardTempPassword: wizard.temporaryPassword,
    wizardCompletedSteps: wizard.completedSteps,
    wizardSkippedSteps: wizard.skippedSteps,
    onSkip: () => wizard.skipCurrentStep(),
    onExit: () => wizard.close(),
  } as const;

  if (wizard.currentStep === 2) {
    return (
      <VehicleFormDialog
        open
        vehicle={null}
        onClose={() => wizard.close()}
        mode="wizard"
        wizardCurrentStep={2}
        wizardEntityAlreadyExists={wizard.existingEntities.vehicle}
        {...commonWizardProps}
        onCompleted={() => wizard.completeCurrentStep()}
      />
    );
  }

  if (wizard.currentStep === 3) {
    return (
      <TrailerFormDialog
        open
        trailer={null}
        onClose={() => wizard.close()}
        mode="wizard"
        wizardCurrentStep={3}
        wizardEntityAlreadyExists={wizard.existingEntities.trailer}
        {...commonWizardProps}
        onCompleted={() => wizard.completeCurrentStep()}
      />
    );
  }

  // currentStep === 4
  return (
    <DriverFormDialog
      open
      driver={null}
      onClose={() => wizard.close()}
      mode="wizard"
      wizardCurrentStep={4}
      wizardEntityAlreadyExists={wizard.existingEntities.driver}
      {...commonWizardProps}
      onCompleted={() => wizard.completeCurrentStep()}
    />
  );
}
