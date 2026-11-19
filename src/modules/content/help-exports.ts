// W4 fills help articles. The table list stays empty until that migration exists.
import type { DbOrTx } from '@/lib/db';

export const HELP_TABLES: readonly string[] = [];

export async function searchHelp(_db: DbOrTx, _query: string): Promise<unknown[]> {
  return [];
}
