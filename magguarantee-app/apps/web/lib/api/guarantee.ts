// Phase 12 — Guarantee Watchdog read wrappers (docs/14 §12.4, §12.7).
//
// Three read-only endpoints back the whole watchdog surface — no writes in v1
// (the episode journal is server-driven; carriers resolve episodes implicitly
// by reporting a wyjazd). All three are role-gated + auto-scoped server-side:
//   * `GET /guarantee-compliance`     — live board (admin all / opiekun scoped).
//   * `GET /guarantee-compliance/me`  — carrier's own fleet (banner + badges);
//     rows omit the `carrier` block (the caller already knows who they are).
//   * `GET /guarantee-episodes`       — durable violation archive, cursor-paged.
//
// The client does not re-enforce ownership — route-group layouts gate by role
// and the API filters by scope. Shapes come from `@magguarantee/shared`
// (`packages/shared/src/schemas/guarantee-watchdog.ts`), imported not re-derived.

import type {
  GuaranteeComplianceResponse,
  GuaranteeEpisodeListDto,
  GuaranteeEpisodeStateDto,
} from '@magguarantee/shared';

import { apiJson } from './client';

/** `GET /guarantee-compliance` — admin/opiekun live board. */
export function getGuaranteeCompliance(): Promise<GuaranteeComplianceResponse> {
  return apiJson<GuaranteeComplianceResponse>('/guarantee-compliance', {
    method: 'GET',
  });
}

/** `GET /guarantee-compliance/me` — carrier's own fleet (banner + fleet badges). */
export function getMyGuaranteeCompliance(): Promise<GuaranteeComplianceResponse> {
  return apiJson<GuaranteeComplianceResponse>('/guarantee-compliance/me', {
    method: 'GET',
  });
}

export interface GetGuaranteeEpisodesOptions {
  carrierId?: string;
  vehicleId?: string;
  state?: GuaranteeEpisodeStateDto;
  cursor?: string;
  limit?: number;
}

/** `GET /guarantee-episodes` — cursor-paginated violation archive. */
export function getGuaranteeEpisodes(
  opts: GetGuaranteeEpisodesOptions = {},
): Promise<GuaranteeEpisodeListDto> {
  const qs = new URLSearchParams();
  if (opts.carrierId) qs.set('carrierId', opts.carrierId);
  if (opts.vehicleId) qs.set('vehicleId', opts.vehicleId);
  if (opts.state) qs.set('state', opts.state);
  if (opts.cursor) qs.set('cursor', opts.cursor);
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  const query = qs.toString();
  return apiJson<GuaranteeEpisodeListDto>(
    `/guarantee-episodes${query ? `?${query}` : ''}`,
    { method: 'GET' },
  );
}
