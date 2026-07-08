import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';

import { startOfBusinessTodayUtc } from '@magguarantee/shared';

import type {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleAttachmentCategory,
  VehicleAttachmentDto,
  VehicleDto,
  VehicleFilters,
} from '@magguarantee/shared';

import { AuditContext } from '../../common/audit';
import {
  isPrismaUniqueViolation,
  uniqueViolationToConflict,
} from '../../common/errors/prisma-error';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { GuaranteeWatchdogService } from '../guarantee-watchdog/guarantee-watchdog.service';
import { StorageService, type StorageObject } from '../storage/storage.service';
import { TeamsRepository } from '../teams/teams.repository';
import { UsersRepository } from '../users/users.repository';
import {
  extensionForMime,
  isAllowedMimeType,
  type CategorizedUpload,
} from './attachment-validation';
import {
  VehicleAttachmentsRepository,
  type VehicleAttachmentRow,
} from './vehicle-attachments.repository';
import { computeVehicleDerivedFlags } from './vehicle-derived-flags';
import {
  NO_TEAM_SENTINEL,
  VehiclesRepository,
  type VehicleRow,
  type VehicleRowAttachment,
} from './vehicles.repository';

/**
 * Vehicle CRUD service per docs/13-api-design.md#vehicles.
 *
 * Invariants enforced here (per docs/04-data-model.md):
 *   - `plannerId` → User.role='planista'
 *   - `dispatchTeamId` → an ACTIVE `Team` (Phase 11 — replaces the legacy
 *     single `dispatcherId → User.role='dyspozytor'`)
 *   - composite UNIQUE (carrierId, plateNumber) — DB; we translate the
 *     P2002 to 409 Conflict.
 *
 * Required-attachment rule (umowa + cabotage screenshots) — service-layer,
 * because files arrive as separate multipart parts and cannot be expressed in
 * the body Zod schema:
 *   - `contract` (umowa) ⇒ ≥1 attachment ALWAYS required on create
 *   - `cabotageDe=true`  ⇒ ≥1 `cabotage_de` attachment
 *   - `cabotageFr=true`  ⇒ ≥1 `cabotage_fr` attachment
 * NOTE (2026-06-17, resolved): the `contract` (umowa) requirement is now
 * UNCONDITIONAL on create. It used to be gated on the legacy `gps=true` toggle;
 * when that boolean was dropped the trigger was temporarily removed. Product
 * resolution: every vehicle has an umowa, so the scan is mandatory for all
 * creates regardless of any flag. Cabotage attachments stay conditional.
 * The `adr` boolean stays on the vehicle (permit flag) but no longer requires
 * an attachment — the ADR certificate scan moved to the Driver (świadectwo
 * ADR) as a `DriverAttachment` (2026-05-29).
 * On create the rule (incl. the unconditional `contract`) is checked BEFORE any
 * DB/storage write. On update the rule holds over the post-update set (existing
 * live attachments + newly uploaded − removed); the unconditional `contract`
 * requirement applies only at create-time — update does not re-block existing
 * vehicles.
 *
 * Role-scoped list filtering happens here because guards can only fire on
 * per-row routes; collection routes need service-side narrowing.
 */
