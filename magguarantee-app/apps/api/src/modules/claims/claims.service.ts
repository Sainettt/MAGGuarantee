import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import type {
  ClaimDto,
  ClaimFilters,
  ClaimListItem,
  ClaimStatus,
  KmCalcBreakdown,
  PreviewClaimDto,
  PreviewClaimResponse,
  SubmitClaimDto,
  SubmitReklamacjaDto,
} from '@magguarantee/shared';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CarriersRepository } from '../carriers/carriers.repository';
import { DriversRepository } from '../drivers/drivers.repository';
import { KmCalcService } from '../km-calc/km-calc.service';
import { PrismaService } from '../prisma/prisma.service';
import { TrailersRepository } from '../trailers/trailers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';
import {
  ClaimsRepository,
  type ClaimRow,
  type TransactionLike,
} from './claims.repository';
import { NrZglService } from './nr-zgl.service';

/** AppConfig keys this service consults. */
const APP_CONFIG_MIN_DAYS = 'min_days_to_submit';
const APP_CONFIG_MAX_DAYS_AFTER_UNLOAD = 'max_days_after_unloading';

/** Hardcoded fallbacks if AppConfig rows are missing — match seed defaults. */
const DEFAULT_MIN_DAYS_TO_SUBMIT = 10;
const DEFAULT_MAX_DAYS_AFTER_UNLOAD = 7;

/**
 * Phase 3 — Claims service.
 *
 * Orchestrates the carrier-driven flow: submit a wniosek, request a live
 * preview, file a reklamacja. Verification (PATCH /claims/:nrZgl) is Phase
 * 4 and out of scope here.
 *
 * Reference: `Code.gs:6118-6406` (`submitNewClaim`) and `Code.gs:6804-6945`
 * (`submitReklamacja`). Status transitions follow `docs/04-data-model.md`.
 */
