// Submitting an application (SP4 spec 8.4, plan Task 20): idempotency, every refusal, the
// frozen snapshot, who is notified, and the events and audit rows written with it.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationSnapshotV1Schema, type SubmitInput } from '@/lib/applications';
import { queryRows } from '@/lib/db';
import { notify } from '@/modules/notifications';
import {
  bumpRevision,
  editRevision,
  resetSp2,
  setListingAccess,
  setListingState,
} from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { withdraw } from './status';
import { submitApplication } from './submit';
import {
  auditActions,
  deckhand,
  input,
  outboxTopics,
  profiles,
  reasonOf,
  rejection,
  resetMocks,
  safety,
  seedWorld,
  setProfile,
  type World,
} from './test-fixtures';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
vi.mock('@/modules/profiles', async () => (await import('./test-fixtures')).profilesMock());
vi.mock('@/modules/safety', async () => (await import('./test-fixtures')).safetyMock());
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify: vi.fn(async () => {}),
}));
// SP5 appends the hiring topics; the test names them so the fan-out is visible.
vi.mock('@/server/event-subscribers', () => ({
  eventSubscribers: {
    'application.submitted': ['applications.listing_event', 'hiring.application_submitted'],
    'application.withdrawn': ['hiring.application_withdrawn'],
  },
}));

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
  vi.mocked(notify).mockClear();
  await t.db.execute(sql`delete from app.outbox`);
  w = await seedWorld(t.db);
});

const notified = (type: string): string[] =>
  vi
    .mocked(notify)
    .mock.calls.filter((c) => c[2] === type)
    .map((c) => c[1]);

type Row = {
  id: string;
  status: string;
  source: string;
  inviteId: string | null;
  mismatch: boolean;
  snapshot: Record<string, unknown>;
};

const rowsOf = (seekerId: string) =>
  queryRows<Row>(
    t.db,
    sql`select id::text, status, source, invite_id::text as "inviteId",
        sponsorship_mismatch as mismatch, snapshot
      from app.applications where seeker_user_id = ${seekerId}::uuid`,
  );

