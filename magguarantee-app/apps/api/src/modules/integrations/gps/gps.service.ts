import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  GpsPositionListResponse,
  GpsPositionResponse,
} from '@magguarantee/shared';

import type { Env } from '../../../config/env.schema';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { RedisService } from '../../redis/redis.service';
import { GPS_PROVIDER_TOKEN } from './gps.config';
import {
  GpsRepository,
  type GpsScope,
} from './gps.repository';
import type { GpsPosition, GpsProvider, GpsVehicleRef } from './gps.types';

/**
 * Read-side facade for GPS data.
 *
 * Per docs/16-jobs-and-integrations.md#архитектурный-паттерн-polling--redis-cache:
 *  1. The (future) BullMQ poller writes positions into Redis with two keys:
 *     - `gps:position:<vehicleId>` (TTL = GPS_CACHE_TTL_SEC) — the "hot" fix.
 *     - `gps:lastknown:<vehicleId>` (no TTL) — write-through for graceful
 *       degradation when the upstream is down.
 *  2. Reads check the hot key first; on miss they fall back to last-known
 *     and tag the response `stale: true`.
 *
 * BullMQ is NOT yet wired in Phase 2. Until it is, the service offers a
 * `populateOnDemand` path used in tests / debug; the controller always reads
 * from Redis only. This lets web-agent build against the contract today and
 * the Phase 9 worker plug in later without touching this surface.
 */
@Injectable()
export class GpsService {
  private readonly logger = new Logger(GpsService.name);
  private readonly cacheTtlSec: number;

  constructor(
    private readonly redis: RedisService,
    private readonly repo: GpsRepository,
    config: ConfigService<Env, true>,
    @Inject(GPS_PROVIDER_TOKEN) private readonly provider: GpsProvider,
  ) {
    this.cacheTtlSec = config.get('GPS_CACHE_TTL_SEC', { infer: true });
  }

  /**
   * Single-vehicle endpoint.
   *
   * Auth flow:
   *   - 404 if vehicle doesn't exist OR is inactive (intentionally
   *     indistinguishable — don't leak existence). Every active vehicle is
   *     GPS-tracked since the `gps` toggle was dropped.
   *   - 403 if the caller's role doesn't grant access to this vehicle.
   */
  async getOne(
    user: AuthUser,
    vehicleId: string,
  ): Promise<GpsPositionResponse> {
    const owner = await this.repo.findOneForGps(vehicleId);
    if (!owner) throw new NotFoundException('Pojazd nie znaleziony');
    this._assertCanRead(user, owner);

    const fresh = await this._readFreshPosition(vehicleId);
    if (fresh) {
      return {
        position: fresh,
        stale: false,
        lastFetchedAt: fresh.fetchedAt,
      };
    }
    const lastKnown = await this._readLastKnown(vehicleId);
    return {
      position: lastKnown,
      stale: true,
      lastFetchedAt: lastKnown?.fetchedAt ?? null,
    };
  }

  /**
   * Fleet-wide endpoint, scoped by role.
   *
   * `stale: true` means at least one item came from last-known fallback.
   * `lastFetchedAt` is the most recent `fetchedAt` across all returned items
   * (or null if cache is empty).
   */
  async getMany(user: AuthUser): Promise<GpsPositionListResponse> {
    const scope = this._scopeFor(user);
    const vehicles = await this.repo.findManyForGps(scope);
    if (vehicles.length === 0) {
      return { items: [], stale: false, lastFetchedAt: null };
    }

    let anyStale = false;
    let mostRecent: string | null = null;
    const items: GpsPosition[] = [];

    for (const v of vehicles) {
      const fresh = await this._readFreshPosition(v.id);
      const fix = fresh ?? (await this._readLastKnown(v.id));
      if (!fresh) anyStale = true;
      if (fix) {
        items.push(fix);
        if (mostRecent === null || fix.fetchedAt > mostRecent) {
          mostRecent = fix.fetchedAt;
        }
      } else {
        // No data at all (cold start) — count as stale.
        anyStale = true;
      }
    }

    return {
      items,
      stale: anyStale,
      lastFetchedAt: mostRecent,
    };
  }

