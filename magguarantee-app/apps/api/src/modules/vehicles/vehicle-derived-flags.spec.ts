import { computeVehicleDerivedFlags } from './vehicle-derived-flags';

const agreementScan = [{ category: 'agreement' as const }];
// A live attachment that is NOT a porozumienie scan — proves the derived flags
// key off the `agreement` category specifically, not "any attachment present".
const nonAgreementScan = [{ category: 'gps' as const }];

describe('computeVehicleDerivedFlags', () => {
  it('no fuel card, no agreement → both flags false', () => {
    expect(
      computeVehicleDerivedFlags({
        fuelCard: false,
        agreement: null,
        attachments: [],
      }),
    ).toEqual({ fuelCardBlocked: false, agreementScanMissing: false });
  });

  it('fuel card + no agreement flag → fuelCardBlocked, no agreementScanMissing', () => {
    expect(
      computeVehicleDerivedFlags({
        fuelCard: true,
        agreement: false,
        attachments: [],
      }),
    ).toEqual({ fuelCardBlocked: true, agreementScanMissing: false });
  });

  it('fuel card + agreement=true but NO scan → blocked + scan missing', () => {
    expect(
      computeVehicleDerivedFlags({
        fuelCard: true,
        agreement: true,
        attachments: nonAgreementScan,
      }),
    ).toEqual({ fuelCardBlocked: true, agreementScanMissing: true });
  });

  it('fuel card + agreement=true + live scan → not blocked, scan present', () => {
    expect(
      computeVehicleDerivedFlags({
        fuelCard: true,
        agreement: true,
        attachments: agreementScan,
      }),
    ).toEqual({ fuelCardBlocked: false, agreementScanMissing: false });
  });

  it('agreement=true but no scan, no fuel card → only agreementScanMissing', () => {
    expect(
      computeVehicleDerivedFlags({
        fuelCard: false,
        agreement: true,
        attachments: [],
      }),
    ).toEqual({ fuelCardBlocked: false, agreementScanMissing: true });
  });
});
