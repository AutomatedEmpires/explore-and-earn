// Privacy hooks (SP2 spec section 10) that SP8 registers with its exporter and eraser. A
// location belongs to its org, so erasing a user only forgets who created it.
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import type { EraseResult, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { locationWeather, locations } from './schema';

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

export const privacyHandler: PrivacyHandler = {
  module: 'locations',
  tables: ['locations', 'location_weather'],

  // A location is the organization's business address, not the person's.
  async exportData() {
    return { records: {}, files: [] };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    const heldAll = ctx.holds.includes('all');

    if (s.kind === 'user') {
      if (heldAll) {
        const [row] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.createdBy, s.userId))
          .limit(1);
        return {
          erased: 0,
          retained: row ? [{ table: 'locations', reason: 'legal_hold', until: null }] : [],
        };
      }
      const cleared = await tx
        .update(locations)
        .set({ createdBy: null })
        .where(eq(locations.createdBy, s.userId))
        .returning({ id: locations.id });
      return { erased: cleared.length, retained: [] };
    }

    const rows = await tx
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.orgId, s.orgId));
    if (rows.length === 0) return { erased: 0, retained: [] };
    const ids = rows.map((row) => row.id);

    if (heldAll) {
      const [weather] = await tx
        .select({ id: locationWeather.locationId })
        .from(locationWeather)
        .where(inArray(locationWeather.locationId, ids))
        .limit(1);
      return {
        erased: 0,
        retained: [
          { table: 'locations', reason: 'legal_hold', until: null },
          ...(weather
            ? [{ table: 'location_weather', reason: 'legal_hold' as const, until: null }]
            : []),
        ],
      };
    }

    // The closed organization's sites stay as archived rows, because listings and frozen
    // applications point at them. The street address goes; the city and state stay.
    const weather = await tx
      .delete(locationWeather)
      .where(inArray(locationWeather.locationId, ids))
      .returning({ id: locationWeather.locationId });
    const archived = await tx
      .update(locations)
      .set({
        archivedAt: sql`coalesce(${locations.archivedAt}, ${ctx.now.toISOString()}::timestamptz)`,
        addressLine1: null,
        postalCode: null,
      })
      .where(
        and(
          eq(locations.orgId, s.orgId),
          or(
            isNull(locations.archivedAt),
            isNotNull(locations.addressLine1),
            isNotNull(locations.postalCode),
          ),
        ),
      )
      .returning({ id: locations.id });
    return {
      erased: weather.length + archived.length,
      retained: [{ table: 'locations', reason: 'shared_record', until: null }],
    };
  },
};
export const retentionRules: RetentionRule[] = [];
