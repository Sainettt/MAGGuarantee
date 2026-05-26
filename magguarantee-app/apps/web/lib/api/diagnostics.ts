// Phase 4.5 — typed API wrappers for /api/v1/diagnostics/*.
//
// Admin-only on the server side (the dashboard endpoint is admin OR pracownik,
// but it lives in `./dashboard.ts`). Each function maps to a single endpoint.

import type {
  DiagnosticsClaimsHealthDto,
  DiagnosticsDbHealthDto,
  DiagnosticsMailJobListDto,
  DiagnosticsResendMailResponse,
} from '@magguarantee/shared';

import { apiJson } from './client';

export function getDiagnosticsMails(): Promise<DiagnosticsMailJobListDto> {
  return apiJson<DiagnosticsMailJobListDto>('/diagnostics/mails', {
    method: 'GET',
  });
}

export function resendDiagnosticsMail(
  jobId: string,
): Promise<DiagnosticsResendMailResponse> {
  return apiJson<DiagnosticsResendMailResponse>(
    `/diagnostics/mails/${encodeURIComponent(jobId)}/resend`,
    { method: 'POST' },
  );
}

export function getDiagnosticsClaims(): Promise<DiagnosticsClaimsHealthDto> {
  return apiJson<DiagnosticsClaimsHealthDto>('/diagnostics/claims', {
    method: 'GET',
  });
}

export function getDiagnosticsDb(): Promise<DiagnosticsDbHealthDto> {
  return apiJson<DiagnosticsDbHealthDto>('/diagnostics/db', {
    method: 'GET',
  });
}
