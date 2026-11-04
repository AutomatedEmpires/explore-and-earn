// Privacy hooks (SP2 spec section 10) that SP8 registers with its exporter and eraser. A
// location belongs to its org, so erasing a user only forgets who created it.
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { locations } from './schema';

export const privacyHandlers: {
  export(db: DbOrTx, userId: string): Promise<Record<string, unknown>>;
  erase(db: DbOrTx, userId: string): Promise<void>;
} = {
  async export(db, userId) {
    const rows = await db
      .select({ id: locations.id, orgId: locations.orgId, name: locations.name })
      .from(locations)
      .where(eq(locations.createdBy, userId))
      .orderBy(asc(locations.createdAt), asc(locations.id));
    return { locationsCreated: rows };
  },

  async erase(db, userId) {
    await db.update(locations).set({ createdBy: null }).where(eq(locations.createdBy, userId));
  },
};
