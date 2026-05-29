import { NotFoundException } from '@nestjs/common';

import { CarrierAttachmentsRepository } from './carrier-attachments.repository';
import {
  CarrierReadinessService,
  deriveReadiness,
  readinessToAttentionReasons,
  type CarrierReadinessInputs,
} from './carrier-readiness.service';
import { CarriersRepository, type CarrierRow } from './carriers.repository';
import { VehiclesRepository } from '../vehicles/vehicles.repository';

// ─── Pure derivation ──────────────────────────────────────

function inputs(
  overrides: Partial<CarrierReadinessInputs> = {},
): CarrierReadinessInputs {
  return {
    activeVehicles: 1,
    activeTrailers: 1,
    activeDrivers: 1,
    activeAdrVehicles: 0,
    activeAdrDocs: 0,
    ...overrides,
  };
}

describe('deriveReadiness (pure rule)', () => {
  it('ready: full fleet, no ADR vehicle', () => {
    const r = deriveReadiness(inputs());
    expect(r).toMatchObject({
      hasVehicle: true,
      hasTrailer: true,
      hasDriver: true,
      hasAdrVehicle: false,
      hasAdrDoc: false,
      incompleteFleet: false,
      adrDocMissing: false,
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

  it('ADR vehicle without ADR doc → adrDocMissing, not ready', () => {
    const r = deriveReadiness(inputs({ activeAdrVehicles: 2, activeAdrDocs: 0 }));
    expect(r.hasAdrVehicle).toBe(true);
    expect(r.adrDocMissing).toBe(true);
    expect(r.ready).toBe(false);
  });

  it('ADR vehicle WITH ADR doc → ready', () => {
    const r = deriveReadiness(inputs({ activeAdrVehicles: 1, activeAdrDocs: 1 }));
    expect(r.adrDocMissing).toBe(false);
    expect(r.ready).toBe(true);
  });

  it('ADR doc without ADR vehicle → still ready (doc not required)', () => {
    const r = deriveReadiness(inputs({ activeAdrVehicles: 0, activeAdrDocs: 1 }));
    expect(r.adrDocMissing).toBe(false);
    expect(r.ready).toBe(true);
  });

  it('both problems → not ready, both derived flags set', () => {
    const r = deriveReadiness(
      inputs({ activeTrailers: 0, activeAdrVehicles: 1, activeAdrDocs: 0 }),
    );
    expect(r.incompleteFleet).toBe(true);
    expect(r.adrDocMissing).toBe(true);
    expect(r.ready).toBe(false);
  });
});

describe('readinessToAttentionReasons', () => {
  it('empty when ready', () => {
    expect(readinessToAttentionReasons(deriveReadiness(inputs()))).toEqual([]);
  });
  it('incompleteFleet only', () => {
    expect(
      readinessToAttentionReasons(deriveReadiness(inputs({ activeDrivers: 0 }))),
    ).toEqual(['incompleteFleet']);
  });
  it('adrDocMissing only', () => {
    expect(
      readinessToAttentionReasons(
        deriveReadiness(inputs({ activeAdrVehicles: 1 })),
      ),
    ).toEqual(['adrDocMissing']);
  });
  it('stable order: fleet then ADR', () => {
    expect(
      readinessToAttentionReasons(
        deriveReadiness(
          inputs({ activeVehicles: 0, activeAdrVehicles: 1 }),
        ),
      ),
    ).toEqual(['incompleteFleet', 'adrDocMissing']);
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
  adrVehicles?: number;
  adrDocs?: number;
}): CarrierReadinessService {
  const carriers = {
    findById: jest.fn(async () => opts.carrier),
  } as unknown as CarriersRepository;
  const vehicles = {
    countActiveAdr: jest.fn(async () => opts.adrVehicles ?? 0),
  } as unknown as VehiclesRepository;
  const attachments = {
    countActiveByCategory: jest.fn(async () => opts.adrDocs ?? 0),
  } as unknown as CarrierAttachmentsRepository;
  return new CarrierReadinessService(carriers, vehicles, attachments);
}

describe('CarrierReadinessService.forCarrier', () => {
  it('ready: full fleet, no ADR vehicle', async () => {
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

  it('not ready: ADR vehicle without doc', async () => {
    const svc = makeService({
      carrier: carrierRow({ vehicles: 1, trailers: 1, drivers: 1 }),
      adrVehicles: 1,
      adrDocs: 0,
    });
    const r = await svc.forCarrier('c-1');
    expect(r.ready).toBe(false);
    expect(r.adrDocMissing).toBe(true);
  });

  it('ready: ADR vehicle with doc', async () => {
    const svc = makeService({
      carrier: carrierRow({ vehicles: 1, trailers: 1, drivers: 1 }),
      adrVehicles: 1,
      adrDocs: 1,
    });
    await expect(svc.forCarrier('c-1')).resolves.toMatchObject({ ready: true });
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
        ['adr', inputs({ activeAdrVehicles: 1 })],
      ]),
    );
    expect(out.get('ready')?.ready).toBe(true);
    expect(out.get('incomplete')?.incompleteFleet).toBe(true);
    expect(out.get('adr')?.adrDocMissing).toBe(true);
  });
});
