import { InspectionService } from './inspection.service';

describe('InspectionService', () => {
  const svc = new InspectionService();

  it('builds the canonical info-car URL', () => {
    const out = svc.buildLink('1HGBH41JXMN109186');
    expect(out.url).toBe(
      'https://info-car.pl/inspections?vin=1HGBH41JXMN109186',
    );
  });

  it('URL-encodes characters that need it', () => {
    // VIN regex would block this, but the service is a pure function — it
    // doesn't validate. The service must encode whatever it receives so the
    // upstream URL is well-formed.
    const out = svc.buildLink('A B&C=1');
    expect(out.url).toBe('https://info-car.pl/inspections?vin=A%20B%26C%3D1');
  });

  it('handles empty VIN gracefully (still produces a URL)', () => {
    const out = svc.buildLink('');
    expect(out.url).toBe('https://info-car.pl/inspections?vin=');
  });
});
