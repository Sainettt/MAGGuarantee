import { ConflictException, NotFoundException } from '@nestjs/common';

import {
  TrailerTypesRepository,
  type TrailerTypeRow,
} from './trailer-types.repository';
import { TrailerTypesService } from './trailer-types.service';

const NOW = new Date('2026-05-01T10:00:00.000Z');

function makeRow(overrides: Partial<TrailerTypeRow> = {}): TrailerTypeRow {
  return {
    id: 'tt-1',
    name: 'Firanka',
    shortCode: null,
    description: null,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRepo(seed: TrailerTypeRow[] = []): TrailerTypesRepository {
  const rows = new Map<string, TrailerTypeRow>();
  for (const r of seed) rows.set(r.id, r);
  return {
    findById: jest.fn(async (id: string) => rows.get(id) ?? null),
    findByName: jest.fn(async (name: string) =>
      [...rows.values()].find((r) => r.name === name) ?? null,
    ),
    list: jest.fn(async () => [...rows.values()]),
    create: jest.fn(async (data) => {
      if ([...rows.values()].some((r) => r.name === data.name)) {
        throw Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['name'] },
        });
      }
      const row = makeRow({
        id: `tt-${rows.size + 1}`,
        name: data.name,
        shortCode: data.shortCode ?? null,
        description: data.description ?? null,
        active: data.active ?? true,
      });
      rows.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, patch: Partial<TrailerTypeRow>) => {
      const cur = rows.get(id);
      if (!cur) throw new Error('not found');
      const next = { ...cur, ...patch };
      rows.set(id, next);
      return next;
    }),
  } as unknown as TrailerTypesRepository;
}

describe('TrailerTypesService', () => {
  it('lists active and inactive types', async () => {
    const a = makeRow({ id: 'tt-a', name: 'A' });
    const b = makeRow({ id: 'tt-b', name: 'B', active: false });
    const svc = new TrailerTypesService(makeRepo([a, b]));
    const out = await svc.list({});
    expect(out).toHaveLength(2);
  });

  it('creates a new type', async () => {
    const svc = new TrailerTypesService(makeRepo());
    const out = await svc.create({ name: 'Plandeka' });
    expect(out.name).toBe('Plandeka');
    expect(out.active).toBe(true);
  });

  it('translates duplicate name into 409', async () => {
    const dup = makeRow({ name: 'Firanka' });
    const svc = new TrailerTypesService(makeRepo([dup]));
    await expect(svc.create({ name: 'Firanka' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('updates fields', async () => {
    const r = makeRow({ name: 'Old' });
    const svc = new TrailerTypesService(makeRepo([r]));
    const out = await svc.update(r.id, { description: 'now with desc' });
    expect(out.description).toBe('now with desc');
  });

  it('update 404 for missing id', async () => {
    const svc = new TrailerTypesService(makeRepo());
    await expect(svc.update('missing', { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deactivate flips active=false; double-deactivate → 409', async () => {
    const r = makeRow({ active: true });
    const svc = new TrailerTypesService(makeRepo([r]));
    const out = await svc.deactivate(r.id);
    expect(out.active).toBe(false);
    await expect(svc.deactivate(r.id)).rejects.toThrow(ConflictException);
  });
});
