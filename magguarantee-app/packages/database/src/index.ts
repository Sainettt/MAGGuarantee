// Phase 0 entrypoint for @magguarantee/database.
//
// In Phase 1 this module will re-export the generated PrismaClient from
// ./generated/client (produced by `prisma generate`) and expose a singleton
// `prisma` instance. For now we only re-export the (placeholder) enums so
// that `tsc --noEmit` works on a clean checkout where `prisma generate` has
// not been run yet — importing from ./generated before the directory exists
// would break typecheck.
//
// PrismaClient export will be added once prisma generate runs (phase 1).

export * from './enums';
