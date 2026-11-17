// The seeker's reads (SP4 spec 5 and 8.5, plan Task 22): the apply context, My jobs lists and
// receipts, each scoped to the seeker and rendered from the frozen snapshot.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as hostpages from '@/modules/hostpages';
import * as listings from '@/modules/listings';
import * as locations from '@/modules/locations';
import * as orgs from '@/modules/orgs';
import { resetSp2, setListingState } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedUser } from '@tests/helpers/sp4';
import { countApplicationsSince, getApplyContext, getReceipt, listMyApplications } from './reads';
import { setStatus, withdraw } from './status';
import { submitApplication } from './submit';
import {
  deckhand,
  forceStatus,
  input,
  QUESTIONS,
  reasonOf,
  rejection,
  resetMocks,
  safety,
  seedWorld,
  setProfile,
  type World,
} from './test-fixtures';

// Every SP2 function is a spy over the fake, so a test can prove a read never called SP2.
// (vi.hoisted: the mock factories below run before this file's own statements.)
const { spied } = vi.hoisted(() => ({
  spied: <T extends Record<string, (...args: never[]) => unknown>>(fake: T): T =>
    Object.fromEntries(Object.entries(fake).map(([name, fn]) => [name, vi.fn(fn)])) as unknown as T,
}));

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...spied((await import('@tests/fakes/sp4/sp2')).listingsModule),
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...spied((await import('@tests/fakes/sp4/sp2')).orgsAdditions),
}));
vi.mock('@/modules/hostpages', async () =>
  spied((await import('@tests/fakes/sp4/sp2')).hostpagesModule),
);
vi.mock('@/modules/locations', async () =>
  spied((await import('@tests/fakes/sp4/sp2')).locationsModule),
);
vi.mock('@/modules/profiles', async () => (await import('./test-fixtures')).profilesMock());
vi.mock('@/modules/safety', async () => (await import('./test-fixtures')).safetyMock());
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify: vi.fn(async () => {}),
}));

const SP2 = [
  listings.canAcceptApplications,
  listings.getRevision,
  listings.getListingSummaries,
  listings.getPublishedListing,
  orgs.listMembers,
  orgs.canAccessListing,
  hostpages.getHostIdentities,
  locations.getLocations,
];
const clearSp2Calls = () => SP2.forEach((fn) => vi.mocked(fn).mockClear());
const sp2Calls = () => SP2.reduce((n, fn) => n + vi.mocked(fn).mock.calls.length, 0);

let t: TestDb;
let w: World;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  resetSp2();
  resetMocks();
  w = await seedWorld(t.db);
});

const apply = async (l = deckhand(w)) =>
  (await submitApplication(t.db, w.seeker.id, input(l))).application.applicationId;

const hostActor = () => ({ type: 'host' as const, userId: w.owner.user.id, orgId: w.orgId });

