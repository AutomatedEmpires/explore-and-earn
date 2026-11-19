// A Recruiter scope may name only the caller's own listings and live locations.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { listingsFake } from '../../tests/fakes/sp2/listings';
import { locationsFake } from '../../tests/fakes/sp2/locations';
import { buildListingContent } from '../../tests/helpers/sp2';
import { assertScopeInOrg } from './team-scope';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('../../tests/fakes/sp2/listings')).listingsFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../tests/fakes/sp2/locations')).locationsFake,
}));

// The fakes keep their state in memory and never touch the database.
const db = {} as Db;
const orgId = newId();
const otherOrgId = newId();

function listing(id: string, owner: string) {
  const at = new Date('2026-11-03T17:00:00Z');
  listingsFake.setListing({
    listingId: id,
    revisionId: newId(),
    orgId: owner,
    content: buildListingContent({
      locationId: newId(),
      coverMediaId: newId(),
      housingPhotos: { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() },
    }),
    firstPublishedAt: at,
    publishedAt: at,
    confirmedActiveAt: null,
    autoCloseAt: null,
    applicationsCloseAt: null,
    provenance: 'host_created',
  });
}

beforeEach(() => {
  listingsFake.reset();
  locationsFake.reset();
});

describe('assertScopeInOrg', () => {
  it('passes a scope of all, or none', async () => {
    await expect(assertScopeInOrg(db, orgId, undefined)).resolves.toBeUndefined();
    await expect(assertScopeInOrg(db, orgId, { kind: 'all' })).resolves.toBeUndefined();
    expect(listingsFake.calls).toEqual([]);
  });

  it("passes the org's own listings and live locations", async () => {
    const l = newId();
    listing(l, orgId);
    const loc = locationsFake.setLocation({ id: newId(), orgId });
    await expect(
      assertScopeInOrg(db, orgId, { kind: 'assigned', listingIds: [l], locationIds: [loc.id] }),
    ).resolves.toBeUndefined();
  });

  it("refuses another org's listing, or an unknown one", async () => {
    const theirs = newId();
    listing(theirs, otherOrgId);
    for (const id of [theirs, newId()]) {
      await expect(
        assertScopeInOrg(db, orgId, { kind: 'assigned', listingIds: [id], locationIds: [] }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
  });

  it("refuses another org's location and an archived one", async () => {
    const theirs = locationsFake.setLocation({ id: newId(), orgId: otherOrgId });
    const archived = locationsFake.setLocation({ id: newId(), orgId, archived: true });
    for (const id of [theirs.id, archived.id, newId()]) {
      await expect(
        assertScopeInOrg(db, orgId, { kind: 'assigned', listingIds: [], locationIds: [id] }),
      ).rejects.toMatchObject({ code: 'not_found' });
    }
  });
});
