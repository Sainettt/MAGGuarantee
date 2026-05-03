import { Injectable } from '@nestjs/common';

import type {
  GpsPosition,
  GpsProvider,
  GpsTrip,
  GpsVehicleRef,
} from '../gps.types';

/**
 * Stub for the real GPS vendor.
 *
 * When MAGTRANS supplies API credentials and the vendor name (Wialon /
 * GPSWOX / Webdispatcher / Frotcom / Verizon Connect / …), this is the ONLY
 * file that needs to change — plus `gps.config.ts` to flip
 * `GPS_PROVIDER=vendor`. The public surface (`GpsProvider`) is fixed so the
 * service / controller / Redis cache layer all remain untouched.
 *
 * TODO: replace with vendor SDK calls. Authentication, vehicle id mapping
 * and rate-limit handling go here. See docs/16-jobs-and-integrations.md
 * "что-нужно-получить-от-magtrans-перед-finalize" for the checklist.
 */
@Injectable()
export class GpsVendorProvider implements GpsProvider {
  readonly source = 'vendor' as const;

  async getCurrentPositions(
    _vehicles: GpsVehicleRef[],
  ): Promise<GpsPosition[]> {
    throw new Error(
      'GpsVendorProvider not yet implemented — credentials pending from MAGTRANS',
    );
  }

  async getTrips(
    _vehicle: GpsVehicleRef,
    _from: Date,
    _to: Date,
  ): Promise<GpsTrip[]> {
    throw new Error(
      'GpsVendorProvider.getTrips not yet implemented — credentials pending from MAGTRANS',
    );
  }
}
