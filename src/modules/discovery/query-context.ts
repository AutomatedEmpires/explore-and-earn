// A query with its display labels and the filter options (SP3 plan Task 21). W0 stub: W2
// replaces it.
import type { DbOrTx } from '@/lib/db';
import type { DiscoveryQuery, DiscoverySort, FilterOptions, QueryLabels } from '@/lib/discovery';

/** parseQuery, with the `host` slug resolved to an orgId (an unknown slug drops the filter). */
export async function prepareQuery(
  _db: DbOrTx,
  _p: URLSearchParams,
): Promise<{ query: DiscoveryQuery; sort: DiscoverySort; labels: QueryLabels }> {
  throw new Error('not implemented: prepareQuery');
}

export async function getQueryLabels(_db: DbOrTx, _q: DiscoveryQuery): Promise<QueryLabels> {
  throw new Error('not implemented: getQueryLabels');
}

export async function getFilterOptions(_db: DbOrTx, _now?: Date): Promise<FilterOptions> {
  throw new Error('not implemented: getFilterOptions');
}