describe('submitApplication', () => {
  it('creates once, and returns the same application for a retry (E4)', async () => {
    const l = deckhand(w);
    const first = await submitApplication(t.db, w.seeker.id, input(l));
    expect(first.created).toBe(true);
    expect(first.application.seekerStatus).toBe('applied');
    expect(first.application.events.map((e) => e.type)).toEqual(['submitted']);

    const again = await submitApplication(t.db, w.seeker.id, input(l));
    expect(again).toMatchObject({
      created: false,
      application: { applicationId: first.application.applicationId },
    });
    expect(await rowsOf(w.seeker.id)).toHaveLength(1);

    // One receipt for the seeker and one alert per listed member, not two of each.
    expect(notified('applications.submitted')).toEqual([w.seeker.id]);
    expect(notified('applications.new_applicant').sort()).toEqual(
      [w.admin.user.id, w.recruiter.user.id].sort(),
    );

    const id = first.application.applicationId;
    const outbox = await outboxTopics(t.db);
    expect(outbox.map((o) => o.topic)).toEqual([
      'applications.listing_event',
      'hiring.application_submitted',
    ]);
    const [event] = await queryRows<{ id: string }>(
      t.db,
      sql`select id::text from app.application_events where application_id = ${id}::uuid`,
    );
    expect(outbox.map((o) => o.dedupeKey)).toEqual([
      `${event?.id}:applications.listing_event`,
      `${event?.id}:hiring.application_submitted`,
    ]);

    expect(profiles.grantReveal).toHaveBeenCalledTimes(1);
    expect(profiles.grantReveal.mock.calls[0]?.[1]).toEqual({
      seekerUserId: w.seeker.id,
      orgId: w.orgId,
      reason: 'applied',
      sourceId: id,
    });
    expect(await auditActions(t.db, 'applications.submitted')).toEqual([
      { orgId: w.orgId, actorId: w.seeker.id },
    ]);
  });

  it('freezes a snapshot that matches the contract', async () => {
    const l = deckhand(w, {
      additionalStep: { url: 'https://kettle.test/form', note: 'Fill it in' },
    });
    const { application } = await submitApplication(
      t.db,
      w.seeker.id,
      input(l, {
        answers: [
          { questionId: 'boat_experience', value: true },
          { questionId: 'start_date', value: '  Mid May ' },
        ],
      }),
    );
    const [row] = await rowsOf(w.seeker.id);
    expect(applicationSnapshotV1Schema.safeParse(row?.snapshot).success).toBe(true);
    expect(application.snapshot).toEqual(row?.snapshot);
    expect(application.snapshot.listing).toEqual({
      id: l.listingId,
      revisionId: l.revisionId,
      title: 'Deckhand',
      orgId: w.orgId,
      orgName: 'Kettle Ridge Lodge',
      orgLogoMediaId: null,
      locationLabel: 'Juneau, AK',
      startDate: '2026-12-01',
      endDate: '2027-04-15',
      visaSponsorship: 'none',
      additionalStep: { note: 'Fill it in', url: 'https://kettle.test/form' },
    });
    expect(application.snapshot.answers).toEqual([
      {
        questionId: 'boat_experience',
        prompt: 'Have you worked on a boat before?',
        type: 'yes_no',
        required: true,
        value: true,
      },
      {
        questionId: 'start_date',
        prompt: 'When could you start?',
        type: 'short_answer',
        required: false,
        value: 'Mid May',
      },
    ]);
    expect(application.snapshot.resume).toEqual({ mode: 'classic', template: 'classic@1' });
    expect(application.canTickAdditionalStep).toBe(true);
  });

  it('labels remote and seasonal listings, and freezes the Compact template', async () => {
    setProfile({}, 'compact');
    const l = deckhand(w);
    editRevision(l.listingId, (c) => {
      c.where = {
        mode: 'remote',
        scope: 'states',
        states: ['WA', 'OR'],
        hostLocationId: w.locationId,
      };
      c.when.dates = { mode: 'season', season: 'summer', year: 2027 };
    });
    const { application } = await submitApplication(t.db, w.seeker.id, input(l));
    expect(application.snapshot.listing).toMatchObject({
      locationLabel: 'Remote (WA, OR)',
      startDate: '2027-06-01',
      endDate: '2027-08-31',
    });
    expect(application.snapshot.resume).toEqual({ mode: 'compact', template: 'compact@1' });

    const other = deckhand(w);
    editRevision(other.listingId, (c) => {
      c.where = { mode: 'remote', scope: 'all_us', states: [], hostLocationId: w.locationId };
      c.when.dates = { mode: 'ongoing', start: '2027-01-10' };
    });
    const second = await submitApplication(t.db, w.seeker.id, input(other));
    expect(second.application.snapshot.listing).toMatchObject({
      locationLabel: 'Remote (US)',
      startDate: '2027-01-10',
      endDate: null,
    });
  });

  it('falls back to the Owner and Admins when no notify member resolves', async () => {
    const l = deckhand(w, { notifyMemberIds: ['019a4a3c-0000-7000-8000-0000000f0001'] });
    await submitApplication(t.db, w.seeker.id, input(l));
    expect(notified('applications.new_applicant').sort()).toEqual(
      [w.owner.user.id, w.admin.user.id].sort(),
    );
  });

  it('never notifies a Billing member, even when listed', async () => {
    const l = deckhand(w, { notifyMemberIds: [w.billing.membershipId] });
    await submitApplication(t.db, w.seeker.id, input(l));
    expect(notified('applications.new_applicant')).not.toContain(w.billing.user.id);
    expect(notified('applications.new_applicant').sort()).toEqual(
      [w.owner.user.id, w.admin.user.id].sort(),
    );
  });

  it('leaves out a Recruiter who cannot access the listing', async () => {
    setListingAccess((ctx) => ctx.role !== 'recruiter');
    const l = deckhand(w);
    await submitApplication(t.db, w.seeker.id, input(l));
    expect(notified('applications.new_applicant')).toEqual([w.admin.user.id]);

    // With that Recruiter the only listed member, the Owner and the Admin are told instead.
    vi.mocked(notify).mockClear();
    const solo = deckhand(w, { notifyMemberIds: [w.recruiter.membershipId] });
    await submitApplication(t.db, w.seeker.id, input(solo));
    expect(notified('applications.new_applicant').sort()).toEqual(
      [w.owner.user.id, w.admin.user.id].sort(),
    );
  });

  it('puts only ids, the title, the org and the first name in notifications', async () => {
    const l = deckhand(w);
    const { application } = await submitApplication(t.db, w.seeker.id, input(l));
    const id = application.applicationId;
    const calls = vi.mocked(notify).mock.calls;
    expect(calls.find((c) => c[2] === 'applications.submitted')?.[3]).toEqual({
      applicationId: id,
      listingId: l.listingId,
      listingTitle: 'Deckhand',
      orgName: 'Kettle Ridge Lodge',
      url: `/profile/applications/${id}`,
    });
    expect(calls.find((c) => c[2] === 'applications.new_applicant')?.[3]).toEqual({
      applicationId: id,
      listingId: l.listingId,
      listingTitle: 'Deckhand',
      firstName: 'Maya',
      url: `/host/applicants?application=${id}`,
    });
  });

  it('keeps profile text and answers out of the audit log', async () => {
    const l = deckhand(w);
    await submitApplication(
      t.db,
      w.seeker.id,
      input(l, {
        answers: [
          { questionId: 'boat_experience', value: true },
          { questionId: 'start_date', value: 'Mid May' },
        ],
      }),
    );
    const [audit] = await queryRows<{ data: string }>(
      t.db,
      sql`select data::text as data from app.audit_events where action = 'applications.submitted'`,
    );
    expect(audit?.data).not.toContain('Maya');
    expect(audit?.data).not.toContain('Mid May');
    expect(audit?.data).not.toContain('example.test');
  });

  it('refuses a stale revision with the current one, and writes nothing', async () => {
    const l = deckhand(w);
    const current = bumpRevision(l.listingId);
    const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(err.status).toBe(409);
    expect(err.details).toEqual({ reason: 'listing_changed', currentRevisionId: current });
    expect(await rowsOf(w.seeker.id)).toEqual([]);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(['closed', 'deadline_passed', 'org_inactive', 'removed'] as const)(
    'refuses a listing that is %s with 409 listing_closed',
    async (state) => {
      const l = deckhand(w);
      setListingState(l.listingId, state);
      const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
      expect(err.status).toBe(409);
      expect(reasonOf(err)).toBe('listing_closed');
      expect(await rowsOf(w.seeker.id)).toEqual([]);
    },
  );

  it('names why the listing is closed in details.cause', async () => {
    const l = deckhand(w);
    setListingState(l.listingId, 'deadline_passed');
    const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(err.details).toEqual({ reason: 'listing_closed', cause: 'deadline_passed' });
  });

  it('returns the existing application after the listing closes', async () => {
    const l = deckhand(w);
    const first = await submitApplication(t.db, w.seeker.id, input(l));
    setListingState(l.listingId, 'closed');
    const again = await submitApplication(t.db, w.seeker.id, input(l));
    expect(again.created).toBe(false);
    expect(again.application.applicationId).toBe(first.application.applicationId);
  });

  it('returns a withdrawn application instead of a second one (Review Focus 1)', async () => {
    const l = deckhand(w);
    const first = await submitApplication(t.db, w.seeker.id, input(l));
    await withdraw(t.db, {
      applicationId: first.application.applicationId,
      seekerUserId: w.seeker.id,
    });
    const again = await submitApplication(t.db, w.seeker.id, input(l));
    expect(again.created).toBe(false);
    expect(again.application.applicationId).toBe(first.application.applicationId);
    expect(again.application.seekerStatus).toBe('withdrawn');
    expect(await rowsOf(w.seeker.id)).toHaveLength(1);
  });

  it('refuses when either side blocked the other', async () => {
    const l = deckhand(w);
    safety.isBlockedBetween.mockResolvedValue({ blocked: true, byA: true, byB: false });
    const mine = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(mine.status).toBe(403);
    expect(reasonOf(mine)).toBe('you_blocked');
    expect(mine.message).toBe('You blocked Kettle Ridge Lodge. Unblock to apply.');

    safety.isBlockedBetween.mockResolvedValue({ blocked: true, byA: false, byB: true });
    const theirs = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(theirs.status).toBe(403);
    expect(reasonOf(theirs)).toBe('unavailable');
    // The seeker is never told it was a block.
    expect(theirs.message).toBe("You can't apply to this host's listings.");
    expect(safety.isBlockedBetween.mock.calls[0]?.slice(1)).toEqual([
      { type: 'user', id: w.seeker.id },
      { type: 'org', id: w.orgId },
    ]);
    expect(await rowsOf(w.seeker.id)).toEqual([]);
  });

  it('refuses an incomplete profile and names the fields', async () => {
    setProfile({ lastName: '', workAuthorization: null });
    const l = deckhand(w);
    const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(err.status).toBe(400);
    expect(err.details).toEqual({
      reason: 'missing_fields',
      fields: ['last_name', 'work_authorization'],
    });
  });

  it('needs a state in the US, and not elsewhere', async () => {
    const l = deckhand(w);
    setProfile({ region: null });
    const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(err.details).toEqual({ reason: 'missing_fields', fields: ['region'] });

    setProfile({ region: null, countryCode: 'CA', city: 'Whitehorse' });
    await expect(submitApplication(t.db, w.seeker.id, input(l))).resolves.toMatchObject({
      created: true,
    });
  });

  describe('answers', () => {
    const CHOICE = {
      id: 'shift',
      prompt: 'Which shifts can you work?',
      required: true,
      type: 'multiple_choice' as const,
      choices: ['Morning', 'Evening', 'Night'],
      allowMultiple: false,
    };

    const invalid = async (
      l: { listingId: string; revisionId: string },
      answers: SubmitInput['answers'],
    ) => {
      const err = await rejection(submitApplication(t.db, w.seeker.id, input(l, { answers })));
      expect(err.status).toBe(400);
      expect(reasonOf(err)).toBe('invalid_answers');
      return (err.details as { questionIds: string[] }).questionIds;
    };

    it('needs the required answer', async () => {
      const l = deckhand(w);
      expect(await invalid(l, [])).toEqual(['boat_experience']);
      expect(await invalid(l, [{ questionId: 'boat_experience', value: null }])).toEqual([
        'boat_experience',
      ]);
    });

    it('refuses an answer to a question the listing does not ask', async () => {
      const l = deckhand(w);
      expect(
        await invalid(l, [
          { questionId: 'boat_experience', value: true },
          { questionId: 'shoe_size', value: '10' },
        ]),
      ).toEqual(['shoe_size']);
    });

    it('refuses two answers to one question', async () => {
      const l = deckhand(w);
      expect(
        await invalid(l, [
          { questionId: 'boat_experience', value: true },
          { questionId: 'boat_experience', value: false },
        ]),
      ).toEqual(['boat_experience']);
    });

    it('needs a boolean for yes_no', async () => {
      const l = deckhand(w);
      expect(await invalid(l, [{ questionId: 'boat_experience', value: 'yes' }])).toEqual([
        'boat_experience',
      ]);
    });

    it('takes false as an answer to a required yes_no', async () => {
      const l = deckhand(w);
      const result = await submitApplication(
        t.db,
        w.seeker.id,
        input(l, { answers: [{ questionId: 'boat_experience', value: false }] }),
      );
      expect(result.application.snapshot.answers[0]?.value).toBe(false);
    });

    it('needs one of the choices for multiple_choice', async () => {
      const l = deckhand(w, { questions: [CHOICE] });
      expect(await invalid(l, [{ questionId: 'shift', value: 'Weekends' }])).toEqual(['shift']);
      expect(await invalid(l, [{ questionId: 'shift', value: ['Morning'] }])).toEqual(['shift']);
      await expect(
        submitApplication(
          t.db,
          w.seeker.id,
          input(l, { answers: [{ questionId: 'shift', value: 'Evening' }] }),
        ),
      ).resolves.toMatchObject({ created: true });
    });

    it('takes a subset of the choices with allowMultiple', async () => {
      const l = deckhand(w, { questions: [{ ...CHOICE, allowMultiple: true }] });
      expect(await invalid(l, [{ questionId: 'shift', value: ['Morning', 'Weekends'] }])).toEqual([
        'shift',
      ]);
      expect(await invalid(l, [{ questionId: 'shift', value: ['Morning', 'Morning'] }])).toEqual([
        'shift',
      ]);
      const result = await submitApplication(
        t.db,
        w.seeker.id,
        input(l, { answers: [{ questionId: 'shift', value: ['Morning', 'Night'] }] }),
      );
      expect(result.application.snapshot.answers[0]?.value).toEqual(['Morning', 'Night']);
    });

    it('refuses a short answer over 1000 characters', async () => {
      const l = deckhand(w);
      expect(
        await invalid(l, [
          { questionId: 'boat_experience', value: true },
          { questionId: 'start_date', value: 'x'.repeat(1001) },
        ]),
      ).toEqual(['start_date']);
    });

    it('stores an optional question left out as null', async () => {
      const l = deckhand(w);
      const { application } = await submitApplication(t.db, w.seeker.id, input(l));
      expect(application.snapshot.answers.map((a) => a.value)).toEqual([true, null]);
    });
  });

  describe('sponsorship', () => {
    beforeEach(() => {
      setProfile({ workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] } });
    });

    it('asks first when the host does not sponsor visas', async () => {
      const l = deckhand(w, { visaSponsorship: 'none' });
      const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
      expect(err.status).toBe(409);
      expect(reasonOf(err)).toBe('sponsorship_ack_required');
      expect(await rowsOf(w.seeker.id)).toEqual([]);
    });

    it('stores the mismatch once the seeker acknowledges it', async () => {
      const l = deckhand(w, { visaSponsorship: 'none' });
      const result = await submitApplication(
        t.db,
        w.seeker.id,
        input(l, { acknowledgeSponsorship: true }),
      );
      expect(result.created).toBe(true);
      expect(result.application.snapshot.sponsorshipMismatchAcknowledged).toBe(true);
      expect((await rowsOf(w.seeker.id))[0]?.mismatch).toBe(true);
    });

    it('asks nothing when the host sponsors', async () => {
      const l = deckhand(w, { visaSponsorship: 'h2b' });
      const result = await submitApplication(t.db, w.seeker.id, input(l));
      expect(result.created).toBe(true);
      expect((await rowsOf(w.seeker.id))[0]?.mismatch).toBe(false);
    });
  });

  // Legal review 2.2 item 4 and P0 item 12: hosts see two answers, never the visa itself.
  describe('work authorization in the frozen record', () => {
    it('keeps a visa type and end date out of the snapshot', async () => {
      setProfile({
        workAuthorization: { status: 'has_visa', visaType: 'j1', endsOn: '2027-09-30' },
      });
      const l = deckhand(w);
      const { application } = await submitApplication(t.db, w.seeker.id, input(l));
      expect(application.snapshot.profile.workAuthorization).toEqual({ status: 'authorized' });
      const stored = JSON.stringify((await rowsOf(w.seeker.id))[0]?.snapshot);
      expect(stored).not.toContain('j1');
      expect(stored).not.toContain('2027-09-30');
      expect(stored).not.toContain('has_visa');
    });

    it('keeps which visa a seeker needs out of the snapshot', async () => {
      setProfile({ workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2a', 'j1'] } });
      const l = deckhand(w, { visaSponsorship: 'h2a' });
      const { application } = await submitApplication(t.db, w.seeker.id, input(l));
      expect(application.snapshot.profile.workAuthorization).toEqual({
        status: 'needs_sponsorship',
        visaTypes: ['other'],
      });
      expect(
        applicationSnapshotV1Schema.safeParse((await rowsOf(w.seeker.id))[0]?.snapshot).success,
      ).toBe(true);
    });
  });

  describe('source', () => {
    it('stores a known source', async () => {
      const l = deckhand(w);
      await submitApplication(t.db, w.seeker.id, input(l, { source: 'swipe' }));
      expect((await rowsOf(w.seeker.id))[0]).toMatchObject({ source: 'swipe', inviteId: null });
    });

    it('stores the invite id with source invite', async () => {
      const l = deckhand(w);
      const inviteId = '019a4a3c-0000-7000-8000-0000000f0002';
      await submitApplication(t.db, w.seeker.id, input(l, { source: 'invite', inviteId }));
      expect((await rowsOf(w.seeker.id))[0]).toMatchObject({ source: 'invite', inviteId });
    });

    it('stores an unknown source as other', async () => {
      const l = deckhand(w);
      await submitApplication(t.db, w.seeker.id, input(l, { source: 'bogus' }));
      expect((await rowsOf(w.seeker.id))[0]?.source).toBe('other');
    });

    it('drops an invite id sent with another source', async () => {
      const l = deckhand(w);
      const inviteId = '019a4a3c-0000-7000-8000-0000000f0003';
      await submitApplication(t.db, w.seeker.id, input(l, { source: 'seek', inviteId }));
      expect((await rowsOf(w.seeker.id))[0]).toMatchObject({ source: 'seek', inviteId: null });
    });
  });

  it('refuses a snapshot too large to store with 400, not a database error', async () => {
    setProfile({ bio: 'x'.repeat(270_000) });
    const l = deckhand(w);
    const err = await rejection(submitApplication(t.db, w.seeker.id, input(l)));
    expect(err.status).toBe(400);
    expect(reasonOf(err)).toBe('snapshot_too_large');
  });

  it('rolls everything back when a step after the insert fails', async () => {
    profiles.grantReveal.mockRejectedValue(new Error('reveal store down'));
    const l = deckhand(w);
    await expect(submitApplication(t.db, w.seeker.id, input(l))).rejects.toThrow(
      'reveal store down',
    );
    expect(await rowsOf(w.seeker.id)).toEqual([]);
    expect(await outboxTopics(t.db)).toEqual([]);
  });
});
