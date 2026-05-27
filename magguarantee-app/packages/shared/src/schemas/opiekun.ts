// Phase 5 — Opiekun-scoped surface DTO contracts.
//
// Source of truth for `/api/v1/opiekun/carriers` per the Phase 5 routing
// plan (lighter sibling of `/fleet/opiekun` — identity + counts only, no
// per-vehicle classification). Suitable for navigation menus / left rails
// where the dashboard only needs to list the carriers under the calling
// opiekun without the per-vehicle classification cost.
//
// Role gating: admin sees every (non-soft-deleted) carrier; opiekun sees
// only carriers where `Carrier.opiekunId === user.sub`. Enforcement is in
// `OpiekunService.listMyCarriers`, not in the OpiekunOwnershipGuard (which
// is decorator-driven and targets single-resource lookups).

import { z } from 'zod';

import { UuidSchema } from './common';

/**
 * Slim per-carrier counts — active children only. Matches the live
 * `_count` filter used by `CarriersRepository.includeShape()` so the two
 * surfaces report the same numbers.
 */
export const OpiekunCarrierCountsSchema = z.object({
  vehicles: z.number().int().nonnegative(),
  drivers: z.number().int().nonnegative(),
  trailers: z.number().int().nonnegative(),
});
export type OpiekunCarrierCounts = z.infer<typeof OpiekunCarrierCountsSchema>;

/**
 * One row in the `/opiekun/carriers` list. Identity (id/login/nazwa/firma/
 * nip/aktywny) + the three active-child counts.
 *
 * Kept intentionally tight: no `email`, no contact info, no address — the
 * opiekun sidebar only needs to render a navigable list. The full carrier
 * DTO is available via `GET /carriers/:id`.
 */
export const OpiekunCarrierListItemSchema = z.object({
  carrierId: UuidSchema,
  login: z.string(),
  nazwa: z.string().nullable(),
  firma: z.string().nullable(),
  nip: z.string(),
  aktywny: z.boolean(),
  counts: OpiekunCarrierCountsSchema,
});
export type OpiekunCarrierListItem = z.infer<
  typeof OpiekunCarrierListItemSchema
>;

/**
 * Response for `GET /opiekun/carriers`. Plain array — no pagination
 * (opiekuni typically supervise a small handful of carriers, capped at the
 * shared list-limit upstream).
 */
export const OpiekunCarriersResponseSchema = z.array(
  OpiekunCarrierListItemSchema,
);
export type OpiekunCarriersResponse = z.infer<
  typeof OpiekunCarriersResponseSchema
>;
