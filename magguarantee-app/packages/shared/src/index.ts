// @magguarantee/shared — public surface.
//
// Phase 1 shipped the auth contract. Wave 2 (foundation) adds the
// `schemas/common.ts` primitives + namespace hub. Wave 3+ adds per-domain
// CRUD schemas; Phase 3 adds km-calc helpers under `domain/`.
//
// Single import surface — both api and web pull from `@magguarantee/shared`.

export * from './schemas';
export * from './constants';
export * from './domain';
// docs/25 B1 — permissions catalog (dependency-free; also imported by the edge
// middleware). `./permissions-matrix` (docs/03 table) is deliberately NOT here.
export * from './permissions';
