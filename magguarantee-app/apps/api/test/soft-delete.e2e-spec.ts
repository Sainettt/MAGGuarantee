import 'reflect-metadata';

import {
  INCLUDE_SOFT_DELETED,
  softDeleteExtension,
} from '../src/modules/prisma/soft-delete.extension';
import { prisma } from '@magguarantee/database';

/**
 * Regression test for the soft-delete Prisma client extension, run against a
 * REAL Postgres (the same DB the other *.e2e-spec.ts files use). The unit
 * spec (`soft-delete.extension.spec.ts`) only checks the pure helpers and the
 * model list — it MOCKS nothing of the actual delete-rewrite, so it could not
 * catch the production bug where an attachment `.delete()` recursed
 * (RangeError → 500) because `CarrierAttachment` was missing from
 * `SOFT_DELETE_MODELS`.
 *
 * Here we build the extended client exactly as `PrismaService` does
 * (`prisma.$extends(softDeleteExtension())`) and exercise it end to end:
 *
 *   1. Soft model (`CarrierAttachment`): `.delete()` sets `deletedAt` instead
 *      of removing the row, subsequent reads exclude it, and it does NOT throw
 *      (guards against the recursion regressing).
 *   2. Soft model `.count()` / `findMany` exclude the soft-deleted row — the
 *      property the carrier single-ADR guard and `listByCarrier` rely on.
 *   3. The `INCLUDE_SOFT_DELETED` escape hatch performs a TRUE hard-delete
 *      (`hardDelete`/upload-rollback path) without recursing.
 *   4. Non-soft model (`TrailerType`): `.delete()` performs a genuine hard
 *      delete without recursion (the second half of the same footgun).
 *
 * The test is self-contained: it attaches to a seeded carrier and cleans up
 * every row it creates.
 */

type ExtendedClient = ReturnType<typeof buildExtended>;
function buildExtended() {
  return prisma.$extends(softDeleteExtension());
}

describe('soft-delete extension (e2e, real Postgres)', () => {
  let ext: ExtendedClient;
  let carrierId: string;
  const createdAttachmentIds: string[] = [];
  const createdTrailerTypeIds: string[] = [];

  beforeAll(async () => {
    ext = buildExtended();
    const carrier = await prisma.carrier.findFirst({ select: { id: true } });
    if (!carrier) {
      throw new Error(
        'soft-delete e2e needs a seeded carrier — run the DB seed first',
      );
    }
    carrierId = carrier.id;
  });

  afterAll(async () => {
    // Hard-clean everything this spec created (raw client, bypasses the soft
    // rewrite — `deleteMany` on the raw singleton is NOT extended).
    if (createdAttachmentIds.length > 0) {
      await prisma.carrierAttachment.deleteMany({
        where: { id: { in: createdAttachmentIds } },
      });
    }
    if (createdTrailerTypeIds.length > 0) {
      await prisma.trailerType.deleteMany({
        where: { id: { in: createdTrailerTypeIds } },
      });
    }
    await prisma.$disconnect();
  });

  async function createAttachment(): Promise<string> {
    const row = await prisma.carrierAttachment.create({
      data: {
        carrierId,
        category: 'other',
        storageKey: `test/soft-delete/${Date.now()}-${Math.random()}`,
        fileName: 'probe.pdf',
        mimeType: 'application/pdf',
        size: 1,
      },
      select: { id: true },
    });
    createdAttachmentIds.push(row.id);
    return row.id;
  }

  it('soft-deletes an attachment (sets deletedAt) without throwing', async () => {
    const id = await createAttachment();

    // The bug: this used to RangeError (recursion) → 500.
    await expect(
      ext.carrierAttachment.delete({ where: { id } }),
    ).resolves.toBeDefined();

    // Row still physically present, now stamped with deletedAt.
    const raw = await prisma.carrierAttachment.findUnique({ where: { id } });
    expect(raw).not.toBeNull();
    expect(raw?.deletedAt).toBeInstanceOf(Date);
  });

  it('hides the soft-deleted attachment from findFirst / findMany / count', async () => {
    const id = await createAttachment();
    await ext.carrierAttachment.delete({ where: { id } });

    // findFirst by id → excluded
    const byId = await ext.carrierAttachment.findFirst({ where: { id } });
    expect(byId).toBeNull();

    // findUnique post-filter → excluded
    const unique = await ext.carrierAttachment.findUnique({ where: { id } });
    expect(unique).toBeNull();

    // findMany for the carrier must not contain it
    const list = await ext.carrierAttachment.findMany({ where: { carrierId } });
    expect(list.some((r) => r.id === id)).toBe(false);

    // count for this carrier+category must not include it (the single-ADR
    // guard / countActiveByCategory property)
    const liveCount = await ext.carrierAttachment.count({
      where: { carrierId, category: 'other' },
    });
    const rawCount = await prisma.carrierAttachment.count({
      where: { carrierId, category: 'other' },
    });
    expect(liveCount).toBeLessThan(rawCount);
  });

  it('escape hatch performs a TRUE hard delete (hardDelete path) without recursion', async () => {
    const id = await createAttachment();

    await expect(
      ext.carrierAttachment.deleteMany({
        where: { id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [INCLUDE_SOFT_DELETED]: true,
      } as any),
    ).resolves.toBeDefined();

    const raw = await prisma.carrierAttachment.findUnique({ where: { id } });
    expect(raw).toBeNull(); // physically gone, no orphan soft row
    // Drop from cleanup list (already gone).
    const idx = createdAttachmentIds.indexOf(id);
    if (idx >= 0) createdAttachmentIds.splice(idx, 1);
  });

  it('non-soft model (TrailerType) hard-deletes without recursion', async () => {
    const tt = await prisma.trailerType.create({
      data: { name: `SOFT_DELETE_PROBE_${Date.now()}` },
      select: { id: true },
    });
    createdTrailerTypeIds.push(tt.id);

    // The same recursion footgun bit non-soft models too — this used to
    // RangeError. Now it runs a genuine delete on the base client.
    await expect(
      ext.trailerType.delete({ where: { id: tt.id } }),
    ).resolves.toBeDefined();

    const gone = await prisma.trailerType.findUnique({ where: { id: tt.id } });
    expect(gone).toBeNull();
    // Already gone — drop from cleanup.
    const idx = createdTrailerTypeIds.indexOf(tt.id);
    if (idx >= 0) createdTrailerTypeIds.splice(idx, 1);
  });
});
