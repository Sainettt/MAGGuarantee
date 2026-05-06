'use client';

// Resolves the current przewoznik's `carrierId` for client-side forms that
// must include it (driver create, trailer create, delegation create).
//
// We don't have a dedicated `/users/me/carrier` endpoint, but every list
// endpoint scoped to the carrier role returns rows whose `carrierId`
// belongs to that carrier — so `GET /vehicles?limit=1` is a cheap probe.
// The auth-scoped guard on `/vehicles` rejects every other role, so
// reading the first row's `carrierId` is safe within this hook.
//
// If the carrier has zero vehicles the hook falls back to drivers, then
// trailers — at least one of those has to exist for the carrier to do
// any business at all. If all three are empty, the hook returns `null`
// and forms must show an empty-fleet state instead of the create UI.

import { useQuery } from '@tanstack/react-query';

import { listDrivers } from '@/lib/api/drivers';
import { listTrailers } from '@/lib/api/trailers';
import { listVehicles } from '@/lib/api/vehicles';

export const MY_CARRIER_ID_KEY = ['carrier', 'me', 'carrierId'] as const;

export function useMyCarrierId() {
  return useQuery({
    queryKey: MY_CARRIER_ID_KEY,
    queryFn: async (): Promise<string | null> => {
      const v = await listVehicles({ limit: 1 });
      const v0 = v.items[0];
      if (v0) return v0.carrierId;
      const d = await listDrivers({ limit: 1 });
      const d0 = d.items[0];
      if (d0) return d0.carrierId;
      const t = await listTrailers({ limit: 1 });
      const t0 = t.items[0];
      if (t0) return t0.carrierId;
      return null;
    },
    staleTime: 30 * 60_000,
  });
}
