import { Injectable, NotFoundException } from '@nestjs/common';

import {
  type CarrierDocDriverEntry,
  type CarrierDocTrailerEntry,
  type CarrierDocVehicleCategory,
  type CarrierDocVehicleDocs,
  type CarrierDocVehicleEntry,
  type CarrierDocumentsOverviewDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarrierAttachmentsService } from './carrier-attachments.service';
import {
  CarrierDocumentsRepository,
  type CarrierDriverAttachmentRow,
  type CarrierTrailerAttachmentRow,
  type CarrierVehicleAttachmentRow,
} from './carrier-documents.repository';
import { CarriersRepository } from './carriers.repository';

/**
 * Vehicle-document categories surfaced (as files) in the overview. Mirrors the
 * `CarrierDocVehicleCategorySchema` wire enum 1:1 — `agreement` (porozumienie
 * scan) IS included: for the opiekun it is core guarantee paperwork and the
 * "Dokumenty" tab gathers EVERY document type.
 */
const VEHICLE_DOC_CATEGORIES: readonly CarrierDocVehicleCategory[] = [
  'gps',
  'agreement',
  'cabotage_de_insurance',
];

/**
 * Read-only aggregate for the opiekun "Dokumenty" tab
 * (`GET /carriers/:id/documents/overview`, docs/13-api-design.md#carriers).
 *
 * Gathers EVERY live document tied to one carrier, grouped by owning entity, in
 * a fixed set of reads (one per group). Ownership scoping is enforced upstream
 * by the controller's `OpiekunOwnershipGuard` (admin sees all, opiekun only
 * their own carriers) and `CarrierOwnershipGuard` (a przewoznik holding the B6
 * grant only his own carrier) — same posture as the carrier detail /
 * attachments endpoints; here we only do the existence/404 backstop.
 *
 * The one viewer-dependent bit is a DATA scrub, not scope: a przewoznik viewer
 * gets `vehicle.sideNumber: null` on every vehicle-document entry (internal
 * MAGTRANS designation, docs/14-design-system.md B.5) — see `_showsSideNumber`.
 *
 * Downloads are NOT re-invented: each entry carries the ids the EXISTING
 * per-entity download route needs (see the DTO doc block in
 * `packages/shared/src/schemas/carriers.ts`).
 */
@Injectable()
export class CarrierDocumentsService {
  constructor(
    private readonly carriers: CarriersRepository,
    private readonly documents: CarrierDocumentsRepository,
    private readonly carrierAttachments: CarrierAttachmentsService,
  ) {}

  async overview(
    viewer: AuthUser,
    carrierId: string,
  ): Promise<CarrierDocumentsOverviewDto> {
    await this._assertCarrierExists(carrierId);

    const [
      carrierDocs,
      vehicleRows,
      vehicleAdr,
      trailerRows,
      driverRows,
    ] = await Promise.all([
      // The carrier's own company documents — reuse the existing service so the
      // DTO mapping (and soft-delete filtering) stays single-sourced.
      this.carrierAttachments.list(carrierId),
      this.documents.listVehicleAttachments(carrierId, VEHICLE_DOC_CATEGORIES),
      this.documents.listAdrVehicles(carrierId),
      this.documents.listTrailerAttachments(carrierId),
      this.documents.listDriverAttachments(carrierId),
    ]);

    return {
      carrierId,
      carrierDocs,
      vehicleDocs: this._groupVehicleDocs(
        vehicleRows,
        this._showsSideNumber(viewer),
      ),
      vehicleAdr: vehicleAdr.map((v) => ({
        vehicleId: v.vehicleId,
        plate: v.plate,
        adrClasses: v.adrClasses,
      })),
      trailerDocs: trailerRows.map(toTrailerEntry),
      driverDocs: driverRows.map(toDriverEntry),
    };
  }

  // ── internals ────────────────────────────────────────────

  private async _assertCarrierExists(carrierId: string): Promise<void> {
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) throw new NotFoundException('Przewoźnik nie znaleziony');
  }

  /** Whether the viewer may see `Vehicle.sideNumber` on the vehicle refs. */
  private _showsSideNumber(viewer: AuthUser): boolean {
    // scope: viewer-role data scrub, not a permission — like the
    // `vehicles.rates.read` field scrub, but keyed on the role on purpose:
    // `Vehicle.sideNumber` is the internal MAGTRANS designation and never
    // reaches a carrier (docs/14-design-system.md B.5, same rule as the carrier
    // «Auta» table). A przewoznik gets here only through the B6 grant of
    // `carrier_documents.read` — that grant opens the documents, not the
    // internal designation, so there is no catalog right for it and none must
    // be added. admin / opiekun (the role holders) keep it.
    return viewer.role !== 'przewoznik';
  }

  /**
   * Buckets the flat vehicle-attachment rows into the per-category map the UI
   * renders. Every category key is always present (empty array when the carrier
   * has no file in it) so the tab shows a stable set of sections.
   * `showSideNumber` false → every vehicle ref carries `sideNumber: null`.
   */
  private _groupVehicleDocs(
    rows: CarrierVehicleAttachmentRow[],
    showSideNumber: boolean,
  ): CarrierDocVehicleDocs {
    const grouped: CarrierDocVehicleDocs = {
      gps: [],
      agreement: [],
      cabotage_de_insurance: [],
    };
    for (const row of rows) {
      // Defensive: the repo query already restricts to these categories, so a
      // stray category never lands here — but guard the index either way.
      const bucket = grouped[row.category as CarrierDocVehicleCategory];
      if (bucket) bucket.push(toVehicleEntry(row, showSideNumber));
    }
    return grouped;
  }
}

function toVehicleEntry(
  row: CarrierVehicleAttachmentRow,
  showSideNumber: boolean,
): CarrierDocVehicleEntry {
  return {
    attachmentId: row.attachmentId,
    fileName: row.fileName,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    vehicle: {
      id: row.vehicleId,
      registration: row.registration,
      sideNumber: showSideNumber ? row.sideNumber : null,
    },
  };
}

function toTrailerEntry(
  row: CarrierTrailerAttachmentRow,
): CarrierDocTrailerEntry {
  return {
    attachmentId: row.attachmentId,
    fileName: row.fileName,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    trailerId: row.trailerId,
    registration: row.registration,
  };
}

function toDriverEntry(row: CarrierDriverAttachmentRow): CarrierDocDriverEntry {
  return {
    attachmentId: row.attachmentId,
    fileName: row.fileName,
    size: row.size,
    createdAt: row.createdAt.toISOString(),
    driverId: row.driverId,
    fullName: row.fullName,
  };
}
