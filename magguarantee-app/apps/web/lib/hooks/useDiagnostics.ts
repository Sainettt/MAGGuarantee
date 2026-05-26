'use client';

// TanStack Query hooks for /diagnostics/{mails,claims,db}.
//
// Polling cadences match the brief:
//   * mails  — 30s (BullMQ states change frequently while a queue drains)
//   * claims — on demand (health metrics are stable across minutes)
//   * db     — 60s (ping latency drift is the slow-moving signal)
//
// The resend mutation invalidates the mails list so the row re-appears with
// the freshly enqueued job's id / waiting state.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';
import type { DiagnosticsResendMailResponse } from '@magguarantee/shared';

import {
  getDiagnosticsClaims,
  getDiagnosticsDb,
  getDiagnosticsMails,
  resendDiagnosticsMail,
} from '@/lib/api/diagnostics';

export const DIAGNOSTICS_KEY = ['diagnostics'] as const;

export function useDiagnosticsMails() {
  return useQuery({
    queryKey: [...DIAGNOSTICS_KEY, 'mails'],
    queryFn: getDiagnosticsMails,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useDiagnosticsClaims() {
  return useQuery({
    queryKey: [...DIAGNOSTICS_KEY, 'claims'],
    queryFn: getDiagnosticsClaims,
    staleTime: 60_000,
  });
}

export function useDiagnosticsDb() {
  return useQuery({
    queryKey: [...DIAGNOSTICS_KEY, 'db'],
    queryFn: getDiagnosticsDb,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useResendMail(
  opts?: UseMutationOptions<DiagnosticsResendMailResponse, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: resendDiagnosticsMail,
    ...opts,
    onSuccess: (...args) => {
      qc.invalidateQueries({ queryKey: [...DIAGNOSTICS_KEY, 'mails'] });
      opts?.onSuccess?.(...args);
    },
  });
}
