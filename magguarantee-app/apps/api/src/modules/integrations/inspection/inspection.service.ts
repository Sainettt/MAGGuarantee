import { Injectable } from '@nestjs/common';

import type { InspectionResponse } from '@magguarantee/shared';

const INFOCAR_BASE = 'https://info-car.pl/inspections';

/**
 * info-car.pl URL builder — pure function wrapped in a service for symmetry
 * with the other integrations (and so the controller doesn't carry domain
 * logic).
 *
 * Per docs/16-jobs-and-integrations.md#info-carpl: this is NOT a network call.
 * It just returns a deep-link the UI can open in a new tab.
 */
@Injectable()
export class InspectionService {
  buildLink(vin: string): InspectionResponse {
    return { url: `${INFOCAR_BASE}?vin=${encodeURIComponent(vin)}` };
  }
}
