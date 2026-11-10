// The discovery query in the URL, for client screens (SP3 plan Task 22). W0 stub: W2 replaces it.
import type { DiscoveryQuery, DiscoverySort } from './types';

export function useDiscoveryQuery(): {
  query: DiscoveryQuery;
  sort: DiscoverySort;
  hostSlug?: string;
  setQuery(q: DiscoveryQuery): void;
  setSort(s: DiscoverySort): void;
} {
  throw new Error('not implemented: useDiscoveryQuery');
}
