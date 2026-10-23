import 'reflect-metadata';

import {
  ExecutionContext,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { rolesSatisfying, type Permission, type Role } from '@magguarantee/shared';

import {
  CarrierOwnershipGuard,
  OpiekunOwnershipGuard,
} from '../../common/guards';
import { makeAuthUser, withRole } from '../../common/testing/make-auth-user';
import { PERMISSIONS_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import type { VehicleDailyKmService } from './vehicle-daily-km.service';
import { VehiclesController } from './vehicles.controller';
import type { VehiclesService } from './vehicles.service';

/**
 * Authorization unit tests for `VehiclesController`.
 *
 * Carriers (`przewoznik`) are view-only for vehicles — they may LIST and
 * READ vehicles but never update/(de|re)activate them; create/delete already
 * excluded carriers. Only `admin`/`opiekun` reach the mutating handlers.
 * Mirrors the already-correct trailers controller (docs/03-roles.md).
 *
 * Track B (docs/25 §3 B2): the routes carry `@RequirePermission` instead of
 * `@Roles` — `vehicles.read`, `fleet.write`, `km.read`, `km.verify`. Two
 * layers are asserted (same pattern as `claims.controller.roles.spec.ts`):
 *  1. The `@RequirePermission(...)` metadata on the handlers is exactly the
 *     planned requirement (`common/authz/endpoint-permissions.ts`), and the
 *     catalog maps it onto the documented role set.
 *  2. `PermissionsGuard` rejects a `przewoznik` user (built like
 *     `JwtAccessStrategy` builds it, `makeAuthUser` / `withRole`) on those
 *     mutations (403) and passes a `przewoznik` through on the GET routes —
 *     over the same role matrices the former `RolesGuard` checks used.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof VehiclesController,
): (...args: never[]) => unknown {
  return VehiclesController.prototype[name] as (...args: never[]) => unknown;
}

/** The live requirement, resolved like `PermissionsGuard` does (handler, then class). */
function requiredFor(handlerName: keyof VehiclesController): Permission[] {
  const meta = reflector.getAllAndOverride<Permission[] | undefined>(
    PERMISSIONS_METADATA_KEY,
    [handlerOf(handlerName), VehiclesController],
  );
  return meta ?? [];
}

/** Who the catalog admits through that requirement (leader rule as in the snapshot). */
function admittedRoles(handlerName: keyof VehiclesController): Role[] {
  return rolesSatisfying(requiredFor(handlerName), { lider: true });
}

/** Minimal `ExecutionContext` carrying the given user on `req.user`. */
function ctxFor(
  handlerName: keyof VehiclesController,
  user: AuthUser | undefined,
): ExecutionContext {
  const handler = handlerOf(handlerName);
  return {
    getHandler: () => handler,
    getClass: () => VehiclesController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

const carrierUser: AuthUser = makeAuthUser('przewoznik', {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  mustChangePassword: false,
});

/** Mutating routes the carrier-lockdown wave removed `przewoznik` from. */
const LOCKED_MUTATIONS: (keyof VehiclesController)[] = [
  'update',
  'deactivate',
  'reactivate',
];

/** Read routes the carrier MUST keep access to. */
const READ_ONLY: (keyof VehiclesController)[] = ['list', 'getById'];

describe('VehiclesController — authorization', () => {
  const guard = new PermissionsGuard(reflector);

  describe('@RequirePermission metadata', () => {
    it.each(LOCKED_MUTATIONS)('%s requires exactly fleet.write', (handler) => {
      expect(requiredFor(handler)).toEqual(['fleet.write']);
    });

    it.each(LOCKED_MUTATIONS)(
      '%s admits only admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = admittedRoles(handler);
        expect([...roles].sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );

    it.each(READ_ONLY)('%s requires exactly vehicles.read', (handler) => {
      expect(requiredFor(handler)).toEqual(['vehicles.read']);
    });

    it.each(READ_ONLY)('%s still admits przewoznik to view', (handler) => {
      expect(admittedRoles(handler)).toContain('przewoznik');
    });

    it('create still excludes przewoznik (unchanged)', () => {
      expect(requiredFor('create')).toEqual(['fleet.write']);
      expect(admittedRoles('create')).not.toContain('przewoznik');
    });

    it('delete still excludes przewoznik (unchanged)', () => {
      expect(requiredFor('delete')).toEqual(['fleet.write']);
      expect(admittedRoles('delete')).not.toContain('przewoznik');
    });
  });

  describe('PermissionsGuard against a przewoznik user', () => {
    it.each(LOCKED_MUTATIONS)('rejects przewoznik on %s with 403', (handler) => {
      expect(() => guard.canActivate(ctxFor(handler, carrierUser))).toThrow(
        ForbiddenException,
      );
    });

    it.each(READ_ONLY)('allows przewoznik on %s', (handler) => {
      expect(guard.canActivate(ctxFor(handler, carrierUser))).toBe(true);
    });

    it.each(LOCKED_MUTATIONS)('still allows admin on %s', (handler) => {
      const adminUser: AuthUser = withRole(carrierUser, 'admin');
      expect(guard.canActivate(ctxFor(handler, adminUser))).toBe(true);
    });

    it.each(LOCKED_MUTATIONS)('still allows opiekun on %s', (handler) => {
      const opiekunUser: AuthUser = withRole(carrierUser, 'opiekun');
      expect(guard.canActivate(ctxFor(handler, opiekunUser))).toBe(true);
    });
  });

  // ── Daily km (Phase 7 REWORK #3 weryfikator km-board) ────

  describe('km-board / daily-km WRITE authorization (weryfikator + admin)', () => {
    // NOTE: `getDailyKm` (the READ) is intentionally NOT here — it now fans out
    // by role like `getById` (carrier reads own machines' km calendar). The
    // WRITE (`setDailyKm`) and the global board (`kmBoard`) stay locked.
    const DAILY_KM_HANDLERS: (keyof VehiclesController)[] = [
      'setDailyKm',
      'kmBoard',
    ];

    it.each(DAILY_KM_HANDLERS)('%s requires exactly km.verify', (handler) => {
      expect(requiredFor(handler)).toEqual(['km.verify']);
    });

    it.each(DAILY_KM_HANDLERS)(
      '%s admits only weryfikator + admin',
      (handler) => {
        const roles = admittedRoles(handler);
        expect([...roles].sort()).toEqual(['admin', 'weryfikator']);
      },
    );

    it.each(DAILY_KM_HANDLERS)('allows weryfikator on %s', (handler) => {
      const wer: AuthUser = withRole(carrierUser, 'weryfikator');
      expect(guard.canActivate(ctxFor(handler, wer))).toBe(true);
    });

    it.each(DAILY_KM_HANDLERS)('allows admin on %s', (handler) => {
      const adm: AuthUser = withRole(carrierUser, 'admin');
      expect(guard.canActivate(ctxFor(handler, adm))).toBe(true);
    });

    it.each(['przewoznik', 'eksport', 'planista', 'dyspozytor', 'opiekun'] as const)(
      'rejects %s on the daily-km WRITE endpoints (403)',
      (role) => {
        const u: AuthUser = withRole(carrierUser, role);
        for (const handler of DAILY_KM_HANDLERS) {
          expect(() => guard.canActivate(ctxFor(handler, u))).toThrow(
            ForbiddenException,
          );
        }
      },
    );
  });

  // ── getDailyKm READ — fans out by role like getById ──────
  //
  // Regression for the carrier km-calendar 403 bug: the GET must read the same
  // role set as `getById` and be scoped by the ownership guards. We assert both
  // the `@RequirePermission` metadata + `PermissionsGuard`, and the
  // ownership-guard behavior (carrier own → OK, carrier foreign → 403,
  // weryfikator → OK via short-circuit).

  describe('getDailyKm READ authorization (role fan-out like getById)', () => {
    it('requires exactly km.read', () => {
      expect(requiredFor('getDailyKm')).toEqual(['km.read']);
    });

    it('reads the getById role set plus weryfikator + eksport (Historia + eksport km-calendar)', () => {
      // getDailyKm fans out exactly like getById for the carrier/opiekun/planner
      // roles, ADDITIONALLY keeps weryfikator (its original audience), AND grants
      // eksport — its read-only delegation modal renders the vehicle km-calendar
      // (DelegationKmCalendar → useVehicleDailyKmHistory). eksport has all-access
      // read on outflows + the related km (docs/03-roles.md matrix «Видеть
      // выезды» + km-report all-access), so it must reach this READ for ANY
      // vehicle. The WRITE (PUT/DELETE) stays weryfikator/admin-only.
      expect([...admittedRoles('getDailyKm')].sort()).toEqual([
        'admin',
        'dyspozytor',
        'eksport',
        'opiekun',
        'planista',
        'przewoznik',
        'weryfikator',
      ]);
      const byIdRoles = admittedRoles('getById');
      for (const r of byIdRoles) {
        expect(admittedRoles('getDailyKm')).toContain(r);
      }
    });

    it('km.read admits przewoznik and weryfikator', () => {
      const roles = admittedRoles('getDailyKm');
      expect(roles).toContain('przewoznik');
      expect(roles).toContain('weryfikator');
    });

    it.each([
      'admin',
      'opiekun',
      'planista',
      'dyspozytor',
      'przewoznik',
      'weryfikator',
      'eksport',
    ] as const)('PermissionsGuard allows %s on getDailyKm', (role) => {
      const u: AuthUser = withRole(carrierUser, role);
      expect(guard.canActivate(ctxFor('getDailyKm', u))).toBe(true);
    });

    // Regression: eksport opening the read-only delegation modal renders the
    // vehicle km-calendar (DelegationKmCalendar → useVehicleDailyKmHistory),
    // which hits GET /vehicles/:id/daily-km. eksport USED to 403 here; it must
    // now pass (see the allow block above). `pracownik` stays out — it has no
    // delegation/km read in docs/03-roles.md.
    it.each(['pracownik'] as const)(
      'PermissionsGuard rejects %s on getDailyKm (403)',
      (role) => {
        const u: AuthUser = withRole(carrierUser, role);
        expect(() => guard.canActivate(ctxFor('getDailyKm', u))).toThrow(
          ForbiddenException,
        );
      },
    );
  });

  // Ownership-guard scoping on getDailyKm. Built with a stubbed Prisma + a full
  // request context (user + params) so the guards actually resolve vehicleId →
  // carrierId. The handler carries `@CarrierOwns('id','param','vehicleId')` and
  // `@OpiekunOwns('id','param','vehicleId')`.

  describe('getDailyKm ownership scoping', () => {
    const VEHICLE_ID = 'veh-1';
    const OWN_CARRIER_ID = 'car-own';
    const OTHER_CARRIER_ID = 'car-other';

    /**
     * Stub PrismaService: the vehicle `veh-1` belongs to `car-own`; the carrier
     * profile for user `u-carrier` is `car-own`.
     */
    function prismaStub(vehicleCarrierId: string | null) {
      return {
        client: {
          vehicle: {
            findFirst: async () =>
              vehicleCarrierId === null
                ? null
                : { carrierId: vehicleCarrierId },
          },
          carrier: {
            findFirst: async ({
              where,
            }: {
              where: { userId?: string; id?: string };
            }) => {
              // carrier-guard path: resolve caller's carrier profile
              if (where.userId === 'u-carrier') return { id: OWN_CARRIER_ID };
              // opiekun-guard path: resolve carrier row by id
              if (where.id) return { id: where.id, opiekunId: 'op-x' };
              return null;
            },
          },
        },
      } as unknown as import('../prisma/prisma.service').PrismaService;
    }

    function ownershipCtx(
      user: AuthUser,
      vehicleId: string,
    ): ExecutionContext {
      const handler = handlerOf('getDailyKm');
      return {
        getHandler: () => handler,
        getClass: () => VehiclesController,
        switchToHttp: () => ({
          getRequest: () => ({ user, params: { id: vehicleId } }),
          getResponse: () => ({}),
          getNext: () => undefined,
        }),
      } as unknown as ExecutionContext;
    }

    it('(1) przewoznik reads OWN vehicle daily-km → allowed', async () => {
      const carrierGuard = new CarrierOwnershipGuard(
        reflector,
        prismaStub(OWN_CARRIER_ID),
      );
      const u: AuthUser = withRole(carrierUser, 'przewoznik');
      await expect(
        carrierGuard.canActivate(ownershipCtx(u, VEHICLE_ID)),
      ).resolves.toBe(true);
    });

    it('(2) przewoznik reads a FOREIGN vehicle daily-km → 403 (no IDOR)', async () => {
      const carrierGuard = new CarrierOwnershipGuard(
        reflector,
        prismaStub(OTHER_CARRIER_ID),
      );
      const u: AuthUser = withRole(carrierUser, 'przewoznik');
      await expect(
        carrierGuard.canActivate(ownershipCtx(u, VEHICLE_ID)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('(3) weryfikator reads ANY vehicle daily-km → both ownership guards short-circuit', async () => {
      const wer: AuthUser = withRole(carrierUser, 'weryfikator');
      // Foreign carrier on the vehicle — irrelevant, weryfikator is not scoped.
      const carrierGuard = new CarrierOwnershipGuard(
        reflector,
        prismaStub(OTHER_CARRIER_ID),
      );
      const opiekunGuard = new OpiekunOwnershipGuard(
        reflector,
        prismaStub(OTHER_CARRIER_ID),
      );
      await expect(
        carrierGuard.canActivate(ownershipCtx(wer, VEHICLE_ID)),
      ).resolves.toBe(true);
      await expect(
        opiekunGuard.canActivate(ownershipCtx(wer, VEHICLE_ID)),
      ).resolves.toBe(true);
    });
  });

  // ── km-report (read-only, role-scoped) ───────────────────

  describe('km-report authorization', () => {
    it('requires exactly km.read', () => {
      expect(requiredFor('kmReport')).toEqual(['km.read']);
    });

    it('is open to planista / dyspozytor / eksport / admin / weryfikator / przewoznik / opiekun', () => {
      expect([...admittedRoles('kmReport')].sort()).toEqual([
        'admin',
        'dyspozytor',
        'eksport',
        'opiekun',
        'planista',
        'przewoznik',
        'weryfikator',
      ]);
    });

    it.each([
      'planista',
      'dyspozytor',
      'eksport',
      'admin',
      'weryfikator',
      'przewoznik',
      'opiekun',
    ] as const)('allows %s on kmReport', (role) => {
      const u: AuthUser = withRole(carrierUser, role);
      expect(guard.canActivate(ctxFor('kmReport', u))).toBe(true);
    });

    it.each(['pracownik'] as const)(
      'rejects %s on kmReport (403)',
      (role) => {
        const u: AuthUser = withRole(carrierUser, role);
        expect(() => guard.canActivate(ctxFor('kmReport', u))).toThrow(
          ForbiddenException,
        );
      },
    );
  });
});

// ─── download access log (2026-08-14 logging audit, item 22) ───

describe('VehiclesController.downloadAttachment — access log', () => {
  afterEach(() => jest.restoreAllMocks());

  function controllerWith(downloadAttachment: jest.Mock): VehiclesController {
    return new VehiclesController(
      { downloadAttachment } as unknown as VehiclesService,
      {} as unknown as VehicleDailyKmService,
    );
  }

  it('logs ids + category + requester (no filename) and streams the file', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const pipe = jest.fn();
    const download = jest.fn(async () => ({
      object: { body: { pipe }, contentType: 'application/pdf', contentLength: 3 },
      fileName: 'porozumienie Kowalski.pdf',
      mimeType: 'application/pdf',
      category: 'agreement',
    }));
    const res = { setHeader: jest.fn() } as unknown as Response;
    const planista: AuthUser = withRole(carrierUser, 'planista', { sub: 'u-plan' });

    await controllerWith(download).downloadAttachment(
      planista,
      'veh-1',
      'att-1',
      { ip: '203.0.113.9' } as Request,
      res,
    );

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]![0]).toEqual({
      msg: 'attachment downloaded',
      entity: 'Vehicle',
      entityId: 'veh-1',
      attachmentId: 'att-1',
      category: 'agreement',
      userId: 'u-plan',
      role: 'planista',
      ip: '203.0.113.9',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('Kowalski');
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('does not log when the download is refused', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const download = jest.fn(async () => {
      throw new NotFoundException('Załącznik nie znaleziony');
    });
    const res = { setHeader: jest.fn() } as unknown as Response;

    await expect(
      controllerWith(download).downloadAttachment(
        carrierUser,
        'veh-1',
        'att-x',
        {} as Request,
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(log).not.toHaveBeenCalled();
  });
});