  /**
   * Provider-driven cache populator. Used by the (future) BullMQ poller AND
   * — until BullMQ lands — by an admin-only debug endpoint so a human can
   * verify the cache wiring end-to-end.
   *
   * Writes BOTH keys (`gps:position:*` with TTL, `gps:lastknown:*` without).
   * Returns the count of fixes written for logging.
   */
  async populateFromProvider(scope: GpsScope = { kind: 'all' }): Promise<{
    written: number;
    source: 'mock' | 'vendor';
  }> {
    const vehicles = await this.repo.findManyForGps(scope);
    if (vehicles.length === 0) {
      return { written: 0, source: this.provider.source };
    }
    const positions = await this.provider.getCurrentPositions(vehicles);
    for (const p of positions) {
      await this._writeFresh(p);
      await this._writeLastKnown(p);
    }
    this.logger.log({
      msg: 'GPS cache populated',
      written: positions.length,
      source: this.provider.source,
    });
    return { written: positions.length, source: this.provider.source };
  }

  // ── role / ownership helpers ─────────────────────────────

  private _scopeFor(user: AuthUser): GpsScope {
    switch (user.role) {
      case 'admin':
        return { kind: 'all' };
      case 'opiekun':
        return { kind: 'opiekun', userId: user.sub };
      case 'planista':
        return { kind: 'planista', userId: user.sub };
      case 'dyspozytor':
        // Phase 11 — scope by the dyspozytor's TEAM (resolved into the JWT
        // `teamId`). No team → 0 vehicles (the repo maps null → sentinel).
        return { kind: 'dyspozytor', teamId: user.teamId ?? null };
      case 'przewoznik':
        return { kind: 'przewoznik', userId: user.sub };
      // 'pracownik' / 'eksport' / 'weryfikator' filtered upstream by @Roles
      // — keep an explicit defensive throw in case a future change misses
      // that. pracownik has no fleet visibility per docs/03-roles.md#pracownik.
      default:
        throw new ForbiddenException('Brak uprawnień do GPS');
    }
  }

  private _assertCanRead(
    user: AuthUser,
    owner: {
      carrierUserId: string;
      opiekunId: string | null;
      plannerId: string | null;
      dispatchTeamId: string | null;
    },
  ): void {
    switch (user.role) {
      case 'admin':
        return;
      case 'opiekun':
        if (owner.opiekunId !== user.sub) {
          throw new ForbiddenException('Brak uprawnień do tego pojazdu');
        }
        return;
      case 'planista':
        if (owner.plannerId !== user.sub) {
          throw new ForbiddenException('Brak uprawnień do tego pojazdu');
        }
        return;
      case 'dyspozytor':
        // Phase 11 — dyspozytor may read GPS of a vehicle only if it is on
        // THEIR team. A dyspozytor with no team (or a vehicle with no team)
        // never matches → 403.
        if (!user.teamId || owner.dispatchTeamId !== user.teamId) {
          throw new ForbiddenException('Brak uprawnień do tego pojazdu');
        }
        return;
      case 'przewoznik':
        if (owner.carrierUserId !== user.sub) {
          throw new ForbiddenException('Brak uprawnień do tego pojazdu');
        }
        return;
      default:
        throw new ForbiddenException('Brak uprawnień do GPS');
    }
  }

  // ── cache helpers ────────────────────────────────────────

  private _freshKey(vehicleId: string): string {
    return `gps:position:${vehicleId}`;
  }
  private _lastKnownKey(vehicleId: string): string {
    return `gps:lastknown:${vehicleId}`;
  }

  private async _readFreshPosition(
    vehicleId: string,
  ): Promise<GpsPosition | null> {
    const raw = await this.redis.get(this._freshKey(vehicleId));
    if (!raw) return null;
    return this._parsePosition(raw);
  }

  private async _readLastKnown(
    vehicleId: string,
  ): Promise<GpsPosition | null> {
    const raw = await this.redis.get(this._lastKnownKey(vehicleId));
    if (!raw) return null;
    return this._parsePosition(raw);
  }

  private async _writeFresh(p: GpsPosition): Promise<void> {
    await this.redis.setex(
      this._freshKey(p.vehicleId),
      this.cacheTtlSec,
      JSON.stringify(p),
    );
  }

  private async _writeLastKnown(p: GpsPosition): Promise<void> {
    // No TTL — last-known persists for graceful degradation.
    await this.redis.client.set(this._lastKnownKey(p.vehicleId), JSON.stringify(p));
  }

  private _parsePosition(raw: string): GpsPosition | null {
    try {
      return JSON.parse(raw) as GpsPosition;
    } catch (err) {
      this.logger.warn({
        msg: 'GPS cache value parse failure',
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
}
