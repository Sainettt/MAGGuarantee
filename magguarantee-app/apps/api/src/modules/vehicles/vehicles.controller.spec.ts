import 'reflect-metadata';

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { Role } from '@magguarantee/shared';

import {
  CarrierOwnershipGuard,
  OpiekunOwnershipGuard,
} from '../../common/guards';
import { ROLES_METADATA_KEY } from '../auth/auth.constants';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VehiclesController } from './vehicles.controller';

/**
 * Authorization unit tests for `VehiclesController`.
 *
 * Carriers (`przewoznik`) are view-only for vehicles — they may LIST and
 * READ vehicles but never update/(de|re)activate them; create/delete already
 * excluded carriers. Only `admin`/`opiekun` reach the mutating handlers.
 * Mirrors the already-correct trailers controller (docs/03-roles.md).
 *
 * Two layers are asserted:
 *  1. The `@Roles(...)` metadata on the changed handlers is exactly the
 *     documented set.
 *  2. `RolesGuard` rejects a `przewoznik` token on those mutations (403) and
 *     passes a `przewoznik` through on the GET routes.
 */

const reflector = new Reflector();

function handlerOf(
  name: keyof VehiclesController,
): (...args: never[]) => unknown {
  return VehiclesController.prototype[name] as (...args: never[]) => unknown;
}

