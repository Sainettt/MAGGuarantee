// Tiny URL-querystring helper + typed paginated response.
//
// We don't pull a query-string library — the wrappers serialize a single
// flat object whose values are primitives. `undefined` and empty-string
// values are dropped so the API doesn't see noisy "?q=&active=" queries.

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}

export type QueryValue = string | number | boolean | undefined | null;

export function toQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null || raw === '') continue;
    search.append(key, String(raw));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}
