import type { VehicleAttachmentCategory } from '@magguarantee/shared';

/**
 * The two server-DERIVED vehicle flags (never stored). Computed from the
 * agreement flag + the fuel-card flag + the presence of a LIVE `agreement`
 * attachment (porozumienie scan). Kept in ONE helper so `VehiclesService.toDto`
 * and `FleetService.toVehicleListItem` can't drift.
 */
export interface VehicleDerivedFlags {
  /**
   * `true` when the fuel card is present but blocked — `fuelCard=true` AND
   * (`agreement!==true` OR no live `agreement` attachment).
   */
  fuelCardBlocked: boolean;
  /**
   * `true` when `agreement=true` but there is no live `agreement` attachment
   * (porozumienie scan missing). SOFT — never save-blocking.
   */
  agreementScanMissing: boolean;
}

/**
 * Minimal row shape needed to derive the flags. Both `VehicleRow` (vehicles
 * repository) and the fleet list rows satisfy this. `attachments` MUST already
 * be filtered to LIVE rows (the repository `includeShape` applies the
 * soft-delete `deletedAt: null` filter on the nested read).
 */
export interface VehicleDerivedFlagsInput {
  agreement: boolean | null;
  fuelCard: boolean;
  attachments: ReadonlyArray<{ category: VehicleAttachmentCategory }>;
}

/**
 * Computes `fuelCardBlocked` + `agreementScanMissing` from the live vehicle
 * row. The single source of truth for both flags (do NOT inline the logic
 * elsewhere).
 */
export function computeVehicleDerivedFlags(
  row: VehicleDerivedFlagsInput,
): VehicleDerivedFlags {
  const hasAgreementScan = row.attachments.some(
    (a) => a.category === 'agreement',
  );
  const agreementOn = row.agreement === true;
  const agreementScanMissing = agreementOn && !hasAgreementScan;
  const fuelCardBlocked =
    row.fuelCard === true && (!agreementOn || !hasAgreementScan);
  return { fuelCardBlocked, agreementScanMissing };
}
