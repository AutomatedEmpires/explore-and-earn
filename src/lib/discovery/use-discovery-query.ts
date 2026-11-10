'use client';
// The discovery query in the URL, for client screens (SP3 plan Task 22). It is read through
// parseQuery, so invalid params are simply absent. The setters write the canonical form back with
// router.replace (no new history entry, no scroll), keeping `source` (attribution) and the host
// filter, and dropping `cursor` (a new query starts at page one) and `intent` (run once).
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { parseQuery, serializeQuery } from './query';
import type { DiscoveryQuery, DiscoverySort } from './types';

export function useDiscoveryQuery(): {
  query: DiscoveryQuery;
  sort: DiscoverySort;
  hostSlug?: string;
  setQuery(q: DiscoveryQuery): void;
  setSort(s: DiscoverySort): void;
} {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const search = params.toString();
  const parsed = useMemo(() => parseQuery(new URLSearchParams(search)), [search]);
  const source = new URLSearchParams(search).get('source');

  const go = useCallback(
    (q: DiscoveryQuery, sort: DiscoverySort) => {
      const next = serializeQuery(q, sort, { hostSlug: parsed.hostSlug });
      if (source) next.set('source', source);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [parsed.hostSlug, pathname, router, source],
  );

  return {
    query: parsed.query,
    sort: parsed.sort,
    ...(parsed.hostSlug ? { hostSlug: parsed.hostSlug } : {}),
    setQuery: (q) => go(q, parsed.sort),
    setSort: (s) => go(parsed.query, s),
  };
}
