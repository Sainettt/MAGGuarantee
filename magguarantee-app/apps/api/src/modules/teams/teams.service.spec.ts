import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

import { TeamsRepository, type TeamRow } from './teams.repository';
import { TeamsService } from './teams.service';

const NOW = new Date('2026-06-17T10:00:00.000Z');

function makeTeam(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: 't-1',
    name: '1.1.13',
    active: true,
    dispatchers: [],
    vehicleCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

type DispatcherFixture = {
  id: string;
  role: string;
  active: boolean;
  teamId: string | null;
};

/**
 * In-memory TeamsRepository stub. Tracks team rows + dispatcher membership so
 * the create/update/sync flows can be asserted. `findDispatchersByIds` returns
 * the seeded dispatcher fixtures so role/active validation is exercised.
 */
function makeRepo(opts: {
  teams?: TeamRow[];
  dispatchers?: DispatcherFixture[];
  members?: Record<string, string[]>; // teamId → memberIds
  memberCount?: number;
  vehicleCount?: number;
}) {
  const teams = new Map<string, TeamRow>();
  for (const t of opts.teams ?? []) teams.set(t.id, t);
  const dispatchers = new Map<string, DispatcherFixture>();
  for (const d of opts.dispatchers ?? []) dispatchers.set(d.id, d);
  const members: Record<string, string[]> = { ...(opts.members ?? {}) };

  const setUserTeam = jest.fn(async (userId: string, teamId: string | null) => {
    // Detach from every team, then attach.
    for (const tid of Object.keys(members)) {
      members[tid] = (members[tid] ?? []).filter((m) => m !== userId);
    }
    if (teamId) {
      members[teamId] = [...(members[teamId] ?? []), userId];
    }
  });

  const repo = {
    findById: jest.fn(async (id: string) => teams.get(id) ?? null),
    findByName: jest.fn(async (name: string) =>
      [...teams.values()].find((t) => t.name === name) ?? null,
    ),
    list: jest.fn(async () => [...teams.values()]),
    create: jest.fn(async (data: { name: string }) => {
      if ([...teams.values()].some((t) => t.name === data.name)) {
        throw Object.assign(new Error('P2002'), {
          code: 'P2002',
          meta: { target: ['name'] },
        });
      }
      const row = makeTeam({ id: `t-${teams.size + 1}`, name: data.name });
      teams.set(row.id, row);
      return row;
    }),
    update: jest.fn(async (id: string, data: Partial<TeamRow>) => {
      const cur = teams.get(id)!;
      const next = { ...cur, ...data };
      teams.set(id, next);
      return next;
    }),
    hardDelete: jest.fn(async (id: string) => {
      teams.delete(id);
    }),
    findDispatchersByIds: jest.fn(async (ids: string[]) =>
      ids.map((id) => dispatchers.get(id)).filter((d): d is DispatcherFixture => Boolean(d)),
    ),
    listMemberIds: jest.fn(async (teamId: string) => members[teamId] ?? []),
    setUserTeam,
    countMembers: jest.fn(async () => opts.memberCount ?? 0),
    countVehicles: jest.fn(async () => opts.vehicleCount ?? 0),
  } as unknown as TeamsRepository;

  return { repo, members, setUserTeam };
}

describe('TeamsService.create', () => {
  it('creates a team and attaches valid active dispatchers', async () => {
    const { repo, members } = makeRepo({
      dispatchers: [{ id: 'd-1', role: 'dyspozytor', active: true, teamId: null }],
    });
    const svc = new TeamsService(repo);
    const out = await svc.create({ name: '2.2.2', dispatcherIds: ['d-1'] });
    expect(out.name).toBe('2.2.2');
    // d-1 was pointed at the new team.
    expect(members[out.id]).toEqual(['d-1']);
  });

  it('translates a duplicate name into 409', async () => {
    const { repo } = makeRepo({ teams: [makeTeam({ id: 't-1', name: '1.1.13' })] });
    const svc = new TeamsService(repo);
    await expect(svc.create({ name: '1.1.13' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a non-dyspozytor dispatcher id with 422 (before any team row)', async () => {
    const { repo } = makeRepo({
      dispatchers: [{ id: 'd-x', role: 'opiekun', active: true, teamId: null }],
    });
    const svc = new TeamsService(repo);
    await expect(
      svc.create({ name: '3.3.3', dispatcherIds: ['d-x'] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects an inactive dispatcher with 422', async () => {
    const { repo } = makeRepo({
      dispatchers: [{ id: 'd-1', role: 'dyspozytor', active: false, teamId: null }],
    });
    const svc = new TeamsService(repo);
    await expect(
      svc.create({ name: '3.3.3', dispatcherIds: ['d-1'] }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('silently moves a dispatcher already on another team (no 422)', async () => {
    const { repo, members } = makeRepo({
      teams: [makeTeam({ id: 't-old', name: '0.0.0' })],
      dispatchers: [{ id: 'd-1', role: 'dyspozytor', active: true, teamId: 't-old' }],
      members: { 't-old': ['d-1'] },
    });
    const svc = new TeamsService(repo);
    const out = await svc.create({ name: '4.4.4', dispatcherIds: ['d-1'] });
    // Moved to the new team; detached from the old.
    expect(members[out.id]).toEqual(['d-1']);
    expect(members['t-old']).toEqual([]);
  });
});

describe('TeamsService.update — membership sync', () => {
  it('replaces the roster: detaches dropped, attaches added', async () => {
    const { repo, members } = makeRepo({
      teams: [makeTeam({ id: 't-1', name: '1.1.13' })],
      dispatchers: [
        { id: 'd-1', role: 'dyspozytor', active: true, teamId: 't-1' },
        { id: 'd-2', role: 'dyspozytor', active: true, teamId: null },
      ],
      members: { 't-1': ['d-1'] },
    });
    const svc = new TeamsService(repo);
    await svc.update('t-1', { dispatcherIds: ['d-2'] });
    // d-1 detached, d-2 attached.
    expect(members['t-1']).toEqual(['d-2']);
  });

  it('leaves membership untouched when dispatcherIds is omitted', async () => {
    const { repo, setUserTeam } = makeRepo({
      teams: [makeTeam({ id: 't-1', name: '1.1.13' })],
      members: { 't-1': ['d-1'] },
    });
    const svc = new TeamsService(repo);
    const out = await svc.update('t-1', { name: 'Nowa nazwa' });
    expect(out.name).toBe('Nowa nazwa');
    expect(setUserTeam).not.toHaveBeenCalled();
  });

  it('translates a duplicate name into 409 on rename', async () => {
    const { repo } = makeRepo({
      teams: [makeTeam({ id: 't-1', name: '1.1.13' })],
    });
    (repo.update as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('P2002'), {
        code: 'P2002',
        meta: { target: ['name'] },
      }),
    );
    const svc = new TeamsService(repo);
    await expect(svc.update('t-1', { name: '9.9.9' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('404 on a missing team', async () => {
    const { repo } = makeRepo({});
    const svc = new TeamsService(repo);
    await expect(svc.update('nope', { name: 'x' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('TeamsService.hardDelete — guarded', () => {
  it('deletes a team with no members and no vehicles', async () => {
    const { repo } = makeRepo({
      teams: [makeTeam({ id: 't-1' })],
      memberCount: 0,
      vehicleCount: 0,
    });
    const svc = new TeamsService(repo);
    await expect(svc.hardDelete('t-1')).resolves.toBeUndefined();
    expect(repo.hardDelete).toHaveBeenCalledWith('t-1');
  });

  it('409 when the team still has dispatchers', async () => {
    const { repo } = makeRepo({
      teams: [makeTeam({ id: 't-1' })],
      memberCount: 2,
      vehicleCount: 0,
    });
    const svc = new TeamsService(repo);
    await expect(svc.hardDelete('t-1')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.hardDelete).not.toHaveBeenCalled();
  });

  it('409 when the team still has vehicles', async () => {
    const { repo } = makeRepo({
      teams: [makeTeam({ id: 't-1' })],
      memberCount: 0,
      vehicleCount: 3,
    });
    const svc = new TeamsService(repo);
    await expect(svc.hardDelete('t-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('TeamsService.deactivate / reactivate', () => {
  it('deactivate flips active=false; double-deactivate is 409', async () => {
    const { repo } = makeRepo({ teams: [makeTeam({ id: 't-1', active: true })] });
    const svc = new TeamsService(repo);
    const out = await svc.deactivate('t-1');
    expect(out.active).toBe(false);
    await expect(svc.deactivate('t-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('reactivate flips active=true; double-reactivate is 409', async () => {
    const { repo } = makeRepo({ teams: [makeTeam({ id: 't-1', active: false })] });
    const svc = new TeamsService(repo);
    const out = await svc.reactivate('t-1');
    expect(out.active).toBe(true);
    await expect(svc.reactivate('t-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('TeamsService.lookup', () => {
  it('returns teams with their dispatcher roster incl. the active flag', async () => {
    const { repo } = makeRepo({
      teams: [
        makeTeam({
          id: 't-1',
          name: '1.1.13',
          dispatchers: [
            { id: 'd-1', name: 'D One', login: 'd1', active: true },
            { id: 'd-2', name: null, login: 'd2', active: false },
          ],
        }),
      ],
    });
    const svc = new TeamsService(repo);
    const out = await svc.lookup();
    expect(out).toEqual([
      {
        id: 't-1',
        name: '1.1.13',
        active: true,
        dispatchers: [
          { id: 'd-1', name: 'D One', login: 'd1', active: true },
          { id: 'd-2', name: null, login: 'd2', active: false },
        ],
      },
    ]);
  });
});
