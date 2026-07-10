import { Injectable } from '@nestjs/common';

import type {
  CarrierDocVehicleCategory,
  DriverAttachmentCategory,
  TrailerAttachmentCategory,
  VehicleAttachmentCategory,
} from '@magguarantee/shared';

import { PrismaService } from '../prisma/prisma.service';

/**
 * A vehicle-attachment row joined with its owning vehicle's identity, scoped
 * to one carrier. `size`/`createdAt` ride along so the overview DTO can render
 * without a second read.
 */
export interface CarrierVehicleAttachmentRow {
  attachmentId: string;
  category: VehicleAttachmentCategory;
  fileName: string;
  size: number;
  createdAt: Date;
  vehicleId: string;
  registration: string;
  sideNumber: string | null;
}

/** A vehicle flagged `adr:true` — flag + classes only, NO file. */
export interface CarrierAdrVehicleRow {
  vehicleId: string;
  plate: string;
  adrClasses: string[];
}

/** A trailer XL-certificate row joined with its trailer's registration. */
export interface CarrierTrailerAttachmentRow {
  attachmentId: string;
  category: TrailerAttachmentCategory;
  fileName: string;
  size: number;
  createdAt: Date;
  trailerId: string;
  registration: string;
}

/** A driver ADR-certificate (świadectwo) row joined with the driver's name. */
export interface CarrierDriverAttachmentRow {
  attachmentId: string;
  category: DriverAttachmentCategory;
  fileName: string;
  size: number;
  createdAt: Date;
  driverId: string;
  fullName: string;
}

/**
 * Read-side repository for the opiekun "Dokumenty" overview
 * (`GET /carriers/:id/documents/overview`). Gathers EVERY document tied to one
 * carrier — company docs, per-vehicle files, per-trailer XL certs, per-driver
 * ADR certs — plus the ADR-flagged vehicles (no file).
 *
 * SOFT-DELETE FOOTGUN: the global soft-delete extension only injects
 * `deletedAt: null` on TOP-LEVEL operations. Here every query is on the
 * attachment model itself but filters the PARENT relation (`vehicle`, `driver`,
 * `trailer`) and the carrier link via nested `is:` — those nested reads are NOT
 * auto-filtered, so we add `deletedAt: null` on BOTH the attachment row AND the
 * parent explicitly. Only ACTIVE/live rows surface. The vehicle-doc category
 * set is the full document set the tab shows (gps / agreement /
 * cabotage_de_insurance) — `agreement` (porozumienie scan) is included as core
 * guarantee paperwork.
 */
@Injectable()
export class CarrierDocumentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vehicle-attachment files for the carrier, in the overview categories, with
   * the owning vehicle's identity joined. Explicitly filters both the
   * attachment and the parent vehicle to live rows (nested reads bypass the
   * soft-delete extension).
   */
  async listVehicleAttachments(
    carrierId: string,
    categories: readonly CarrierDocVehicleCategory[],
  ): Promise<CarrierVehicleAttachmentRow[]> {
    const rows = await this.prisma.tx.vehicleAttachment.findMany({
      where: {
        deletedAt: null,
        category: { in: categories as CarrierDocVehicleCategory[] },
        vehicle: { carrierId, deletedAt: null },
      },
      select: {
        id: true,
        category: true,
        fileName: true,
        size: true,
        createdAt: true,
        vehicleId: true,
        vehicle: { select: { plateNumber: true, sideNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      attachmentId: r.id,
      category: r.category,
      fileName: r.fileName,
      size: r.size,
      createdAt: r.createdAt,
      vehicleId: r.vehicleId,
      registration: r.vehicle?.plateNumber ?? '',
      sideNumber: r.vehicle?.sideNumber ?? null,
    }));
  }

  /**
   * Vehicles of the carrier flagged `adr:true` — NO file (per-vehicle ADR is a
   * flag + classes only). Live rows only.
   */
  async listAdrVehicles(carrierId: string): Promise<CarrierAdrVehicleRow[]> {
    const rows = await this.prisma.tx.vehicle.findMany({
      where: { carrierId, adr: true, deletedAt: null },
      select: { id: true, plateNumber: true, adrClasses: true },
      orderBy: { plateNumber: 'asc' },
    });
    return rows.map((r) => ({
      vehicleId: r.id,
      plate: r.plateNumber,
      adrClasses: r.adrClasses ?? [],
    }));
  }

  /**
   * Trailer XL-certificate files for the carrier, with the trailer's
   * registration joined. Live rows on both attachment and parent trailer.
   */
  async listTrailerAttachments(
    carrierId: string,
  ): Promise<CarrierTrailerAttachmentRow[]> {
    const rows = await this.prisma.tx.trailerAttachment.findMany({
      where: {
        deletedAt: null,
        trailer: { carrierId, deletedAt: null },
      },
      select: {
        id: true,
        category: true,
        fileName: true,
        size: true,
        createdAt: true,
        trailerId: true,
        trailer: { select: { plateNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      attachmentId: r.id,
      category: r.category,
      fileName: r.fileName,
      size: r.size,
      createdAt: r.createdAt,
      trailerId: r.trailerId,
      registration: r.trailer?.plateNumber ?? '',
    }));
  }

  /**
   * Driver ADR-certificate (świadectwo) files for the carrier, with the
   * driver's full name joined. Live rows on both attachment and parent driver.
   */
  async listDriverAttachments(
    carrierId: string,
  ): Promise<CarrierDriverAttachmentRow[]> {
    const rows = await this.prisma.tx.driverAttachment.findMany({
      where: {
        deletedAt: null,
        driver: { carrierId, deletedAt: null },
      },
      select: {
        id: true,
        category: true,
        fileName: true,
        size: true,
        createdAt: true,
        driverId: true,
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      attachmentId: r.id,
      category: r.category,
      fileName: r.fileName,
      size: r.size,
      createdAt: r.createdAt,
      driverId: r.driverId,
      fullName: `${r.driver?.firstName ?? ''} ${r.driver?.lastName ?? ''}`.trim(),
    }));
  }
}