describe('listMyApplications', () => {
  it('moves an application between views as its status changes (E6)', async () => {
    const id = await apply();
    const applied = await listMyApplications(t.db, w.seeker.id, { view: 'applied' });
    expect(applied.items).toEqual([
      {
        applicationId: id,
        listingId: expect.any(String) as string,
        title: 'Deckhand',
        orgName: 'Kettle Ridge Lodge',
        orgLogoMediaId: null,
        seekerStatus: 'applied',
        submittedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/) as string,
      },
    ]);
    expect(applied.counts).toEqual({ applied: 1, interviews: 0, offers: 0 });

    await setStatus(t.db, {
      applicationId: id,
      from: ['new'],
      to: 'interviewing',
      actor: hostActor(),
    });
    expect((await listMyApplications(t.db, w.seeker.id, { view: 'applied' })).items).toEqual([]);
    const interviews = await listMyApplications(t.db, w.seeker.id, { view: 'interviews' });
    expect(interviews.items.map((i) => [i.applicationId, i.seekerStatus])).toEqual([
      [id, 'interviewing'],
    ]);
    expect(interviews.counts).toEqual({ applied: 0, interviews: 1, offers: 0 });

    await forceStatus(t.db, id, 'offered');
    const offers = await listMyApplications(t.db, w.seeker.id, { view: 'offers' });
    expect(offers.items.map((i) => i.seekerStatus)).toEqual(['offer']);
  });

  it('keeps finished applications under Applied with their own status', async () => {
    const withdrawn = await apply();
    const passed = await apply();
    await withdraw(t.db, { applicationId: withdrawn, seekerUserId: w.seeker.id });
    await forceStatus(t.db, passed, 'not_selected');
    const { items } = await listMyApplications(t.db, w.seeker.id, { view: 'applied' });
    expect(new Map(items.map((i) => [i.applicationId, i.seekerStatus]))).toEqual(
      new Map([
        [withdrawn, 'withdrawn'],
        [passed, 'not_selected'],
      ]),
    );
  });

  it("never lists another seeker's applications", async () => {
    await apply();
    const other = await seedUser(t.db, { accountType: 'seeker' });
    expect(await listMyApplications(t.db, other.id, { view: 'applied' })).toEqual({
      items: [],
      nextBefore: null,
      counts: { applied: 0, interviews: 0, offers: 0 },
    });
  });

  it('pages newest first without skipping or repeating a row', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) ids.push(await apply());
    // Two share a timestamp, so the id breaks the tie.
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
      for (const [i, id] of ids.entries()) {
        const at = new Date(Date.UTC(2026, 10, 1 + Math.floor(i / 2))).toISOString();
        await tx.execute(
          sql`update app.applications set submitted_at = ${at}::timestamptz where id = ${id}::uuid`,
        );
      }
    });

    const seen: string[] = [];
    let before: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await listMyApplications(t.db, w.seeker.id, {
        view: 'applied',
        before,
        limit: 2,
      });
      seen.push(...res.items.map((i) => i.applicationId));
      if (!res.nextBefore) break;
      before = res.nextBefore;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen)).toEqual(new Set(ids));
    // Newest day first.
    expect(seen[0]).toBe(ids[4]);
    expect(seen.at(-1) === ids[0] || seen.at(-1) === ids[1]).toBe(true);
  });

  it('refuses a malformed cursor and one from another view', async () => {
    for (let i = 0; i < 2; i += 1) await apply();
    const first = await listMyApplications(t.db, w.seeker.id, { view: 'applied', limit: 1 });
    expect(first.nextBefore).not.toBeNull();
    const wrongView = await rejection(
      listMyApplications(t.db, w.seeker.id, { view: 'offers', before: first.nextBefore ?? '' }),
    );
    expect(wrongView.status).toBe(400);
    expect(reasonOf(wrongView)).toBe('invalid_cursor');
    const garbage = await rejection(
      listMyApplications(t.db, w.seeker.id, { view: 'applied', before: "'; drop table x; --" }),
    );
    expect(garbage.status).toBe(400);
  });
});

describe('getReceipt', () => {
  it('shows the seeker their own history, without internal moves or notes', async () => {
    const id = await apply();
    await setStatus(t.db, {
      applicationId: id,
      from: ['new'],
      to: 'shortlisted',
      actor: hostActor(),
    });
    // A host-internal note on the history, as SP5 writes them.
    await t.db.execute(sql`
      insert into app.application_events
        (id, application_id, type, from_status, to_status, actor_type, note)
      values (gen_random_uuid(), ${id}, 'status_changed', 'shortlisted', 'interviewing', 'host',
        'Strong fit')`);
    await forceStatus(t.db, id, 'interviewing');

    const receipt = await getReceipt(t.db, w.seeker.id, id);
    expect(receipt.seekerStatus).toBe('interviewing');
    // new -> shortlisted reads Applied -> Applied, so it is not an event for the seeker.
    expect(receipt.events.map((e) => [e.type, e.seekerStatus])).toEqual([
      ['submitted', 'applied'],
      ['status_changed', 'interviewing'],
    ]);
    const serialized = JSON.stringify(receipt);
    expect(serialized).not.toContain('Strong fit');
    expect(serialized).not.toContain('shortlisted');
    expect(receipt.events.every((e) => !('note' in e))).toBe(true);
    expect(receipt.canWithdraw).toBe(true);
    expect(receipt.canTickAdditionalStep).toBe(false);
  });

  it("is not found for another seeker's application, the same as an unknown one", async () => {
    const id = await apply();
    const other = await seedUser(t.db, { accountType: 'seeker' });
    const theirs = await rejection(getReceipt(t.db, other.id, id));
    const unknown = await rejection(
      getReceipt(t.db, w.seeker.id, '019a4a3c-0000-7000-8000-0000000f0020'),
    );
    expect(theirs.status).toBe(404);
    expect({ code: theirs.code, message: theirs.message }).toEqual({
      code: unknown.code,
      message: unknown.message,
    });
  });

  it('cannot be withdrawn once it is final', async () => {
    const id = await apply();
    await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id });
    const receipt = await getReceipt(t.db, w.seeker.id, id);
    expect(receipt.canWithdraw).toBe(false);
    expect(receipt.events.map((e) => e.type)).toEqual(['submitted', 'withdrawn']);
  });

  it('renders from the snapshot after the listing is removed, with no SP2 call (Review Focus 5)', async () => {
    const l = deckhand(w);
    const id = await apply(l);
    setListingState(l.listingId, 'removed');
    clearSp2Calls();

    const list = await listMyApplications(t.db, w.seeker.id, { view: 'applied' });
    const receipt = await getReceipt(t.db, w.seeker.id, id);
    expect(list.items[0]?.title).toBe('Deckhand');
    expect(receipt.snapshot.listing.title).toBe('Deckhand');
    expect(sp2Calls()).toBe(0);
  });
});

