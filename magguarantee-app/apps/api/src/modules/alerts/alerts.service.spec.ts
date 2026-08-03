import { ForbiddenException } from '@nestjs/common';

import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { AlertsService } from './alerts.service';
import type {
  AlertScope,
  AlertSourceRow,
  AlertsRepository,
} from './alerts.repository';

// Fixed "now" so day-diffs are deterministic (Europe/Warsaw, summer = UTC+2).
const NOW = new Date('2026-08-03T09:00:00Z'); // Warsaw calendar day = 2026-08-03

/** Build a date-only (UTC-midnight) value N calendar days from NOW's day.
 *  `Date.UTC` normalizes month/day overflow + underflow, so negative offsets
 *  and month crossings are safe. */
function dateOffset(days: number): Date {
  return new Date(Date.UTC(2026, 7, 3 + days)); // month 7 = August
}

function makeAuth(role: AuthUser['role'], sub = 'u-1'): AuthUser {
  return {
    sub,
    login: `${role}1`,
    email: `${role}@magtrans.eu`,
    name: role,
    role,
    mustChangePassword: false,
    teamId: null,
  };
}

/**
 * Fake repository. Records the scope it was called with (to assert opiekun
 * scoping) and returns configured rows per provider method.
 */
function makeRepo(rows: {
  carrierInsurance?: AlertSourceRow[];
  carrierLicense?: AlertSourceRow[];
  vehicleFuelCard?: AlertSourceRow[];
  driverLicense?: AlertSourceRow[];
}): { repo: AlertsRepository; scopes: AlertScope[] } {
  const scopes: AlertScope[] = [];
  const repo = {
    carrierInsurance: (_c: Date, s: AlertScope) => {
      scopes.push(s);
      return Promise.resolve(rows.carrierInsurance ?? []);
    },
    carrierLicense: (_c: Date, s: AlertScope) => {
      scopes.push(s);
      return Promise.resolve(rows.carrierLicense ?? []);
    },
    vehicleFuelCard: (_c: Date, s: AlertScope) => {
      scopes.push(s);
      return Promise.resolve(rows.vehicleFuelCard ?? []);
    },
    driverLicense: (_c: Date, s: AlertScope) => {
      scopes.push(s);
      return Promise.resolve(rows.driverLicense ?? []);
    },
  } as unknown as AlertsRepository;
  return { repo, scopes };
}

function row(
  entityId: string,
  label: string,
  offsetDays: number,
): AlertSourceRow {
  return {
    entityId,
    entityLabel: label,
    expiry: dateOffset(offsetDays),
    carrierId: `c-${entityId}`,
    carrierName: 'Firma X',
  };
}

describe('AlertsService', () => {
  it('classifies each severity bucket from days-to-expiry', async () => {
    const { repo } = makeRepo({
      carrierInsurance: [
        row('a', 'expired', -2),
        row('b', 'today', 0),
        row('c', 'warn', 2),
        row('d', 'soon', 7),
      ],
    });
    const svc = new AlertsService(repo);
    const res = await svc.list(makeAuth('admin'), NOW);

    const bySeverity = Object.fromEntries(
      res.groups
        .flatMap((g) => g.items)
        .map((i) => [i.entityLabel, i.severity]),
    );
    expect(bySeverity).toEqual({
      expired: 'expired',
      today: 'critical',
      warn: 'warning',
      soon: 'upcoming',
    });
    expect(res.meta.totals).toEqual({
      expired: 1,
      critical: 1,
      warning: 1,
      upcoming: 1,
      total: 4,
    });
    expect(res.meta.warnDays).toBe(7);
  });

  it('groups by category and sorts most-urgent first', async () => {
    const { repo } = makeRepo({
      carrierInsurance: [row('ins', 'OCP soon', 6)],
      carrierLicense: [row('lic', 'Licencja expired', -5)],
      vehicleFuelCard: [row('veh', 'DW1234', 1)],
      driverLicense: [row('drv', 'Jan Kowalski', 0)],
    });
    const svc = new AlertsService(repo);
    const res = await svc.list(makeAuth('admin'), NOW);

    const carrier = res.groups.find((g) => g.category === 'carrier');
    expect(carrier?.total).toBe(2);
    // expired (licence) must sort before upcoming (insurance).
    expect(carrier?.items[0]?.entityLabel).toBe('Licencja expired');
    expect(carrier?.items[1]?.entityLabel).toBe('OCP soon');

    expect(res.groups.map((g) => g.category)).toEqual([
      'carrier',
      'vehicle',
      'driver',
    ]);
  });

  it('drops empty categories from the response', async () => {
    const { repo } = makeRepo({ driverLicense: [row('drv', 'Kierowca', 3)] });
    const svc = new AlertsService(repo);
    const res = await svc.list(makeAuth('admin'), NOW);
    expect(res.groups.map((g) => g.category)).toEqual(['driver']);
  });

  it('builds a stable synthetic id per (docType, entity)', async () => {
    const { repo } = makeRepo({ vehicleFuelCard: [row('v1', 'DW1', 2)] });
    const svc = new AlertsService(repo);
    const res = await svc.list(makeAuth('admin'), NOW);
    expect(res.groups[0]?.items[0]?.id).toBe('vehicle_fuel_card:v1');
    expect(res.groups[0]?.items[0]?.entityKind).toBe('vehicle');
  });

  it('scopes opiekun to their own id, admin to none', async () => {
    const opiekun = makeRepo({});
    await new AlertsService(opiekun.repo).list(makeAuth('opiekun', 'op-7'), NOW);
    expect(opiekun.scopes.every((s) => s.opiekunId === 'op-7')).toBe(true);

    const admin = makeRepo({});
    await new AlertsService(admin.repo).list(makeAuth('admin'), NOW);
    expect(admin.scopes.every((s) => s.opiekunId === undefined)).toBe(true);
  });

  it.each(['pracownik', 'planista', 'dyspozytor', 'przewoznik', 'eksport', 'weryfikator'] as const)(
    'rejects role %s with 403',
    async (role) => {
      const { repo } = makeRepo({});
      await expect(
        new AlertsService(repo).list(makeAuth(role), NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('returns an empty, well-formed response when nothing expires', async () => {
    const { repo } = makeRepo({});
    const res = await new AlertsService(repo).list(makeAuth('admin'), NOW);
    expect(res.groups).toEqual([]);
    expect(res.meta.totals.total).toBe(0);
  });
});
