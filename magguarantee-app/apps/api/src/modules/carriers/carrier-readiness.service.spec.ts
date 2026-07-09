import { NotFoundException } from '@nestjs/common';

import {
  CarrierReadinessService,
  deriveReadiness,
  readinessToAttentionReasons,
  type CarrierReadinessInputs,
} from './carrier-readiness.service';
import { CarriersRepository, type CarrierRow } from './carriers.repository';

// ─── Pure derivation ──────────────────────────────────────
//
// Readiness now derives ONLY from the active fleet counts (vehicle + trailer +
// driver). The carrier-level ADR document was removed as a concept (2026-07),
// so there is no ADR input and no `adrDocMissing` reason anymore.

function inputs(
  overrides: Partial<CarrierReadinessInputs> = {},
): CarrierReadinessInputs {
  return {
    activeVehicles: 1,
    activeTrailers: 1,
    activeDrivers: 1,
    ...overrides,
  };
}

describe('deriveReadiness (pure rule)', () => {
  it('ready: full fleet', () => {
    const r = deriveReadiness(inputs());
    expect(r).toMatchObject({
      hasVehicle: true,
      hasTrailer: true,
      hasDriver: true,
      incompleteFleet: false,
      ready: true,
    });
  });

  it.each([
    ['no vehicle', { activeVehicles: 0 }],
    ['no trailer', { activeTrailers: 0 }],
    ['no driver', { activeDrivers: 0 }],
  ])('incompleteFleet → not ready (%s)', (_label, override) => {
    const r = deriveReadiness(inputs(override));
    expect(r.incompleteFleet).toBe(true);
    expect(r.ready).toBe(false);
  });

  it('all three missing → incompleteFleet, not ready', () => {
    const r = deriveReadiness(
      inputs({ activeVehicles: 0, activeTrailers: 0, activeDrivers: 0 }),
    );
    expect(r.hasVehicle).toBe(false);
    expect(r.hasTrailer).toBe(false);
    expect(r.hasDriver).toBe(false);
    expect(r.incompleteFleet).toBe(true);
    expect(r.ready).toBe(false);
  });

  it('multiple active children of each type → still ready', () => {
    const r = deriveReadiness(
      inputs({ activeVehicles: 5, activeTrailers: 3, activeDrivers: 4 }),
    );
    expect(r.ready).toBe(true);
    expect(r.incompleteFleet).toBe(false);
  });
});

describe('readinessToAttentionReasons', () => {
  it('empty when ready', () => {
    expect(readinessToAttentionReasons(deriveReadiness(inputs()))).toEqual([]);
  });
  it('incompleteFleet is the only reason emitted', () => {
    expect(
      readinessToAttentionReasons(deriveReadiness(inputs({ activeDrivers: 0 }))),
    ).toEqual(['incompleteFleet']);
  });
});

// ─── Service (single-carrier path) ────────────────────────

function carrierRow(
  counts: { vehicles: number; trailers: number; drivers: number },
): CarrierRow {
  return {
    id: 'c-1',
    counts,
    // Only `counts` is read by the readiness service — the rest is filler so
    // the shape matches `CarrierRow` without pulling the whole repo in.
  } as unknown as CarrierRow;
}

function makeService(opts: {
  carrier: CarrierRow | null;
}): CarrierReadinessService {
  const carriers = {
    findById: jest.fn(async () => opts.carrier),
  } as unknown as CarriersRepository;
  return new CarrierReadinessService(carriers);
}

describe('CarrierReadinessService.forCarrier', () => {
  it('ready: full fleet', async () => {
    const svc = makeService({
      carrier: carrierRow({ vehicles: 1, trailers: 1, drivers: 1 }),
    });
    await expect(svc.forCarrier('c-1')).resolves.toMatchObject({ ready: true });
  });

  it('not ready: missing trailer', async () => {
    const svc = makeService({
      carrier: carrierRow({ vehicles: 1, trailers: 0, drivers: 1 }),
    });
    const r = await svc.forCarrier('c-1');
    expect(r.ready).toBe(false);
    expect(r.incompleteFleet).toBe(true);
  });

  it('not ready: missing driver', async () => {
    const svc = makeService({
      carrier: carrierRow({ vehicles: 1, trailers: 1, drivers: 0 }),
    });
    const r = await svc.forCarrier('c-1');
    expect(r.ready).toBe(false);
    expect(r.incompleteFleet).toBe(true);
  });

  it('404 when the carrier does not exist', async () => {
    const svc = makeService({ carrier: null });
    await expect(svc.forCarrier('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('CarrierReadinessService.forCarriers (batched, pure)', () => {
  it('derives per-id without touching repos', () => {
    const svc = makeService({ carrier: null });
    const out = svc.forCarriers(
      new Map<string, CarrierReadinessInputs>([
        ['ready', inputs()],
        ['incomplete', inputs({ activeVehicles: 0 })],
      ]),
    );
    expect(out.get('ready')?.ready).toBe(true);
    expect(out.get('incomplete')?.incompleteFleet).toBe(true);
    expect(out.get('incomplete')?.ready).toBe(false);
  });
});