function rolesFor(handlerName: keyof VehiclesController): Role[] {
  const meta = reflector.get<Role[] | undefined>(
    ROLES_METADATA_KEY,
    handlerOf(handlerName),
  );
  return meta ?? [];
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

const carrierUser: AuthUser = {
  sub: 'u-carrier',
  login: 'przewoznik1',
  email: 'przewoznik1@magtrans.eu',
  name: 'Carrier One',
  role: 'przewoznik',
  mustChangePassword: false,
};

/** Mutating routes the carrier-lockdown wave removed `przewoznik` from. */
const LOCKED_MUTATIONS: (keyof VehiclesController)[] = [
  'update',
  'deactivate',
  'reactivate',
];

/** Read routes the carrier MUST keep access to. */
const READ_ONLY: (keyof VehiclesController)[] = ['list', 'getById'];

describe('VehiclesController — authorization', () => {
  const guard = new RolesGuard(reflector);

  describe('@Roles metadata', () => {
    it.each(LOCKED_MUTATIONS)(
      '%s is restricted to admin + opiekun (no przewoznik)',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'opiekun']);
        expect(roles).not.toContain('przewoznik');
      },
    );

    it.each(READ_ONLY)('%s still allows przewoznik to view', (handler) => {
      expect(rolesFor(handler)).toContain('przewoznik');
    });

    it('create still excludes przewoznik (unchanged)', () => {
      expect(rolesFor('create')).not.toContain('przewoznik');
    });

    it('delete still excludes przewoznik (unchanged)', () => {
      expect(rolesFor('delete')).not.toContain('przewoznik');
    });
  });

  describe('RolesGuard against a przewoznik token', () => {
    it.each(LOCKED_MUTATIONS)('rejects przewoznik on %s with 403', (handler) => {
      expect(() => guard.canActivate(ctxFor(handler, carrierUser))).toThrow(
        ForbiddenException,
      );
    });

    it.each(READ_ONLY)('allows przewoznik on %s', (handler) => {
      expect(guard.canActivate(ctxFor(handler, carrierUser))).toBe(true);
    });

    it.each(LOCKED_MUTATIONS)('still allows admin on %s', (handler) => {
      const adminUser: AuthUser = { ...carrierUser, role: 'admin' };
      expect(guard.canActivate(ctxFor(handler, adminUser))).toBe(true);
    });

    it.each(LOCKED_MUTATIONS)('still allows opiekun on %s', (handler) => {
      const opiekunUser: AuthUser = { ...carrierUser, role: 'opiekun' };
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

    it.each(DAILY_KM_HANDLERS)(
      '%s is restricted to weryfikator + admin',
      (handler) => {
        const roles = rolesFor(handler);
        expect(roles.sort()).toEqual(['admin', 'weryfikator']);
      },
    );

    it.each(DAILY_KM_HANDLERS)('allows weryfikator on %s', (handler) => {
      const wer: AuthUser = { ...carrierUser, role: 'weryfikator' };
      expect(guard.canActivate(ctxFor(handler, wer))).toBe(true);
    });

    it.each(DAILY_KM_HANDLERS)('allows admin on %s', (handler) => {
      const adm: AuthUser = { ...carrierUser, role: 'admin' };
      expect(guard.canActivate(ctxFor(handler, adm))).toBe(true);
    });

    it.each(['przewoznik', 'eksport', 'planista', 'dyspozytor', 'opiekun'] as const)(
      'rejects %s on the daily-km WRITE endpoints (403)',
      (role) => {
        const u: AuthUser = { ...carrierUser, role };
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
  // the `@Roles` metadata + `RolesGuard`, and the ownership-guard behavior
  // (carrier own → OK, carrier foreign → 403, weryfikator → OK via short-circuit).

  describe('getDailyKm READ authorization (role fan-out like getById)', () => {
    it('reads the getById role set plus weryfikator + eksport (Historia + eksport km-calendar)', () => {
      // getDailyKm fans out exactly like getById for the carrier/opiekun/planner
      // roles, ADDITIONALLY keeps weryfikator (its original audience), AND grants
      // eksport — its read-only delegation modal renders the vehicle km-calendar
      // (DelegationKmCalendar → useVehicleDailyKmHistory). eksport has all-access
      // read on outflows + the related km (docs/03-roles.md matrix «Видеть
      // выезды» + km-report all-access), so it must reach this READ for ANY
      // vehicle. The WRITE (PUT/DELETE) stays weryfikator/admin-only.
      expect(rolesFor('getDailyKm').sort()).toEqual([
        'admin',
        'dyspozytor',
        'eksport',
        'opiekun',
        'planista',
        'przewoznik',
        'weryfikator',
      ]);
      const byIdRoles = rolesFor('getById');
      for (const r of byIdRoles) {
        expect(rolesFor('getDailyKm')).toContain(r);
      }
    });

    it('@Roles includes przewoznik and weryfikator', () => {
      const roles = rolesFor('getDailyKm');
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
    ] as const)('RolesGuard allows %s on getDailyKm', (role) => {
      const u: AuthUser = { ...carrierUser, role };
      expect(guard.canActivate(ctxFor('getDailyKm', u))).toBe(true);
    });

    // Regression: eksport opening the read-only delegation modal renders the
    // vehicle km-calendar (DelegationKmCalendar → useVehicleDailyKmHistory),
    // which hits GET /vehicles/:id/daily-km. eksport USED to 403 here; it must
    // now pass (see the allow block above). `pracownik` stays out — it has no
    // delegation/km read in docs/03-roles.md.
    it.each(['pracownik'] as const)(
      'RolesGuard rejects %s on getDailyKm (403)',
      (role) => {
        const u: AuthUser = { ...carrierUser, role };
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
      const u: AuthUser = { ...carrierUser, role: 'przewoznik' };
      await expect(
        carrierGuard.canActivate(ownershipCtx(u, VEHICLE_ID)),
      ).resolves.toBe(true);
    });

    it('(2) przewoznik reads a FOREIGN vehicle daily-km → 403 (no IDOR)', async () => {
      const carrierGuard = new CarrierOwnershipGuard(
        reflector,
        prismaStub(OTHER_CARRIER_ID),
      );
      const u: AuthUser = { ...carrierUser, role: 'przewoznik' };
      await expect(
        carrierGuard.canActivate(ownershipCtx(u, VEHICLE_ID)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('(3) weryfikator reads ANY vehicle daily-km → both ownership guards short-circuit', async () => {
      const wer: AuthUser = { ...carrierUser, role: 'weryfikator' };
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
    it('is open to planista / dyspozytor / eksport / admin / weryfikator / przewoznik / opiekun', () => {
      expect(rolesFor('kmReport').sort()).toEqual([
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
      const u: AuthUser = { ...carrierUser, role };
      expect(guard.canActivate(ctxFor('kmReport', u))).toBe(true);
    });

    it.each(['pracownik'] as const)(
      'rejects %s on kmReport (403)',
      (role) => {
        const u: AuthUser = { ...carrierUser, role };
        expect(() => guard.canActivate(ctxFor('kmReport', u))).toThrow(
          ForbiddenException,
        );
      },
    );
  });
});
