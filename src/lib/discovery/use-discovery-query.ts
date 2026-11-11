'use client';
// The discovery query in the URL, for client screens (SP3 plan Task 22). It is read through
// parseQuery, so invalid params are simply absent. The setters write the canonical form back with
// router.replace (no new history entry, no scroll), keeping `source` (attribution) and dropping
// `cursor` (a new query starts at page one) and `intent` (run once).
//
// The host filter: the URL names the host by slug (`host=`), a DiscoveryQuery by `orgId`. Pass
// the host the server resolved (prepareQuery's `labels.host`) and `query` carries its orgId, so
// filter chips show it. setQuery keeps `host=` while the query it is given still has an orgId,
// and drops it when the orgId is gone (removing the host chip, "Clear all"). setSort keeps it.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { parseQuery, serializeQuery } from './query';
import type { DiscoveryQuery, DiscoverySort } from './types';

export function useDiscoveryQuery(host?: { orgId: string; slug: string } | null): {
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
  const hostOrgId = host && host.slug === parsed.hostSlug ? host.orgId : undefined;
  const query = useMemo(
    () => (hostOrgId ? { ...parsed.query, orgId: hostOrgId } : parsed.query),
    [hostOrgId, parsed.query],
  );

  const go = useCallback(
    (q: DiscoveryQuery, sort: DiscoverySort, hostSlug: string | undefined) => {
      const next = serializeQuery(q, sort, { hostSlug });
      if (source) next.set('source', source);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, source],
  );

  return {
    query,
    sort: parsed.sort,
    ...(parsed.hostSlug ? { hostSlug: parsed.hostSlug } : {}),
    setQuery: (q) => go(q, parsed.sort, q.orgId ? parsed.hostSlug : undefined),
    setSort: (s) => go(query, s, parsed.hostSlug),
  };
}