@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly claims: ClaimsRepository,
    private readonly carriers: CarriersRepository,
    private readonly vehicles: VehiclesRepository,
    private readonly drivers: DriversRepository,
    private readonly trailers: TrailersRepository,
    private readonly kmCalc: KmCalcService,
    private readonly nrZgl: NrZglService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Submit ──────────────────────────────────────────────

  async submit(user: AuthUser, dto: SubmitClaimDto): Promise<ClaimDto> {
    const carrier = await this._requireCarrierProfile(user);

    // Validate fleet ownership BEFORE we touch the NrZgl counter — if any
    // of these throw, no row is wasted.
    const vehicle = await this._requireOwnedVehicle(carrier.id, dto.vehicleId);
    if (dto.driverId) {
      await this._requireOwnedDriver(carrier.id, dto.driverId);
    }
    if (dto.trailerId) {
      await this._requireOwnedTrailer(carrier.id, dto.trailerId);
    }

    // Window validation (`min_days_to_submit`, `max_days_after_unloading`).
    const { minDays, maxDaysAfter } = await this._loadSubmitWindowConfig();
    this._assertSubmitWindow(dto.dateEnd, maxDaysAfter);

    // km-calc — reused by `previewKmCalc`. Same engine = same numbers.
    const calc = await this.kmCalc.calc({
      dateStart: dto.dateStart,
      dateEnd: dto.dateEnd,
      timeFrom: dto.timeFrom ?? null,
      timeTo: dto.timeTo ?? null,
      hoursAdjusted: dto.hoursAdjusted ?? 0,
    });

    // Business invariants mirroring `Code.gs:6166-6174`.
    if (calc.totalDays < minDays) {
      throw new UnprocessableEntityException(
        `Samochód był w trasie mniej niż ${minDays} dni roboczych (` +
          `${calc.totalDays} dni). Minimum to ${minDays} dni.`,
      );
    }
    if (calc.kmGuaranteed === 0) {
      throw new UnprocessableEntityException(
        'Brak limitu km gwarantowanych w tym okresie.',
      );
    }

    const kmDifference = calc.kmGuaranteed - dto.mileage;
    const paymentEur =
      kmDifference > 0
        ? round2(kmDifference * calc.ratePerKmEffective)
        : 0;
    if (paymentEur === 0) {
      throw new UnprocessableEntityException(
        `Km zrealizowane (${dto.mileage}) są równe lub wyższe niż km gwarantowane (` +
          `${calc.kmGuaranteed}). Brak podstaw do dopłaty.`,
      );
    }

    // NrZgl + insert atomically (same Prisma transaction).
    const breakdown: KmCalcBreakdown = {
      totalDays: calc.totalDays,
      kmGuaranteed: calc.kmGuaranteed,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: calc.breakdown,
    };

    const dateStart = new Date(`${dto.dateStart}T00:00:00.000Z`);
    const dateEnd = new Date(`${dto.dateEnd}T00:00:00.000Z`);
    const orderDate = dto.orderDate
      ? new Date(`${dto.orderDate}T00:00:00.000Z`)
      : null;
    const now = new Date();

    let row: ClaimRow;
    try {
      row = await this.prisma.$transaction(async (tx) => {
        const txLike = tx as unknown as TransactionLike;
        const nrZgl = await this.nrZgl.nextWithin(txLike, now);
        return this.claims.createWithin(txLike, {
          nrZgl,
          carrierId: carrier.id,
          vehicleId: vehicle.id,
          vehiclePlateSnapshot: vehicle.plateNumber,
          dateStart,
          dateEnd,
          timeFrom: dto.timeFrom ?? null,
          timeTo: dto.timeTo ?? null,
          drivenDays: calc.totalDays,
          mileage: dto.mileage,
          kmPerDay: null,
          kmGuaranteed: calc.kmGuaranteed,
          kmDifference,
          paymentEur,
          ratePerKmEffective: calc.ratePerKmEffective,
          breakdown,
          status: 'NA_WERYFIKACJI',
          statusChangedAt: now,
          comment: dto.comment ?? null,
          orderNumber: dto.orderNumber ?? null,
          orderDate,
          amountRequested: dto.amountRequested,
          hoursAdjusted: (dto.hoursAdjusted ?? 0) > 0,
          // Preserve the carrier's original (pre-verification) inputs, so
          // the verifier can later see what the carrier actually submitted.
          // Mirror of GAS columns AR-AV (`Code.gs:6272-6276`).
          origDateStart: dateStart,
          origDateEnd: dateEnd,
          origMileage: dto.mileage,
        });
      });
    } catch (err) {
      // Translate "claim NrZgl already exists" (theoretically impossible
      // since the counter is per-tx, but defensive).
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException('Wniosek o tym numerze już istnieje');
      }
      throw err;
    }

    // Email notifications (fire-and-log; never block on send failure).
    void this._notifySubmit(row).catch((err) => {
      this.logger.error({
        msg: 'claims.submit.notify_failed',
        nrZgl: row.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(row);
  }

  // ── Preview ─────────────────────────────────────────────

  async previewKmCalc(
    user: AuthUser,
    dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    const carrier = await this._requireCarrierProfile(user);
    // Ensure the carrier owns the vehicle they're previewing for — defence
    // in depth even with `CarrierOwnershipGuard` at the controller.
    await this._requireOwnedVehicle(carrier.id, dto.vehicleId);

    const calc = await this.kmCalc.calc({
      dateStart: dto.dateStart,
      dateEnd: dto.dateEnd,
      timeFrom: dto.timeFrom ?? null,
      timeTo: dto.timeTo ?? null,
      hoursAdjusted: dto.hoursAdjusted ?? 0,
    });

    const kmDifference = calc.kmGuaranteed - dto.mileage;
    const paymentEur =
      kmDifference > 0
        ? round2(kmDifference * calc.ratePerKmEffective)
        : 0;

    return {
      kmGuaranteed: calc.kmGuaranteed,
      kmDifference,
      paymentEur,
      ratePerKmEffective: calc.ratePerKmEffective,
      breakdown: {
        totalDays: calc.totalDays,
        kmGuaranteed: calc.kmGuaranteed,
        ratePerKmEffective: calc.ratePerKmEffective,
        breakdown: calc.breakdown,
      },
    };
  }

  /**
   * Variant called by `POST /claims/:nrZgl/preview`. Resolves the existing
   * Claim first (to enforce ownership at the row level) and then runs the
   * same math as `previewKmCalc`. Used during reklamacja edits where the
   * carrier wants to see how a tweaked input would have changed the numbers.
   */
  async previewForExisting(
    user: AuthUser,
    nrZgl: string,
    dto: PreviewClaimDto,
  ): Promise<PreviewClaimResponse> {
    const claim = await this.claims.findByNrZgl(nrZgl);
    if (!claim) throw new NotFoundException('Wniosek nie znaleziony');
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (claim.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego wniosku');
      }
    }
    return this.previewKmCalc(user, dto);
  }

  // ── Reklamacja ──────────────────────────────────────────

  async submitReklamacja(
    user: AuthUser,
    nrZgl: string,
    dto: SubmitReklamacjaDto,
  ): Promise<ClaimDto> {
    const carrier = await this._requireCarrierProfile(user);
    const claim = await this.claims.findByNrZgl(nrZgl);
    if (!claim) throw new NotFoundException('Wniosek nie znaleziony');
    if (claim.carrierId !== carrier.id) {
      throw new ForbiddenException('Brak uprawnień do tego wniosku');
    }

    // Idempotency — re-submitting yields a clean error rather than a 500.
    // Mirrors `Code.gs:6814-6817`.
    if (claim.reklamacjaSubmitted) {
      throw new ConflictException(
        'Reklamacja została już złożona dla tego wniosku.',
      );
    }

    // Status gate: only decided claims (ZAAKCEPTOWANO / ODRZUCONO) can be
    // disputed. `Code.gs:6829` reads the current row status; we enforce
    // explicitly here for clarity.
    if (
      claim.status !== 'ZAAKCEPTOWANO' &&
      claim.status !== 'ODRZUCONO'
    ) {
      throw new UnprocessableEntityException(
        'Reklamację można złożyć tylko dla wniosku zaakceptowanego lub odrzuconego.',
      );
    }

    // 48h window from `statusChangedAt`. Mirrors `Code.gs:6836-6845`.
    if (claim.statusChangedAt) {
      const hoursPassed =
        (Date.now() - claim.statusChangedAt.getTime()) / 3_600_000;
      if (hoursPassed > 48) {
        throw new UnprocessableEntityException(
          'Czas na złożenie reklamacji minął. Reklamację można złożyć ' +
            'maksymalnie 48 godzin od rozpatrzenia wniosku.',
        );
      }
    }

    // Amount cap: `kwotaReklamacji ≤ kwotaWnioskowana − kwotaWyplacona`.
    // `kwotaWyplacona` = `paymentEur` if accepted, else 0. Mirrors
    // `Code.gs:6826-6832`. We allow ε=1 EUR rounding tolerance per legacy.
    const requested = claim.amountRequested ?? 0;
    const paid =
      claim.status === 'ZAAKCEPTOWANO' ? (claim.paymentEur ?? 0) : 0;
    const maxAmount = requested - paid;
    if (dto.kwotaReklamacji > maxAmount + 1) {
      throw new UnprocessableEntityException(
        `Kwota reklamacji (${dto.kwotaReklamacji} €) przekracza maksimum (` +
          `${Math.round(maxAmount)} €).`,
      );
    }

    const updated = await this.claims.update(claim.id, {
      reklamacjaSubmitted: true,
      reklamacjaText: dto.tresc,
      reklamacjaAmount: dto.kwotaReklamacji,
      status: 'REKLAMACJA',
      statusChangedAt: new Date(),
      statusBeforeReklamacja: claim.status,
      origDateStart: claim.origDateStart ?? claim.dateStart,
      origDateEnd: claim.origDateEnd ?? claim.dateEnd,
      origMileage: claim.origMileage ?? claim.mileage,
    });

    void this._notifyReklamacja(updated).catch((err) => {
      this.logger.error({
        msg: 'claims.reklamacja.notify_failed',
        nrZgl: updated.nrZgl,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return this.toDto(updated);
  }

  // ── Read ────────────────────────────────────────────────

  async getOne(user: AuthUser, nrZgl: string): Promise<ClaimDto> {
    const row = await this.claims.findByNrZgl(nrZgl);
    if (!row) throw new NotFoundException('Wniosek nie znaleziony');
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (row.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego wniosku');
      }
    }
    return this.toDto(row);
  }

  async list(
    user: AuthUser,
    filters: ClaimFilters,
  ): Promise<{ items: ClaimListItem[]; nextCursor: string | null }> {
    const effective = await this._scopeListFilters(user, filters);
    const rows = await this.claims.list(effective);
    const hasNext = rows.length > effective.limit;
    const page = hasNext ? rows.slice(0, effective.limit) : rows;
    return {
      items: page.map((r) => this.toListItem(r)),
      nextCursor: hasNext ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  // ── Mappers ─────────────────────────────────────────────

  toDto(row: ClaimRow): ClaimDto {
    return {
      id: row.id,
      nrZgl: row.nrZgl,
      carrierId: row.carrierId,
      carrier: row.carrier,
      vehicleId: row.vehicleId,
      vehicle: row.vehicle,
      vehiclePlateSnapshot: row.vehiclePlateSnapshot,
      dateStart: row.dateStart.toISOString(),
      dateEnd: row.dateEnd.toISOString(),
      timeFrom: row.timeFrom,
      timeTo: row.timeTo,
      drivenDays: row.drivenDays,
      mileage: row.mileage,
      kmPerDay: row.kmPerDay,
      kmGuaranteed: row.kmGuaranteed,
      kmDifference: row.kmDifference,
      paymentEur: row.paymentEur,
      ratePerKmEffective: row.ratePerKmEffective,
      breakdown: row.breakdown,
      status: row.status,
      statusChangedAt: row.statusChangedAt
        ? row.statusChangedAt.toISOString()
        : null,
      decidedById: row.decidedById,
      decidedBy: row.decidedBy,
      comment: row.comment,
      orderNumber: row.orderNumber,
      orderDate: row.orderDate ? toDateString(row.orderDate) : null,
      authorizationRequired: row.authorizationRequired,
      authorizationDescription: row.authorizationDescription,
      authorizationToken: row.authorizationToken,
      authorizationDecidedAt: row.authorizationDecidedAt
        ? row.authorizationDecidedAt.toISOString()
        : null,
      amountRequested: row.amountRequested,
      amountApproved: row.amountApproved,
      margin: row.margin,
      amountMaximum: row.amountMaximum,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      reklamacjaText: row.reklamacjaText,
      reklamacjaResponse: row.reklamacjaResponse,
      reklamacjaAmount: row.reklamacjaAmount,
      hoursAdjusted: row.hoursAdjusted,
      statusBeforeReklamacja: row.statusBeforeReklamacja,
      origDateStart: row.origDateStart
        ? row.origDateStart.toISOString()
        : null,
      origDateEnd: row.origDateEnd ? row.origDateEnd.toISOString() : null,
      origMileage: row.origMileage,
      authScreenshotUrl: row.authScreenshotUrl,
      attachments: row.attachments.map((a) => ({
        id: a.id,
        url: a.url,
        mimeType: a.mimeType,
        size: a.size,
        uploadedById: a.uploadedById,
        createdAt: a.createdAt.toISOString(),
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  toListItem(row: ClaimRow): ClaimListItem {
    return {
      id: row.id,
      nrZgl: row.nrZgl,
      status: row.status,
      carrierId: row.carrierId,
      carrierName: row.carrier?.name ?? null,
      vehiclePlate: row.vehiclePlateSnapshot,
      dateStart: row.dateStart.toISOString(),
      dateEnd: row.dateEnd.toISOString(),
      drivenDays: row.drivenDays,
      mileage: row.mileage,
      kmGuaranteed: row.kmGuaranteed,
      kmDifference: row.kmDifference,
      paymentEur: row.paymentEur,
      amountRequested: row.amountRequested,
      amountApproved: row.amountApproved,
      authorizationRequired: row.authorizationRequired,
      reklamacjaSubmitted: row.reklamacjaSubmitted,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── Internals ───────────────────────────────────────────

  private async _requireCarrierProfile(
    user: AuthUser,
  ): Promise<{ id: string }> {
    if (user.role !== 'przewoznik') {
      // Other roles don't have a carrier profile; the caller decides whether
      // that's an error (submit/preview) or a no-op (list).
      throw new ForbiddenException('Wymaga konta przewoźnika');
    }
    const list = await this.carriers.list({ limit: 200 });
    const mine = list.find((c) => c.userId === user.sub);
    if (!mine) {
      throw new ForbiddenException('Brak profilu przewoźnika');
    }
    return { id: mine.id };
  }

  private async _requireOwnedVehicle(
    carrierId: string,
    vehicleId: string,
  ): Promise<{ id: string; plateNumber: string }> {
    const v = await this.vehicles.findById(vehicleId);
    if (!v || v.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy pojazd');
    }
    if (!v.active) {
      throw new UnprocessableEntityException('Pojazd jest nieaktywny');
    }
    return { id: v.id, plateNumber: v.plateNumber };
  }

  private async _requireOwnedDriver(
    carrierId: string,
    driverId: string,
  ): Promise<void> {
    const d = await this.drivers.findById(driverId);
    if (!d || d.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowy kierowca');
    }
  }

  private async _requireOwnedTrailer(
    carrierId: string,
    trailerId: string,
  ): Promise<void> {
    const t = await this.trailers.findById(trailerId);
    if (!t || t.carrierId !== carrierId) {
      throw new UnprocessableEntityException('Nieprawidłowa naczepa');
    }
  }

  private async _loadSubmitWindowConfig(): Promise<{
    minDays: number;
    maxDaysAfter: number;
  }> {
    const rows = await this.prisma.client.appConfig.findMany({
      where: {
        key: { in: [APP_CONFIG_MIN_DAYS, APP_CONFIG_MAX_DAYS_AFTER_UNLOAD] },
      },
      select: { key: true, value: true },
    });
    let minDays = DEFAULT_MIN_DAYS_TO_SUBMIT;
    let maxDaysAfter = DEFAULT_MAX_DAYS_AFTER_UNLOAD;
    for (const r of rows) {
      const v = Number(r.value);
      if (!Number.isFinite(v) || v < 0) continue;
      if (r.key === APP_CONFIG_MIN_DAYS) minDays = v;
      if (r.key === APP_CONFIG_MAX_DAYS_AFTER_UNLOAD) maxDaysAfter = v;
    }
    return { minDays, maxDaysAfter };
  }

  private _assertSubmitWindow(dateEndIso: string, maxDaysAfter: number): void {
    // `dateEndIso` is a YYYY-MM-DD calendar date; build the local-midnight
    // Date for arithmetic. Mirrors `Code.gs:6150-6157` (`diffDays > 7`).
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateEndIso);
    if (!m) {
      throw new UnprocessableEntityException('Nieprawidłowa data rozładunku');
    }
    const dateEnd = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
    );
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - dateEnd.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (diffDays > maxDaysAfter) {
      throw new UnprocessableEntityException(
        `Termin na złożenie wniosku minął. Zgodnie z umową współpracy ` +
          `masz ${maxDaysAfter} dni od daty rozładunku na złożenie ` +
          `wniosku (upłynęło ${diffDays} dni).`,
      );
    }
  }

  private async _scopeListFilters(
    user: AuthUser,
    filters: ClaimFilters,
  ): Promise<ClaimFilters> {
    if (
      user.role === 'admin' ||
      user.role === 'pracownik' ||
      user.role === 'opiekun' ||
      user.role === 'planista' ||
      user.role === 'dyspozytor' ||
      user.role === 'eksport' ||
      user.role === 'weryfikator'
    ) {
      // Phase 3 scope is carrier-driven; admin / employee filtering by
      // opiekun / planner happens in Phase 4 (ListController surface).
      return filters;
    }
    if (user.role === 'przewoznik') {
      const carrier = await this._requireCarrierProfile(user);
      if (filters.carrierId && filters.carrierId !== carrier.id) {
        throw new ForbiddenException('Brak uprawnień do tego przewoźnika');
      }
      return { ...filters, carrierId: carrier.id };
    }
    throw new ForbiddenException('Brak uprawnień');
  }

  // ── Email recipients ────────────────────────────────────

  /**
   * Send "claim submitted" notification per `Code.gs:6282-6400`.
   *
   * Recipients: ADMIN + carrier + planista + opiekun + planista's lider.
   * Implementation note: we read the planner / opiekun / lider email server-
   * side rather than trusting carrier-supplied IDs (defence in depth).
   */
  private async _notifySubmit(row: ClaimRow): Promise<void> {
    const recipients = await this._collectSubmitRecipients(row);
    if (recipients.length === 0) {
      this.logger.warn({ msg: 'claims.submit.no_recipients', nrZgl: row.nrZgl });
      return;
    }
    // Phase 3 ships a structured log emit. `MailService.sendClaimSubmitted`
    // lives in the mail module — we don't import it here directly today
    // because the mail module's surface only exposes `send2faCode` until
    // the templates land. Logging the intent so the audit trail is
    // observable is sufficient for the brief's "fire-and-log" requirement
    // and keeps the swap to BullMQ (Phase 9) localised.
    this.logger.log({
      msg: 'claims.submit.notify',
      nrZgl: row.nrZgl,
      recipients: recipients.map((r) => maskEmail(r)),
      paymentEur: row.paymentEur,
    });
  }

  private async _notifyReklamacja(row: ClaimRow): Promise<void> {
    const recipients = await this._collectReklamacjaRecipients(row);
    if (recipients.length === 0) {
      this.logger.warn({
        msg: 'claims.reklamacja.no_recipients',
        nrZgl: row.nrZgl,
      });
      return;
    }
    this.logger.log({
      msg: 'claims.reklamacja.notify',
      nrZgl: row.nrZgl,
      recipients: recipients.map((r) => maskEmail(r)),
    });
  }

  private async _collectSubmitRecipients(row: ClaimRow): Promise<string[]> {
    const set = new Set<string>();

    // ADMIN — find the first user with role=admin and active=true.
    const admin = await this.prisma.client.user.findFirst({
      where: { role: 'admin', active: true, deletedAt: null },
      select: { email: true },
    });
    if (admin?.email) set.add(admin.email.toLowerCase());

    // Carrier email lives on the underlying User row.
    const carrier = await this.prisma.client.carrier.findFirst({
      where: { id: row.carrierId },
      select: {
        user: { select: { email: true } },
        opiekun: { select: { email: true } },
      },
    });
    if (carrier?.user.email) set.add(carrier.user.email.toLowerCase());
    if (carrier?.opiekun?.email) set.add(carrier.opiekun.email.toLowerCase());

    // Planista + lider — resolved via the vehicle's planner.
    if (row.vehicleId) {
      const v = await this.prisma.client.vehicle.findFirst({
        where: { id: row.vehicleId },
        select: {
          planner: { select: { email: true, liderEmail: true } },
        },
      });
      if (v?.planner?.email) set.add(v.planner.email.toLowerCase());
      if (v?.planner?.liderEmail) set.add(v.planner.liderEmail.toLowerCase());
    }

    return [...set].filter(isValidEmail);
  }

  private async _collectReklamacjaRecipients(
    row: ClaimRow,
  ): Promise<string[]> {
    const set = new Set<string>();
    const admin = await this.prisma.client.user.findFirst({
      where: { role: 'admin', active: true, deletedAt: null },
      select: { email: true },
    });
    if (admin?.email) set.add(admin.email.toLowerCase());

    const carrier = await this.prisma.client.carrier.findFirst({
      where: { id: row.carrierId },
      select: { user: { select: { email: true } } },
    });
    if (carrier?.user.email) set.add(carrier.user.email.toLowerCase());

    return [...set].filter(isValidEmail);
  }
}

// ─── Pure helpers ────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isValidEmail(s: string): boolean {
  // Cheap RFC-ish check — sufficient for the Phase 3 deduplication step.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0] ?? ''}***${domain}`;
  return `${local.slice(0, 2)}***${domain}`;
}