describe('getApplyContext', () => {
  it('returns the listing, its questions and the profile as the host would get it', async () => {
    setProfile({ workAuthorization: { status: 'has_visa', visaType: 'j1', endsOn: '2027-09-30' } });
    const l = deckhand(w);
    const ctx = await getApplyContext(t.db, w.seeker.id, l.listingId);
    expect(ctx.listing).toMatchObject({
      id: l.listingId,
      revisionId: l.revisionId,
      title: 'Deckhand',
      orgName: 'Kettle Ridge Lodge',
      locationLabel: 'Juneau, AK',
      status: 'active',
    });
    expect(ctx.questions).toEqual(QUESTIONS);
    expect(ctx).toMatchObject({
      sponsorshipWarning: false,
      blocked: 'none',
      existingApplicationId: null,
      missingFields: [],
      resume: { mode: 'classic' },
    });
    // The preview is what would be sent: no visa type, no end date.
    expect(ctx.preview.workAuthorization).toEqual({ status: 'authorized' });
    expect(JSON.stringify(ctx)).not.toContain('2027-09-30');
  });

  it('links the existing application, even a withdrawn one (Review Focus 1)', async () => {
    const l = deckhand(w);
    const id = await apply(l);
    await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id });
    expect((await getApplyContext(t.db, w.seeker.id, l.listingId)).existingApplicationId).toBe(id);
  });

  it("does not report another seeker's application as existing", async () => {
    const l = deckhand(w);
    await apply(l);
    const other = await seedUser(t.db, { accountType: 'seeker' });
    expect((await getApplyContext(t.db, other.id, l.listingId)).existingApplicationId).toBeNull();
  });

  it.each(['closed', 'deadline_passed', 'org_inactive'] as const)(
    'reads closed when the listing is %s (Review Focus 3)',
    async (state) => {
      const l = deckhand(w);
      setListingState(l.listingId, state);
      const ctx = await getApplyContext(t.db, w.seeker.id, l.listingId);
      expect(ctx.listing.status).toBe('closed');
      expect(ctx.listing.title).toBe('Deckhand');
    },
  );

  it('is not found for a removed or unknown listing', async () => {
    const l = deckhand(w);
    setListingState(l.listingId, 'removed');
    expect((await rejection(getApplyContext(t.db, w.seeker.id, l.listingId))).status).toBe(404);
    expect(
      (await rejection(getApplyContext(t.db, w.seeker.id, '019a4a3c-0000-7000-8000-0000000f0021')))
        .status,
    ).toBe(404);
  });

  it('warns when the host does not sponsor and the seeker needs it', async () => {
    setProfile({ workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] } });
    const l = deckhand(w, { visaSponsorship: 'none' });
    const ctx = await getApplyContext(t.db, w.seeker.id, l.listingId);
    expect(ctx.sponsorshipWarning).toBe(true);
    expect(ctx.preview.workAuthorization).toEqual({
      status: 'needs_sponsorship',
      visaTypes: ['other'],
    });
  });

  it('names missing profile fields and a block in either direction', async () => {
    setProfile({ firstName: '', city: '' });
    const l = deckhand(w);
    safety.isBlockedBetween.mockResolvedValue({ blocked: true, byA: true, byB: false });
    const mine = await getApplyContext(t.db, w.seeker.id, l.listingId);
    expect(mine.missingFields).toEqual(['first_name', 'city']);
    expect(mine.blocked).toBe('you_blocked');
    safety.isBlockedBetween.mockResolvedValue({ blocked: true, byA: false, byB: true });
    expect((await getApplyContext(t.db, w.seeker.id, l.listingId)).blocked).toBe('unavailable');
  });
});

describe('countApplicationsSince', () => {
  it('counts the applications submitted at or after the cutoff', async () => {
    const cutoff = new Date(Date.now() - 86_400_000);
    const all = await countApplicationsSince(t.db, new Date(0));
    const recent = await countApplicationsSince(t.db, cutoff);
    const ids = [await apply(), await apply(), await apply()];
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
      await tx.execute(
        sql`update app.applications set submitted_at = now() - interval '3 days'
            where id = ${ids[0]}::uuid`,
      );
    });
    expect(await countApplicationsSince(t.db, new Date(0))).toBe(all + 3);
    expect(await countApplicationsSince(t.db, cutoff)).toBe(recent + 2);
  });
});
