// The discovery URL codec and filter summaries (SP3 spec 8.1). Invalid params are dropped, never
// thrown. W0 stub: W2 replaces the bodies (Task 17).
import { z } from 'zod';
import type { DiscoveryQuery, DiscoverySort, FilterChip, QueryLabels } from './types';

/** The pay slider ranges, in dollars; 0 means no filter. */
export const PAY_RANGES = {
  hour: { max: 60, step: 1 },
  day: { max: 500, step: 10 },
  year: { max: 150000, step: 1000 },
} as const;

export function parseQuery(_p: URLSearchParams): {
  query: DiscoveryQuery;
  sort: DiscoverySort;
  hostSlug?: string;
} {
  throw new Error('not implemented: parseQuery');
}

export function serializeQuery(
  _q: DiscoveryQuery,
  _sort: DiscoverySort,
  _opts?: { hostSlug?: string },
): URLSearchParams {
  throw new Error('not implemented: serializeQuery');
}

/** Sorted keys and arrays, without bbox, locationId, sort or cursor. */
export function canonicalQuery(_q: DiscoveryQuery): string {
  throw new Error('not implemented: canonicalQuery');
}

export function describeFilters(_q: DiscoveryQuery, _labels: QueryLabels): FilterChip[] {
  throw new Error('not implemented: describeFilters');
}

export function removeFilter(_q: DiscoveryQuery, _key: string): DiscoveryQuery {
  throw new Error('not implemented: removeFilter');
}

/** The chip labels joined with " · ", cut to `maxLen` with "…"; "All jobs" when empty. */
export function summarizeQuery(_q: DiscoveryQuery, _labels: QueryLabels, _maxLen = 80): string {
  throw new Error('not implemented: summarizeQuery');
}

/** The same bounds as parseQuery, strictly, for JSON bodies. */
export const discoveryQuerySchema: z.ZodType<DiscoveryQuery> = z.custom<DiscoveryQuery>(() => {
  throw new Error('not implemented: discoveryQuerySchema');
});
