// Saved searches (job alerts) and alert settings (SP3 spec 5 and 8.10). W0 stub: W4 replaces
// it (Task 28).
import type { Db, DbOrTx } from '@/lib/db';
import type { DiscoveryQuery } from '@/lib/discovery';

export type SavedSearchItem = {
  id: string;
  name: string;
  query: DiscoveryQuery;
  /** The filter summary, computed on every read. */
  summary: string;
  pushEnabled: boolean;
  emailDaily: boolean;
  createdAt: string;
};

/** The same query (by hash) returns the user's existing search with `created: false`. */
export async function createSavedSearch(
  _db: Db,
  _userId: string,
  _i: { query: DiscoveryQuery; name?: string },
): Promise<{ item: SavedSearchItem; created: boolean }> {
  throw new Error('not implemented: createSavedSearch');
}

export async function updateSavedSearch(
  _db: Db,
  _userId: string,
  _id: string,
  _i: { name?: string; pushEnabled?: boolean; emailDaily?: boolean },
): Promise<SavedSearchItem> {
  throw new Error('not implemented: updateSavedSearch');
}

export async function deleteSavedSearch(_db: Db, _userId: string, _id: string): Promise<void> {
  throw new Error('not implemented: deleteSavedSearch');
}

export async function listSavedSearches(_db: DbOrTx, _userId: string): Promise<SavedSearchItem[]> {
  throw new Error('not implemented: listSavedSearches');
}

export async function getAlertSettings(
  _db: DbOrTx,
  _userId: string,
): Promise<{ weeklyDigest: boolean }> {
  throw new Error('not implemented: getAlertSettings');
}

export async function setAlertSettings(
  _db: DbOrTx,
  _userId: string,
  _i: { weeklyDigest: boolean },
): Promise<{ weeklyDigest: boolean }> {
  throw new Error('not implemented: setAlertSettings');
}
