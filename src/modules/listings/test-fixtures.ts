// Test data for the listings module's tests. Not exported from ./index; never imported by app
// code. Locations come from the locations fake, so tests that use this mock '@/modules/locations'.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { Location } from '@/modules/locations';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { buildListingContent, seedMedia, type SeededOrg } from '../../../tests/helpers/sp2';
import type { HousingSlot, ListingContent } from './content';
import { newId } from '@/lib/ids';

export type ListingFixture = {
  locationId: string;
  coverMediaId: string;
  housingPhotos: Record<HousingSlot, string>;
  /** A complete listing at the fixture's location and photos; `edit` changes it. */
  content(edit?: (c: ListingContent) => void): ListingContent;
};

/** A location (in the locations fake) and approved photos for `org`. */
export async function seedListingFixture(
  db: DbOrTx,
  org: SeededOrg,
  location: Partial<Location> = {},
): Promise<ListingFixture> {
  const locationId = newId();
  locationsFake.setLocation({
    id: locationId,
    orgId: org.orgId,
    state: 'WA',
    timezone: 'America/Los_Angeles',
    ...location,
  });
  const coverMediaId = await seedMedia(db, org.orgId, 'listing_photo');
  const housingPhotos: Record<HousingSlot, string> = {
    bedroom: await seedMedia(db, org.orgId, 'housing_photo'),
    bathroom: await seedMedia(db, org.orgId, 'housing_photo'),
    kitchen: await seedMedia(db, org.orgId, 'housing_photo'),
    exterior: await seedMedia(db, org.orgId, 'housing_photo'),
  };
  return {
    locationId,
    coverMediaId,
    housingPhotos,
    content: (edit) => buildListingContent({ locationId, coverMediaId, housingPhotos }, edit),
  };
}

/** The outbox rows of a topic, oldest first. */
export async function outboxRows(
  db: DbOrTx,
  topic: string,
): Promise<{ dedupe_key: string | null; payload: Record<string, unknown>; available_at: string }[]> {
  return queryRows(
    db,
    sql`select dedupe_key, payload, available_at::text as available_at from app.outbox
      where topic = ${topic} order by created_at, id`,
  );
}

/** The audit actions recorded for a subject, oldest first. */
export async function auditActions(db: DbOrTx, subjectId: string): Promise<string[]> {
  const rows = await queryRows<{ action: string }>(
    db,
    sql`select action from app.audit_events where subject_id = ${subjectId} order by created_at, id`,
  );
  return rows.map((r) => r.action);
}

/** The notifications of a type, as { userId, data }. */
export async function notificationsOf(
  db: DbOrTx,
  type: string,
): Promise<{ user_id: string; data: Record<string, unknown>; title: string }[]> {
  return queryRows(
    db,
    sql`select user_id, data, title from app.notifications where type = ${type}
      order by created_at, id`,
  );
}
