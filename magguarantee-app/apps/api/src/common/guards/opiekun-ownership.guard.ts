import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from '../../modules/auth/decorators/current-user.decorator';
import { PrismaService } from '../../modules/prisma/prisma.service';
import {
  OPIEKUN_OWNERSHIP_KEY,
  type OwnershipMeta,
} from './ownership.constants';

/**
 * Asserts that the carrier referenced by the current request belongs to the
 * authenticated opiekun (i.e., `carrier.opiekunId === user.sub`).
 *
 * Per docs/15-auth-strategy.md#OpiekunOwnershipGuard and docs/03-roles.md
 * (#opiekun):
 *
 *  - admin → pass through (global access)
 *  - non-opiekun roles → pass through (this guard has no opinion; other
 *    guards such as `CarrierOwnershipGuard` or `PermissionsGuard` cover them).
 *    pracownik is excluded by `@RequirePermission` on every CRUD endpoint per
 *    docs/03-roles.md#pracownik (claims-only role).
 *  - opiekun → must own the targeted carrier; otherwise 403
 *
 * The target identifier comes from the `@OpiekunOwns(...)` decorator. If the
 * decorator names a vehicle / driver / trailer / claim / delegation, we
 * resolve through to its `carrierId` before checking ownership.
 *
 * NOTE on architecture: this guard reaches into `PrismaService` directly
 * rather than going through a feature repository. Repositories arrive in
 * Wave 3 (CRUD modules). Until then, putting the lookup in the guard keeps
 * the dependency graph clean and avoids creating placeholder modules.
 */
@Injectable()
export class OpiekunOwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<OwnershipMeta | undefined>(
      OPIEKUN_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );
    // Decorator-driven: no metadata → no opinion.
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string | undefined>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException('Brak uprawnień');
    }

    // admin bypass — global access per docs/03-roles.md. pracownik does NOT
    // bypass: it is excluded from carrier/vehicle/driver/trailer CRUD by their
    // `@RequirePermission` (docs/03-roles.md#pracownik), so it should never reach
    // this guard via those routes; if it ever did, falling through to the
    // opiekun branch below would still deny (it has no `opiekunId` match).
    if (user.role === 'admin') return true;

    // Other roles (przewoznik, planista, dyspozytor, eksport, weryfikator)
    // are governed by their own guards; this one only fires for opiekun.
    if (user.role !== 'opiekun') return true;

    const rawId = this._extractId(req, meta);
    if (!rawId) {
      throw new BadRequestException(
        `Brak identyfikatora zasobu (${meta.source}.${meta.name})`,
      );
    }

    const carrierId = await this._resolveCarrierId(rawId, meta.as);
    if (!carrierId) {
      throw new NotFoundException('Zasób nie znaleziony');
    }

    const carrier = await this.prisma.client.carrier.findFirst({
      where: { id: carrierId, deletedAt: null },
      select: { id: true, opiekunId: true },
    });
    if (!carrier) {
      throw new NotFoundException('Przewoźnik nie znaleziony');
    }
    if (carrier.opiekunId !== user.sub) {
      throw new ForbiddenException('Nie masz uprawnień do tego przewoźnika');
    }
    return true;
  }

  // ── helpers ──────────────────────────────────────────────

  private _extractId(
    req: {
      params?: Record<string, string | undefined>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    },
    meta: OwnershipMeta,
  ): string | undefined {
    const bag =
      meta.source === 'param'
        ? req.params
        : meta.source === 'body'
          ? req.body
          : req.query;
    if (!bag) return undefined;
    const value = (bag as Record<string, unknown>)[meta.name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private async _resolveCarrierId(
    id: string,
    kind: OwnershipMeta['as'],
  ): Promise<string | null> {
    switch (kind) {
      case 'carrierId':
        return id;
      case 'vehicleId': {
        const row = await this.prisma.client.vehicle.findFirst({
          where: { id, deletedAt: null },
          select: { carrierId: true },
        });
        return row?.carrierId ?? null;
      }
      case 'driverId': {
        const row = await this.prisma.client.driver.findFirst({
          where: { id, deletedAt: null },
          select: { carrierId: true },
        });
        return row?.carrierId ?? null;
      }
      case 'trailerId': {
        const row = await this.prisma.client.trailer.findFirst({
          where: { id, deletedAt: null },
          select: { carrierId: true },
        });
        return row?.carrierId ?? null;
      }
      case 'claimId': {
        const row = await this.prisma.client.claim.findFirst({
          where: { id, deletedAt: null },
          select: { carrierId: true },
        });
        return row?.carrierId ?? null;
      }
      case 'claimNrZgl': {
        const row = await this.prisma.client.claim.findFirst({
          where: { nrZgl: id, deletedAt: null },
          select: { carrierId: true },
        });
        return row?.carrierId ?? null;
      }
      case 'delegationId': {
        const row = await this.prisma.client.delegation.findFirst({
          where: { id, deletedAt: null },
          select: { carrierId: true },
        });
        return row?.carrierId ?? null;
      }
      default: {
        // Exhaustive guard — TS will complain if a new kind is added.
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }
}
