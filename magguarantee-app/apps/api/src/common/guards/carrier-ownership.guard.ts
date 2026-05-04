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
  CARRIER_OWNERSHIP_KEY,
  type OwnershipMeta,
} from './ownership.constants';

/**
 * For role=przewoznik: asserts that the resource referenced by the request
 * belongs to the authenticated carrier user (`resource.carrierId ===
 * user.carrierProfile.id`).
 *
 * For other roles → pass through. Per docs/15-auth-strategy.md:
 *
 *  > Для перевозчика — что claim/vehicle/driver/trailer/delegation
 *  > принадлежит ему [...]
 *
 * The carrier ID is **not** stored on the JWT today (Phase 1 token only
 * carries `sub`/`role`). We resolve the user's `carrierProfile.id` per
 * request via Prisma. The result is cheap (uuid PK, indexed). When Phase 4
 * lands the multi-role JWT (`carrierId` claim per docs/15-auth-strategy.md
 * #JWT-payload), the lookup can become a noop.
 *
 * Like `OpiekunOwnershipGuard`, this one reaches into Prisma directly rather
 * than through repositories — repositories arrive in Wave 3.
 */
@Injectable()
export class CarrierOwnershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<OwnershipMeta | undefined>(
      CARRIER_OWNERSHIP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string | undefined>;
      body?: Record<string, unknown>;
      query?: Record<string, unknown>;
    }>();
    const user = req.user;
    if (!user) throw new ForbiddenException('Brak uprawnień');

    // Only przewoznik is scoped by this guard. Other roles either have
    // global access (admin/pracownik) or are subject to a different guard
    // (opiekun → OpiekunOwnershipGuard). Pass through.
    if (user.role !== 'przewoznik') return true;

    const carrier = await this.prisma.client.carrier.findFirst({
      where: { userId: user.sub, deletedAt: null },
      select: { id: true },
    });
    if (!carrier) {
      // Carrier user with no Carrier row → misconfiguration. 403 not 404,
      // because to a przewoznik the resource simply does not exist for them.
      throw new ForbiddenException('Brak profilu przewoźnika');
    }

    const rawId = this._extractId(req, meta);
    if (!rawId) {
      throw new BadRequestException(
        `Brak identyfikatora zasobu (${meta.source}.${meta.name})`,
      );
    }

    const ownerId = await this._resourceCarrierId(rawId, meta.as);
    if (!ownerId) {
      throw new NotFoundException('Zasób nie znaleziony');
    }
    if (ownerId !== carrier.id) {
      throw new ForbiddenException('Nie masz uprawnień do tego zasobu');
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

  private async _resourceCarrierId(
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
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }
}
