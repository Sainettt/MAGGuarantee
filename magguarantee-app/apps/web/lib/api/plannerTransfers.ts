// Typed API wrappers for the vehicle planner transfer (docs/29, docs/13
// «Vehicle planner transfers»):
//
//   POST /vehicles/:id/planner-transfers          — file a request (opiekun / current planista)
//   GET  /vehicles/:id/planner-history            — journal + every request of one vehicle
//   GET  /planner-transfers?scope=&status=…       — inbox (`decide`) / own requests (`mine`)
//   POST /planner-transfers/:id/approve|reject|cancel
//
// Thin `fetch` calls — error classification (409 / 422 / 403 by
// `extensions.code`) lives in `lib/transfers/transferErrors.ts`.

import type {
  PlannerTransferDto,
  PlannerTransferListDto,
  PlannerTransferListQuery,
  VehiclePlannerHistoryDto,
} from '@magguarantee/shared';

import { apiJson } from './client';
import { toQuery } from './query';

/** Query params of `GET /planner-transfers` (the input side — defaults are server-side). */
export interface PlannerTransferListParams {
  scope: PlannerTransferListQuery['scope'];
  status?: PlannerTransferListQuery['status'];
  vehicleId?: string;
  cursor?: string;
  limit?: number;
}

/** Body of `POST /vehicles/:id/planner-transfers` (the api trims `reason`). */
export interface RequestPlannerTransferBody {
  toPlannerId: string;
  reason: string;
}

export function listPlannerTransfers(
  params: PlannerTransferListParams,
): Promise<PlannerTransferListDto> {
  return apiJson<PlannerTransferListDto>(
    `/planner-transfers${toQuery({ ...params })}`,
    { method: 'GET' },
  );
}

export function getVehiclePlannerHistory(
  vehicleId: string,
): Promise<VehiclePlannerHistoryDto> {
  return apiJson<VehiclePlannerHistoryDto>(
    `/vehicles/${vehicleId}/planner-history`,
    { method: 'GET' },
  );
}

export function requestPlannerTransfer(
  vehicleId: string,
  body: RequestPlannerTransferBody,
): Promise<PlannerTransferDto> {
  return apiJson<PlannerTransferDto>(
    `/vehicles/${vehicleId}/planner-transfers`,
    { method: 'POST', json: body },
  );
}

/** `comment` is optional (U3) — a blank one is not sent at all. */
export function approvePlannerTransfer(
  id: string,
  comment?: string,
): Promise<PlannerTransferDto> {
  const trimmed = comment?.trim();
  return apiJson<PlannerTransferDto>(`/planner-transfers/${id}/approve`, {
    method: 'POST',
    json: trimmed ? { comment: trimmed } : {},
  });
}

export function rejectPlannerTransfer(
  id: string,
  reason: string,
): Promise<PlannerTransferDto> {
  return apiJson<PlannerTransferDto>(`/planner-transfers/${id}/reject`, {
    method: 'POST',
    json: { reason },
  });
}

export function cancelPlannerTransfer(id: string): Promise<PlannerTransferDto> {
  return apiJson<PlannerTransferDto>(`/planner-transfers/${id}/cancel`, {
    method: 'POST',
  });
}
