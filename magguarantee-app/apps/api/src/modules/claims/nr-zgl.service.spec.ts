import { formatNrZgl, NrZglService } from './nr-zgl.service';

describe('formatNrZgl', () => {
  it('zero-pads NNN to three digits', () => {
    expect(formatNrZgl(1, '02', '26')).toBe('GWA/001/02/26');
    expect(formatNrZgl(7, '02', '26')).toBe('GWA/007/02/26');
    expect(formatNrZgl(99, '02', '26')).toBe('GWA/099/02/26');
    expect(formatNrZgl(100, '02', '26')).toBe('GWA/100/02/26');
    expect(formatNrZgl(999, '12', '26')).toBe('GWA/999/12/26');
  });

  it('lets >999 grow naturally rather than overflow', () => {
    expect(formatNrZgl(1000, '12', '99')).toBe('GWA/1000/12/99');
  });
});

describe('NrZglService', () => {
  it('upserts the per-month counter and emits the formatted nrZgl', async () => {
    const upsert = jest.fn().mockResolvedValueOnce({
      yearMonth: '26-05',
      lastNumber: 42,
    });
    const tx = {
      claim: { create: jest.fn(), update: jest.fn() },
      claimSequence: { upsert },
    } as Parameters<NrZglService['nextWithin']>[0];

    const svc = new NrZglService();
    const out = await svc.nextWithin(tx, new Date(2026, 4, 15));

    expect(out).toBe('GWA/042/05/26');
    expect(upsert).toHaveBeenCalledWith({
      where: { yearMonth: '26-05' },
      create: { yearMonth: '26-05', lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
  });

  it('zero-pads single-digit months', async () => {
    const upsert = jest.fn().mockResolvedValueOnce({
      yearMonth: '26-01',
      lastNumber: 1,
    });
    const tx = {
      claim: { create: jest.fn(), update: jest.fn() },
      claimSequence: { upsert },
    } as Parameters<NrZglService['nextWithin']>[0];

    const svc = new NrZglService();
    const out = await svc.nextWithin(tx, new Date(2026, 0, 1));

    expect(out).toBe('GWA/001/01/26');
  });

  it('uses last-2 digits of the year', async () => {
    const upsert = jest.fn().mockResolvedValueOnce({
      yearMonth: '00-02',
      lastNumber: 1,
    });
    const tx = {
      claim: { create: jest.fn(), update: jest.fn() },
      claimSequence: { upsert },
    } as Parameters<NrZglService['nextWithin']>[0];

    const svc = new NrZglService();
    const out = await svc.nextWithin(tx, new Date(2100, 1, 1));

    expect(out).toBe('GWA/001/02/00');
  });
});
