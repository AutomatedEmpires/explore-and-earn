// The SP4 fakes and fixtures behave like the code they stand in for (SP4 plan Task 6).
import { getDocumentProxy } from 'unpdf';
import { beforeEach, describe, expect, it } from 'vitest';
import { applicationSnapshotV1Schema } from '@/lib/applications/schemas';
import { profileSnapshotV1Schema } from '@/lib/profiles/schemas';
import { makePdf } from '@tests/fixtures/sp4/pdf';
import { mayaApplicationSnapshot, mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import {
  bumpRevision,
  calls,
  fakeHost,
  fakeListing,
  fakeLocation,
  hostpagesModule,
  listingsModule,
  locationsModule,
  orgsAdditions,
  resetSp2,
  setListingAccess,
  setListingState,
} from './sp2';
import { calls as sp3Calls, discoveryModule, overlay, resetSp3 } from './sp3';

const db = {} as never;
const ORG = '019a4a3c-0000-7000-8000-0000000e0001';

beforeEach(() => {
  resetSp2();
  resetSp3();
});

describe('SP2 fake', () => {
  it('accepts applications on the current revision, and on the new one after a bump', async () => {
    const { listingId, revisionId } = fakeListing({ orgId: ORG, title: 'Deckhand' });
    expect(await listingsModule.canAcceptApplications(db, listingId)).toEqual({
      ok: true,
      revisionId,
    });
    const next = bumpRevision(listingId);
    expect(next).not.toBe(revisionId);
    expect(await listingsModule.canAcceptApplications(db, listingId)).toEqual({
      ok: true,
      revisionId: next,
    });
    // The old revision stays readable, as SP2's does for receipts.
    expect((await listingsModule.getRevision(db, revisionId)).content.basics.title).toBe(
      'Deckhand',
    );
  });

  it('refuses applications in each closed state', async () => {
    const { listingId } = fakeListing({ orgId: ORG });
    setListingState(listingId, 'deadline_passed');
    expect(await listingsModule.canAcceptApplications(db, listingId)).toEqual({
      ok: false,
      reason: 'deadline_passed',
    });
    setListingState(listingId, 'org_inactive');
    expect(await listingsModule.canAcceptApplications(db, listingId)).toMatchObject({
      reason: 'org_inactive',
    });
    setListingState(listingId, 'closed');
    expect(await listingsModule.canAcceptApplications(db, listingId)).toMatchObject({
      reason: 'not_active',
    });
    expect(await listingsModule.getPublishedListing(db, listingId)).toBeNull();
    expect((await listingsModule.getListingSummaries(db, [listingId])).get(listingId)?.state).toBe(
      'closed',
    );
  });

  it('carries questions, sponsorship and notify members into the revision', async () => {
    const { revisionId } = fakeListing({
      orgId: ORG,
      questions: [{ id: 'q1', prompt: 'Boat?', required: true, type: 'yes_no' }],
      visaSponsorship: 'h2b',
      notifyMemberIds: ['019a4a3c-0000-7000-8000-0000000e0009'],
    });
    const rev = await listingsModule.getRevision(db, revisionId);
    expect(rev.content.applying.questions).toHaveLength(1);
    expect(rev.content.job.visaSponsorship).toBe('h2b');
    expect(rev.content.applying.notifyMemberIds).toEqual(['019a4a3c-0000-7000-8000-0000000e0009']);
  });

  it('normalizes skills like SP2 and lists fixed occupations', async () => {
    expect(listingsModule.normalizeSkill('  Line   Handling ')).toEqual({
      key: 'line-handling',
      label: 'Line Handling',
    });
    expect((await listingsModule.listOccupations(db)).map((o) => o.code)).toEqual([
      'deckhand',
      'line_cook',
      'farmhand',
      'support_agent',
    ]);
  });

  it('serves hosts and locations, records unfollows and decides listing access', async () => {
    fakeHost(ORG, { name: 'Kettle Ridge Lodge' });
    const loc = fakeLocation({ orgId: ORG, city: 'Juneau', state: 'AK' });
    expect((await hostpagesModule.getHostIdentities(db, [ORG])).get(ORG)?.name).toBe(
      'Kettle Ridge Lodge',
    );
    expect((await locationsModule.getLocations(db, [loc])).get(loc)?.city).toBe('Juneau');
    await hostpagesModule.unfollow(db, 'u1', ORG);
    expect(calls.unfollow).toEqual([{ userId: 'u1', orgId: ORG }]);

    const ctx = {
      user: { id: 'u2', clerkUserId: 'c', accountType: 'host' as const, email: null },
      orgId: ORG,
      role: 'recruiter' as const,
    };
    expect(await orgsAdditions.canAccessListing(db, ctx, { id: 'l1', locationId: null })).toBe(
      true,
    );
    setListingAccess(() => false);
    expect(await orgsAdditions.canAccessListing(db, ctx, { id: 'l1', locationId: null })).toBe(
      false,
    );
  });
});

describe('SP3 fake', () => {
  it('captures the overlay and records listing events once per dedupe key', async () => {
    const provider = {
      appliedListingIds: async () => new Set<string>(),
      hiddenOrgIds: async () => [],
    };
    discoveryModule.registerSeekerOverlay(provider);
    expect(overlay.current).toBe(provider);
    const event = {
      listingId: 'l1',
      type: 'apply' as const,
      source: 'seek' as const,
      dedupeKey: 'apply:a1',
    };
    await discoveryModule.recordListingEvent(db, event);
    await discoveryModule.recordListingEvent(db, event);
    expect(sp3Calls.listingEvents).toEqual([event]);
  });
});

describe('fixtures', () => {
  it('makes a PDF with the requested page count', async () => {
    const bytes = await makePdf({ lines: ['x'], pages: 11 });
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    expect(doc.numPages).toBe(11);
  });

  it('puts a stub marker in the PDF bytes through Keywords', async () => {
    const bytes = await makePdf({ lines: ['Maya Rodriguez'], keywords: '__fail__' });
    expect(Buffer.from(bytes).toString('latin1')).toContain('__fail__');
  });

  it("gives Maya's snapshots that pass their schemas", () => {
    expect(profileSnapshotV1Schema.safeParse(mayaSnapshot()).success).toBe(true);
    expect(applicationSnapshotV1Schema.safeParse(mayaApplicationSnapshot()).success).toBe(true);
    expect(mayaSnapshot().skills.filter((s) => s.highlighted)).toHaveLength(2);
    expect(mayaApplicationSnapshot().profile.workAuthorization).toEqual({ status: 'authorized' });
  });
});
