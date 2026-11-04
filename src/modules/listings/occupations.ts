// The occupation list (seeded by drizzle/1210_occupations_seed.sql).
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { Category } from '@/lib/taxonomy';
import { occupations } from './schema';

export type Occupation = { code: string; label: string; socCode: string; categories: Category[] };

/** Every active occupation, by label. */
export async function listOccupations(db: DbOrTx): Promise<Occupation[]> {
  const rows = await db
    .select({
      code: occupations.code,
      label: occupations.label,
      socCode: occupations.socCode,
      categories: occupations.categories,
    })
    .from(occupations)
    .where(eq(occupations.active, true))
    .orderBy(asc(occupations.label), asc(occupations.code));
  return rows.map((r) => ({ ...r, categories: r.categories as Category[] }));
}