@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    private readonly vehicles: VehiclesRepository,
    private readonly users: UsersRepository,
    private readonly carriers: CarriersRepository,
    private readonly attachments: VehicleAttachmentsRepository,
    private readonly storage: StorageService,
    private readonly teams: TeamsRepository,
    // Guarantee Watchdog — agreement-toggle hook (true→false resolves the open
    // idle episode). `@Optional()` so the positional service-test fakes keep
    // compiling; the hook no-ops when absent.
    @Optional() private readonly guaranteeWatchdog?: GuaranteeWatchdogService,
  ) {}

  async list(
    user: AuthUser,
    filters: VehicleFilters,
  ): Promise<{ items: VehicleDto[]; nextCursor: string | null }> {
    const effective = await this._scopeFilters(user, filters);
    const rows = await this.vehicles.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toDto(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getById(id: string): Promise<VehicleDto> {
    const row = await this.vehicles.findById(id);
    if (!row) throw new NotFoundException('Pojazd nie znaleziony');
    return this.toDto(row);
  }

  /**
   * Creates a vehicle plus its umowa/cabotage attachments.
   *
   * Order: validate required-attachment rule → create Vehicle → upload each
   * file to MinIO → insert `VehicleAttachment` rows. On any post-create
   * failure the uploaded objects and the vehicle row are rolled back so the
   * request is all-or-nothing.
   */
  async create(
    user: AuthUser,
    dto: CreateVehicleDto,
    uploads: CategorizedUpload[],
  ): Promise<VehicleDto> {
    await this._assertCarrierAccessibleForWrite(user, dto.carrierId);
    if (dto.plannerId) await this._assertRole(dto.plannerId, 'planista');
    if (dto.dispatchTeamId) await this._assertTeamActive(dto.dispatchTeamId);

    // Required-attachment + cross-field rules — checked BEFORE any write so a
    // missing screenshot / bad field combo fails clean with 422 (no orphans).
    this._assertVehicleRulesOnCreate(dto, uploads);

    const row = await this._persistVehicle(user, dto);
    const persisted = await this._attachUploadsWithRollback(
      row,
      uploads,
      user.sub,
      // On create, a failed attachment step must also remove the vehicle row
      // so the request is all-or-nothing (no half-built vehicle left behind).
      { rollbackVehicle: true },
    );

    // Onboarding state is derived on read from the live child-count snapshot
    // (see `CarriersService.toDto`) — creating a vehicle no longer needs a
    // side-effect to mutate any carrier-level flag.
    return this.toDto(persisted);
  }

  /**
   * Updates a vehicle. Supports adding new attachments (file parts) and
   * removing existing ones (`removeAttachmentIds`). The required-attachment
   * rule must hold over the post-update set: existing live attachments minus
   * removed plus newly uploaded.
   */
  async update(
    id: string,
    dto: UpdateVehicleDto,
    uploads: CategorizedUpload[],
  ): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    // Capture the pre-mutation row for the audit interceptor — the trimmer
    // narrows this down to the keys present in `after` (= response body)
    // before the audit row lands.
    AuditContext.setBefore(this.toDto(existing));
    if (dto.plannerId !== undefined && dto.plannerId !== null) {
      await this._assertRole(dto.plannerId, 'planista');
    }
    // Phase 11 — reassigning to a Team requires it to exist and be active.
    // `null` (detach) skips the check.
    if (dto.dispatchTeamId !== undefined && dto.dispatchTeamId !== null) {
      await this._assertTeamActive(dto.dispatchTeamId);
    }

    const removeIds = dto.removeAttachmentIds ?? [];
    const toRemove = await this._resolveRemovals(id, removeIds);

    // Required-attachment + cross-field rules over the post-update state.
    this._assertVehicleRulesOnUpdate(
      existing,
      dto,
      uploads,
      new Set(toRemove.map((a) => a.id)),
    );

    const patch = this._buildUpdatePatch(existing, dto);

    // Guarantee Watchdog — maintain `Vehicle.agreementSince` on the agreement
    // toggle (plan §4). `agreement` is `Boolean?`; NULL is treated as false. Only
    // acts when `dto.agreement` was actually supplied (else `agreementSince` is
    // left untouched). Date-only UTC-midnight (same convention as markReturned's
    // `actualReturnAt`). The value lands in the SAME update as the scalar.
    const agreementTransition = this._resolveAgreementTransition(existing, dto);
    if (agreementTransition !== 'unchanged') {
      patch.agreementSince =
        agreementTransition === 'enabled' ? startOfBusinessTodayUtc() : null;
    }

    let row: VehicleRow;
    try {
      row = await this.vehicles.update(id, patch);
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw uniqueViolationToConflict(
          err,
          'Pojazd o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
        );
      }
      throw err;
    }

    // Apply attachment removals (soft-delete; MinIO object left intact) and
    // new uploads. The vehicle scalars are already persisted at this point.
    for (const a of toRemove) {
      await this.attachments.softDelete(a.id);
    }
    await this._attachUploadsWithRollback(row, uploads, /* createdById */ null);

    // Guarantee Watchdog — when the guarantee was just turned OFF, close the
    // vehicle's open idle episode (reason agreement_off). Off-path: the hook
    // catches everything internally; the belt-and-suspenders guard here ensures
    // a hook failure never breaks the vehicle update. No-op when the service
    // isn't wired (unit tests).
    if (agreementTransition === 'disabled' && this.guaranteeWatchdog) {
      void this.guaranteeWatchdog.onAgreementDisabled(id).catch((err) => {
        this.logger.warn({
          msg: 'guarantee watchdog agreement-off hook enqueue failed (non-fatal)',
          vehicleId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    const fresh = await this.vehicles.findById(id);
    return this.toDto(fresh ?? row);
  }

  /**
   * Classifies the agreement toggle for the watchdog `agreementSince`
   * maintenance (plan §4). `Vehicle.agreement` is `Boolean?` — NULL is treated
   * as false. Returns `unchanged` when `dto.agreement` was not supplied or the
   * effective boolean did not flip. Otherwise `enabled` (false/null→true) or
   * `disabled` (true→false/null).
   */
  private _resolveAgreementTransition(
    existing: VehicleRow,
    dto: UpdateVehicleDto,
  ): 'enabled' | 'disabled' | 'unchanged' {
    if (dto.agreement === undefined) return 'unchanged';
    const before = existing.agreement === true;
    const after = dto.agreement === true;
    if (before === after) return 'unchanged';
    return after ? 'enabled' : 'disabled';
  }

  async deactivate(id: string): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    if (!existing.active) {
      throw new ConflictException('Pojazd jest już nieaktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.vehicles.setActive(id, false);
    return this.toDto(row);
  }

  async reactivate(id: string): Promise<VehicleDto> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    if (existing.active) {
      throw new ConflictException('Pojazd jest już aktywny');
    }
    AuditContext.setBefore(this.toDto(existing));
    const row = await this.vehicles.setActive(id, true);
    return this.toDto(row);
  }

  async softDelete(id: string): Promise<void> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));
    await this.vehicles.softDelete(id);
  }

  /**
   * Hard-deletes a vehicle row. Phase 4.4 admin-only flow — `reason` is
   * required (Zod-validated upstream) and lands in
   * `audit_log.metadata.reason` via `AuditContext.setMetadata`. The pre-
   * mutation snapshot keeps the audit row legible after the row is gone.
   *
   * Attachments are referenced by FK with `ON DELETE CASCADE` so the
   * VehicleAttachment rows go with the vehicle. The MinIO objects are
   * intentionally left in place — same policy as `deleteAttachment`.
   */
  async hardDelete(id: string, reason: string): Promise<void> {
    const existing = await this.vehicles.findById(id);
    if (!existing) throw new NotFoundException('Pojazd nie znaleziony');
    AuditContext.setBefore(this.toDto(existing));
    AuditContext.setMetadata({ reason });
    await this.vehicles.hardDelete(id);
  }

  // ── Attachments ──────────────────────────────────────────

  /** Lists the non-deleted attachments of a vehicle as public DTOs. */
  async listAttachments(vehicleId: string): Promise<VehicleAttachmentDto[]> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) throw new NotFoundException('Pojazd nie znaleziony');
    const rows = await this.attachments.listByVehicle(vehicleId);
    return rows.map((r) => attachmentRowToDto(r));
  }

  /**
   * Returns the byte stream + metadata for an attachment so the controller
   * can proxy it to the HTTP response. MinIO is not publicly reachable —
   * downloads always go through the API.
   */
  async downloadAttachment(
    vehicleId: string,
    attachmentId: string,
  ): Promise<{ object: StorageObject; fileName: string; mimeType: string }> {
    const att = await this._loadAttachmentOf(vehicleId, attachmentId);
    const object = await this.storage.getObject(att.storageKey);
    return { object, fileName: att.fileName, mimeType: att.mimeType };
  }

  /**
   * Soft-deletes an attachment row. The MinIO object is intentionally left in
   * place (per the task brief).
   */
  async deleteAttachment(
    vehicleId: string,
    attachmentId: string,
  ): Promise<void> {
    const att = await this._loadAttachmentOf(vehicleId, attachmentId);
    await this.attachments.softDelete(att.id);
  }

  // ── Internals: persistence ───────────────────────────────

  private async _persistVehicle(
    user: AuthUser,
    dto: CreateVehicleDto,
  ): Promise<VehicleRow> {
    // Normalise fuel-card fields: cleared to null unless fuelCard=true (rule 4).
    const fuelCard = dto.fuelCard ?? false;
    try {
      return await this.vehicles.create({
        carrierId: dto.carrierId,
        plateNumber: dto.plateNumber,
        active: dto.active,
        plannerId: dto.plannerId ?? null,
        dispatchTeamId: dto.dispatchTeamId ?? null,
        notes: dto.notes ?? null,
        certificateL: dto.certificateL,
        euro: dto.euro,
        fuelCard,
        fuelCardNumber: fuelCard ? (dto.fuelCardNumber ?? null) : null,
        fuelCardExpiry:
          fuelCard && dto.fuelCardExpiry ? new Date(dto.fuelCardExpiry) : null,
        fuelCardPin: fuelCard ? (dto.fuelCardPin ?? null) : null,
        type: dto.type,
        gb: dto.gb ?? null,
        it: dto.it ?? null,
        fr: dto.fr ?? null,
        agreement: dto.agreement ?? null,
        rateDe: dto.rateDe,
        rateUe: dto.rateUe,
        rateExport: dto.rateExport,
        rateImport: dto.rateImport,
        wasteAllowed: dto.wasteAllowed,
        wasteCountries: dto.wasteCountries ?? [],
        cabotageDe: dto.cabotageDe,
        cabotageFr: dto.cabotageFr,
        adr: dto.adr,
        adrClasses: dto.adrClasses ?? [],
        gpsMobilePhone: dto.gpsMobilePhone ?? null,
        sideNumber: dto.sideNumber ?? null,
        createdById: user.sub,
      });
    } catch (err) {
      throw uniqueViolationToConflict(
        err,
        'Pojazd o tym numerze rejestracyjnym już istnieje u tego przewoźnika',
      );
    }
  }

  private _buildUpdatePatch(
    existing: VehicleRow,
    dto: UpdateVehicleDto,
  ): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    const passthrough: (keyof UpdateVehicleDto)[] = [
      'plateNumber',
      'active',
      'plannerId',
      'dispatchTeamId',
      'notes',
      'certificateL',
      'euro',
      'fuelCard',
      'type',
      'gb',
      'it',
      'fr',
      'agreement',
      'rateDe',
      'rateUe',
      'rateExport',
      'rateImport',
      'wasteAllowed',
      'wasteCountries',
      'cabotageDe',
      'cabotageFr',
      'adr',
      'adrClasses',
      'gpsMobilePhone',
      'sideNumber',
    ];
    for (const k of passthrough) {
      if (dto[k] !== undefined) patch[k] = dto[k];
    }
    // Fuel-card fields: cleared to null whenever the EFFECTIVE fuelCard is
    // false (rule 4); otherwise apply the provided values (expiry → Date).
    const effectiveFuelCard =
      dto.fuelCard !== undefined ? dto.fuelCard : existing.fuelCard;
    if (!effectiveFuelCard) {
      patch.fuelCardNumber = null;
      patch.fuelCardExpiry = null;
      patch.fuelCardPin = null;
    } else {
      if (dto.fuelCardNumber !== undefined) {
        patch.fuelCardNumber = dto.fuelCardNumber;
      }
      if (dto.fuelCardPin !== undefined) patch.fuelCardPin = dto.fuelCardPin;
      if (dto.fuelCardExpiry !== undefined) {
        patch.fuelCardExpiry = dto.fuelCardExpiry
          ? new Date(dto.fuelCardExpiry)
          : null;
      }
    }
    if (dto.active !== undefined && !dto.active) {
      patch.deactivatedAt = new Date();
    } else if (dto.active === true) {
      patch.deactivatedAt = null;
    }
    return patch;
  }

  /**
   * Uploads each file to MinIO then inserts its `VehicleAttachment` row. If
   * anything fails, every object/row touched in this call is removed; when
   * `opts.rollbackVehicle` is set (the CREATE path) the vehicle row is
   * removed too — so a failed create never leaves a half-built vehicle.
   */
  private async _attachUploadsWithRollback(
    vehicle: VehicleRow,
    uploads: CategorizedUpload[],
    createdById: string | null,
    opts: { rollbackVehicle?: boolean } = {},
  ): Promise<VehicleRow> {
    if (uploads.length === 0) return vehicle;

    const uploadedKeys: string[] = [];
    const insertedAttachmentIds: string[] = [];
    try {
      for (const up of uploads) {
        const key = this._buildStorageKey(vehicle.id, up);
        await this.storage.put(key, up.file.buffer, up.file.mimetype);
        uploadedKeys.push(key);
        const row = await this.attachments.create({
          vehicleId: vehicle.id,
          category: up.category,
          storageKey: key,
          fileName: up.file.originalname,
          mimeType: up.file.mimetype,
          size: up.file.size,
          uploadedById: createdById,
        });
        insertedAttachmentIds.push(row.id);
      }
    } catch (err) {
      await this._rollbackUploads(uploadedKeys, insertedAttachmentIds);
      if (opts.rollbackVehicle) {
        try {
          await this.vehicles.hardDelete(vehicle.id);
        } catch (e) {
          this.logger.error(
            { err: e, vehicleId: vehicle.id },
            'Rollback: failed to remove vehicle row',
          );
        }
      }
      throw err;
    }

    const fresh = await this.vehicles.findById(vehicle.id);
    return fresh ?? vehicle;
  }

  /** Best-effort cleanup of partial uploads — never throws. */
  private async _rollbackUploads(
    uploadedKeys: string[],
    insertedAttachmentIds: string[],
  ): Promise<void> {
    for (const id of insertedAttachmentIds) {
      try {
        await this.attachments.hardDelete(id);
      } catch (e) {
        this.logger.error(
          { err: e, attachmentId: id },
          'Rollback: failed to remove attachment row',
        );
      }
    }
    for (const key of uploadedKeys) {
      try {
        await this.storage.delete(key);
      } catch (e) {
        this.logger.error(
          { err: e, key },
          'Rollback: failed to remove storage object',
        );
      }
    }
  }

  private _buildStorageKey(
    vehicleId: string,
    up: CategorizedUpload,
  ): string {
    const ext = isAllowedMimeType(up.file.mimetype)
      ? extensionForMime(up.file.mimetype)
      : 'bin';
    return `vehicles/${vehicleId}/${up.category}/${randomUUID()}.${ext}`;
  }

  /**
   * Resolves the `removeAttachmentIds` list to live attachment rows. Each id
   * must point at a non-deleted attachment of THIS vehicle — otherwise 404.
   */
  private async _resolveRemovals(
    vehicleId: string,
    ids: string[],
  ): Promise<VehicleAttachmentRow[]> {
    const rows: VehicleAttachmentRow[] = [];
    for (const id of ids) {
      const row = await this.attachments.findById(id);
      if (!row || row.vehicleId !== vehicleId) {
        throw new NotFoundException(
          `Załącznik ${id} nie należy do tego pojazdu`,
        );
      }
      rows.push(row);
    }
    return rows;
  }

  private async _loadAttachmentOf(
    vehicleId: string,
    attachmentId: string,
  ): Promise<VehicleAttachmentRow> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle) throw new NotFoundException('Pojazd nie znaleziony');
    const att = await this.attachments.findById(attachmentId);
    if (!att || att.vehicleId !== vehicleId) {
      throw new NotFoundException('Załącznik nie znaleziony');
    }
    return att;
  }

  // ── Internals: required-attachment + cross-field rules ───

  /**
   * Create-time rules. Throws a SINGLE 422 collecting every violation:
   *   - attachments: `contract` (always) + `gps` (when gpsMobilePhone set) +
   *     `cabotage_de` AND `cabotage_de_insurance` (when cabotageDe=true).
   *   - cross-field (rules 4-7): fuel-card completeness, waste countries, adr
   *     classes, min-2-of-{gb,it,fr}.
   */
  private _assertVehicleRulesOnCreate(
    dto: CreateVehicleDto,
    uploads: CategorizedUpload[],
  ): void {
    const present = this._categoriesPresent(uploads);
    const gpsPresent = this._nonEmpty(dto.gpsMobilePhone);
    const required = this._requiredCategories(dto.cabotageDe ?? false, gpsPresent);
    // Unconditional on create: umowa scan must be present.
    required.add('contract');
    const violations = [
      ...this._attachmentViolations(required, present),
      ...this._crossFieldViolations({
        fuelCard: dto.fuelCard ?? false,
        fuelCardNumber: dto.fuelCardNumber ?? null,
        fuelCardExpiry: dto.fuelCardExpiry ?? null,
        fuelCardPin: dto.fuelCardPin ?? null,
        wasteAllowed: dto.wasteAllowed ?? false,
        wasteCountries: dto.wasteCountries ?? [],
        adr: dto.adr ?? false,
        adrClasses: dto.adrClasses ?? [],
        gb: dto.gb ?? null,
        it: dto.it ?? null,
        fr: dto.fr ?? null,
      }),
    ];
    if (violations.length > 0) {
      throw new UnprocessableEntityException({ violations });
    }
  }

  /**
   * Update-time rules over the post-update effective state. The attachment set
   * is (existing live − removed + newly uploaded). `contract` is NOT re-imposed
   * on update (editing an existing vehicle never re-blocks on the umowa scan);
   * `gps` and the cabotage pair ARE re-checked against the effective flags.
   */
  private _assertVehicleRulesOnUpdate(
    existing: VehicleRow,
    dto: UpdateVehicleDto,
    uploads: CategorizedUpload[],
    removedIds: Set<string>,
  ): void {
    const eff = this._effectiveState(existing, dto);
    const required = this._requiredCategories(eff.cabotageDe, eff.gpsPresent);

    const survivingExisting = existing.attachments.filter(
      (a) => !removedIds.has(a.id),
    );
    const present = new Set<VehicleAttachmentCategory>([
      ...survivingExisting.map((a) => a.category),
      ...this._categoriesPresent(uploads),
    ]);
    const violations = [
      ...this._attachmentViolations(required, present),
      ...this._crossFieldViolations(eff),
    ];
    if (violations.length > 0) {
      throw new UnprocessableEntityException({ violations });
    }
  }

  /** Merges existing + patch into the effective post-write state (rules 4-7). */
  private _effectiveState(
    existing: VehicleRow,
    dto: UpdateVehicleDto,
  ): {
    cabotageDe: boolean;
    gpsPresent: boolean;
    fuelCard: boolean;
    fuelCardNumber: string | null;
    fuelCardExpiry: string | Date | null;
    fuelCardPin: string | null;
    wasteAllowed: boolean;
    wasteCountries: string[];
    adr: boolean;
    adrClasses: string[];
    gb: boolean | null;
    it: boolean | null;
    fr: boolean | null;
  } {
    const pick = <T>(next: T | undefined, prev: T): T =>
      next !== undefined ? next : prev;
    const gps = pick(dto.gpsMobilePhone, existing.gpsMobilePhone);
    return {
      cabotageDe: pick(dto.cabotageDe, existing.cabotageDe),
      gpsPresent: this._nonEmpty(gps),
      fuelCard: pick(dto.fuelCard, existing.fuelCard),
      fuelCardNumber: pick(dto.fuelCardNumber, existing.fuelCardNumber),
      fuelCardExpiry:
        dto.fuelCardExpiry !== undefined
          ? dto.fuelCardExpiry
          : existing.fuelCardExpiry,
      fuelCardPin: pick(dto.fuelCardPin, existing.fuelCardPin),
      wasteAllowed: pick(dto.wasteAllowed, existing.wasteAllowed),
      wasteCountries: pick(dto.wasteCountries, existing.wasteCountries),
      adr: pick(dto.adr, existing.adr),
      adrClasses: pick(dto.adrClasses, existing.adrClasses),
      gb: pick(dto.gb, existing.gb),
      it: pick(dto.it, existing.it),
      fr: pick(dto.fr, existing.fr),
    };
  }

  /** Set of attachment categories present among the uploaded files. */
  private _categoriesPresent(
    uploads: CategorizedUpload[],
  ): Set<VehicleAttachmentCategory> {
    return new Set(uploads.map((u) => u.category));
  }

  /**
   * Maps the CONDITIONAL flags to required attachment categories (rules 2, 3):
   *   - gpsPresent ⇒ `gps`
   *   - cabotageDe ⇒ `cabotage_de` AND `cabotage_de_insurance`
   * `agreement` is deliberately NOT required — the porozumienie scan is SOFT
   * (its absence only surfaces the derived `agreementScanMissing`/
   * `fuelCardBlocked` flags, never blocks a save). `contract` is added directly
   * by the create path (unconditional at create-time only).
   */
  private _requiredCategories(
    cabotageDe: boolean,
    gpsPresent: boolean,
  ): Set<VehicleAttachmentCategory> {
    const required = new Set<VehicleAttachmentCategory>();
    if (gpsPresent) required.add('gps');
    if (cabotageDe) {
      required.add('cabotage_de');
      required.add('cabotage_de_insurance');
    }
    return required;
  }

  private _attachmentViolations(
    required: Set<VehicleAttachmentCategory>,
    present: Set<VehicleAttachmentCategory>,
  ): string[] {
    const violations: string[] = [];
    for (const cat of required) {
      if (!present.has(cat)) violations.push(REQUIRED_ATTACHMENT_MESSAGES[cat]);
    }
    return violations;
  }

  /** Cross-field rules 4-7 over the effective vehicle state. */
  private _crossFieldViolations(eff: {
    fuelCard: boolean;
    fuelCardNumber: string | null;
    fuelCardExpiry: string | Date | null;
    fuelCardPin: string | null;
    wasteAllowed: boolean;
    wasteCountries: string[];
    adr: boolean;
    adrClasses: string[];
    gb: boolean | null;
    it: boolean | null;
    fr: boolean | null;
  }): string[] {
    const v: string[] = [];
    // Rule 4 — fuel-card completeness.
    if (eff.fuelCard) {
      if (!/^\d{16}$/.test(eff.fuelCardNumber ?? '')) {
        v.push(CROSS_FIELD_MESSAGES.fuelCardNumber);
      }
      if (!eff.fuelCardExpiry) v.push(CROSS_FIELD_MESSAGES.fuelCardExpiry);
      if (!/^\d{4,6}$/.test(eff.fuelCardPin ?? '')) {
        v.push(CROSS_FIELD_MESSAGES.fuelCardPin);
      }
    }
    // Rule 5 — waste countries.
    if (eff.wasteAllowed && eff.wasteCountries.length < 1) {
      v.push(CROSS_FIELD_MESSAGES.wasteCountries);
    }
    // Rule 6 — adr classes.
    if (eff.adr && eff.adrClasses.length < 1) {
      v.push(CROSS_FIELD_MESSAGES.adrClasses);
    }
    // Rule 7 — min 2 of {gb, it, fr}.
    const trues = [eff.gb, eff.it, eff.fr].filter((x) => x === true).length;
    if (trues < 2) v.push(CROSS_FIELD_MESSAGES.ukItFr);
    return v;
  }

  /** True when the string is present and non-blank. */
  private _nonEmpty(v: string | null | undefined): boolean {
    return typeof v === 'string' && v.trim().length > 0;
  }

  // ── Internals: scoping / role checks ─────────────────────

  private async _scopeFilters(
    user: AuthUser,
    filters: VehicleFilters,
  ): Promise<VehicleFilters & { carrierIds?: string[] }> {
    if (user.role === 'admin') {
      return filters;
    }
    if (user.role === 'opiekun') {
      // Restrict to vehicles of carriers this opiekun owns. Phase 5.1:
      // opiekun no longer needs to pass `carrierId` — without one we narrow
      // to the union of their owned carriers; with one, we verify it's in
      // the union (else 403) and keep the more specific filter. Single
      // carriers query + the main vehicles query — performance budget OK.
      const opiekunCarriers = await this.carriers.list({
        opiekunId: user.sub,
        limit: 200,
      });
      const ownedIds = opiekunCarriers.map((c) => c.id);
      if (filters.carrierId) {
        if (!ownedIds.includes(filters.carrierId)) {
          throw new ForbiddenException(
            'Nie masz uprawnień do tego przewoźnika',
          );
        }
        // `carrierId` already narrows the query — no need to forward the
        // union set. Repo `where.carrierId = ?` uses the FK index directly.
        return filters;
      }
      // Narrow by `carrierIds: [...]` so the SQL is `WHERE carrierId IN (...)`
      // — single query, FK-indexed. Empty union → repo short-circuits to ∅.
      return { ...filters, carrierIds: ownedIds };
    }
    if (user.role === 'planista') {
      return { ...filters, plannerId: user.sub };
    }
    if (user.role === 'dyspozytor') {
      // Phase 11 — dyspozytor sees vehicles of THEIR dispatch team. A
      // dyspozytor with NO team sees an EMPTY set (sentinel → 0 rows), never
      // "all" — explicit per the locked decision.
      return {
        ...filters,
        dispatchTeamId: user.teamId ?? NO_TEAM_SENTINEL,
      };
    }
    if (user.role === 'przewoznik') {
      const own = await this.carriers.list({
        // We want THIS user's carrier — there's no opiekunId match here, so
        // we list with a tight limit and filter by the matching userId.
        limit: 200,
      });
      const mine = own.find((c) => c.userId === user.sub);
      if (!mine) {
        throw new ForbiddenException('Brak profilu przewoźnika');
      }
      if (filters.carrierId && filters.carrierId !== mine.id) {
        throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
      }
      return { ...filters, carrierId: mine.id };
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  private async _assertCarrierAccessibleForWrite(
    user: AuthUser,
    carrierId: string,
  ): Promise<void> {
    if (user.role === 'admin') return;
    const carrier = await this.carriers.findById(carrierId);
    if (!carrier) throw new NotFoundException('Przewoźnik nie znaleziony');
    if (user.role === 'opiekun') {
      if (carrier.opiekunId !== user.sub) {
        throw new ForbiddenException(
          'Nie masz uprawnień do tego przewoźnika',
        );
      }
      return;
    }
    if (user.role === 'przewoznik') {
      if (carrier.userId !== user.sub) {
        throw new ForbiddenException(
          'Nie masz uprawnień do tego przewoźnika',
        );
      }
      return;
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  private async _assertRole(
    userId: string,
    requiredRole: 'planista',
  ): Promise<void> {
    const target = await this.users.findById(userId);
    if (!target) {
      throw new UnprocessableEntityException(
        `Wskazany użytkownik (${requiredRole}) nie istnieje`,
      );
    }
    if (target.role !== requiredRole) {
      throw new UnprocessableEntityException(
        `Wskazany użytkownik nie ma roli ${requiredRole}`,
      );
    }
    if (!target.active) {
      throw new UnprocessableEntityException(
        `Wskazany użytkownik (${requiredRole}) jest nieaktywny`,
      );
    }
  }

  /**
   * Phase 11 — a vehicle may only be assigned to an EXISTING, ACTIVE dispatch
   * Team. A missing or inactive team is a 422 (matches the role-assert posture
   * for `plannerId`). The team's dispatcher membership is NOT validated here —
   * a team with zero dispatchers is a legal (if temporarily empty) assignment.
   */
  private async _assertTeamActive(teamId: string): Promise<void> {
    const team = await this.teams.findById(teamId);
    if (!team) {
      throw new UnprocessableEntityException(
        `Wskazany zespół (${teamId}) nie istnieje`,
      );
    }
    if (!team.active) {
      throw new UnprocessableEntityException(
        `Wskazany zespół (${teamId}) jest nieaktywny`,
      );
    }
  }

  // ── DTO mapping ──────────────────────────────────────────

  toDto(row: VehicleRow): VehicleDto {
    return {
      id: row.id,
      carrierId: row.carrierId,
      plateNumber: row.plateNumber,
      active: row.active,
      notes: row.notes,
      certificateL: row.certificateL,
      euro: row.euro,
      fuelCard: row.fuelCard,
      fuelCardNumber: row.fuelCardNumber,
      fuelCardExpiry: row.fuelCardExpiry
        ? row.fuelCardExpiry.toISOString().slice(0, 10)
        : null,
      fuelCardPin: row.fuelCardPin,
      type: row.type,
      gb: row.gb,
      it: row.it,
      fr: row.fr,
      agreement: row.agreement,
      rateDe: row.rateDe,
      rateUe: row.rateUe,
      rateExport: row.rateExport,
      rateImport: row.rateImport,
      wasteAllowed: row.wasteAllowed,
      wasteCountries: row.wasteCountries as VehicleDto['wasteCountries'],
      cabotageDe: row.cabotageDe,
      cabotageFr: row.cabotageFr,
      adr: row.adr,
      adrClasses: row.adrClasses as VehicleDto['adrClasses'],
      gpsMobilePhone: row.gpsMobilePhone,
      sideNumber: row.sideNumber,
      lastDroveAt: row.lastDroveAt ? row.lastDroveAt.toISOString() : null,
      plannerId: row.plannerId,
      planner: row.planner,
      dispatchTeamId: row.dispatchTeamId,
      dispatchTeam: row.dispatchTeam,
      carrier: row.carrier,
      opiekun: row.opiekun,
      attachments: row.attachments.map((a) => vehicleRowAttachmentToDto(a)),
      ...computeVehicleDerivedFlags(row),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

/**
 * Polish 422 messages for each missing required-attachment category.
 *
 * `contract` is unconditionally required on create; `gps` is required when a
 * tracker device id is present; the two `cabotage_de*` scans are required
 * together when cabotageDe=true. `agreement` never appears as a required
 * violation (SOFT), but the Record must be total over the enum.
 */
const REQUIRED_ATTACHMENT_MESSAGES: Record<VehicleAttachmentCategory, string> =
  {
    contract: 'Wymagany skan umowy (contract) przy tworzeniu pojazdu',
    gps: 'Wymagany skan umowy GPS (gps) gdy podano identyfikator GPS',
    agreement: 'Wymagany skan porozumienia (agreement)',
    cabotage_de: 'Wymagany skan pozwolenia kabotażowego DE gdy cabotageDe=true',
    cabotage_de_insurance:
      'Wymagany skan ubezpieczenia kabotażowego DE gdy cabotageDe=true',
  };

/** Polish 422 messages for the cross-field rules (4-7). */
const CROSS_FIELD_MESSAGES = {
  fuelCardNumber:
    'fuelCardNumber (16 cyfr) wymagany gdy fuelCard=true',
  fuelCardExpiry: 'fuelCardExpiry wymagany gdy fuelCard=true',
  fuelCardPin: 'fuelCardPin (4–6 cyfr) wymagany gdy fuelCard=true',
  wasteCountries:
    'wasteCountries wymaga min. 1 kraju gdy wasteAllowed=true',
  adrClasses: 'adrClasses wymaga min. 1 klasy gdy adr=true',
  ukItFr: 'Wymagane min. 2 z 3 dostępów: gb / it / fr',
} as const;

/** Maps a standalone attachment repo row to the public DTO (no storageKey). */
function attachmentRowToDto(row: VehicleAttachmentRow): VehicleAttachmentDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Maps an included vehicle-row attachment to the public DTO (no storageKey). */
function vehicleRowAttachmentToDto(
  row: VehicleRowAttachment,
): VehicleAttachmentDto {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    category: row.category,
    fileName: row.fileName,
    mimeType: row.mimeType,
    size: row.size,
    uploadedById: row.uploadedById,
    createdAt: row.createdAt.toISOString(),
  };
}
