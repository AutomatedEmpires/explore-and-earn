import type { Storage } from './storage';
import type { DbOrTx } from '@/lib/db';

/** W1 reads an approved file for a privacy export. */
export async function readMediaForExport(
  _db: DbOrTx,
  _storage: Storage,
  _mediaId: string,
): Promise<{ name: string; mime: string; bytes: Uint8Array } | null> {
  throw new Error('not implemented: readMediaForExport (W1)');
}
