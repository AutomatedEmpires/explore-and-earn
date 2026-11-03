// Helpers shared inside the trust module. Not exported from ./index.
import type { Db, DbOrTx, Tx } from '@/lib/db';

/**
 * Runs `fn` in a transaction: a new one on a Db, or a savepoint inside the caller's
 * transaction, so the trust writes commit (or roll back) together either way.
 */
export function transact<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}
