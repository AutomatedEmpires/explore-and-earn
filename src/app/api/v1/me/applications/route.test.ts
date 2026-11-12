// The seeker's application routes over HTTP (SP4 spec 5, plan Tasks 20-22): apply, the apply
// context, My jobs, the receipt, withdraw and the Additional step tick. Each is seeker-only and
// scoped to the signed-in seeker.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as SUBMIT } from '@/app/api/v1/applications/route';
import { GET as CONTEXT } from '@/app/api/v1/apply/[listingId]/context/route';
import { track } from '@/lib/analytics';
import { forbidden, unauthorized } from '@/lib/errors';
import type { OwnProfileDto } from '@/lib/profiles';
import { setStatus, type SubmitInput } from '@/modules/applications';
import type { CurrentUser } from '@/modules/identity';
import { kickWorker } from '@/modules/jobs';
import { fakeHost, fakeListing, fakeLocation, fakeMembers, resetSp2 } from '@tests/fakes/sp4/sp2';
import { mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import {
  asSeeker,
  call,
  guardMocks,
  request,
  seedMember,
  seedOrg,
  seedUser,
  setupRouteDb,
} from '@tests/helpers/sp4';
import { PUT as TICK } from './[id]/additional-step/route';
import { GET as RECEIPT } from './[id]/route';
import { POST as WITHDRAW } from './[id]/withdraw/route';
import { GET as LIST } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
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
// W1 and W5 own the real profile and block reads; the routes are tested against stand-ins.
const mocks = vi.hoisted(() => ({
  buildProfileSnapshot: vi.fn(),
  getOwnProfile: vi.fn(),
  grantReveal: vi.fn(),
  isBlockedBetween: vi.fn(),
}));
vi.mock('@/modules/profiles', async (orig) => ({
  ...(await orig<typeof import('@/modules/profiles')>()),
  buildProfileSnapshot: mocks.buildProfileSnapshot,
  getOwnProfile: mocks.getOwnProfile,
  grantReveal: mocks.grantReveal,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  isBlockedBetween: mocks.isBlockedBetween,
}));
vi.mock('@/modules/notifications', async (orig) => ({
  ...(await orig<typeof import('@/modules/notifications')>()),
  notify: vi.fn(async () => {}),
}));
vi.mock('@/modules/jobs', async (orig) => ({
  ...(await orig<typeof import('@/modules/jobs')>()),
  kickWorker: vi.fn(),
}));
vi.mock('@/lib/analytics', async (orig) => ({
  ...(await orig<typeof import('@/lib/analytics')>()),
  track: vi.fn(),
}));

const t = setupRouteDb();
let w: { seeker: CurrentUser; orgId: string; ownerId: string };
let listing: { listingId: string; revisionId: string };

/** Maya, and Kettle Ridge Lodge with its Owner and one Deckhand listing that has a form step. */
beforeEach(async () => {
  resetSp2();
  vi.mocked(kickWorker).mockClear();
  vi.mocked(track).mockClear();
  mocks.buildProfileSnapshot.mockResolvedValue(
    mayaSnapshot({ workAuthorization: { status: 'authorized' } }),
  );
  mocks.getOwnProfile.mockResolvedValue({ resume: { mode: 'classic' } } as OwnProfileDto);
  mocks.grantReveal.mockResolvedValue({ created: true });
  mocks.isBlockedBetween.mockResolvedValue({ blocked: false, byA: false, byB: false });

  const seeker = await seedUser(t.db, { accountType: 'seeker' });
  const { orgId } = await seedOrg(t.db);
  const owner = await seedMember(
    t.db,
    orgId,
    await seedUser(t.db, { accountType: 'host' }),
    'owner',
  );
  fakeHost(orgId, { name: 'Kettle Ridge Lodge' });
  fakeMembers(orgId, [
    {
      membershipId: owner.membershipId,
      userId: owner.user.id,
      displayName: 'Sam',
      email: owner.user.email,
      role: 'owner',
      scope: null,
      joinedAt: new Date('2026-11-01T00:00:00Z'),
    },
  ]);
  w = { seeker, orgId, ownerId: owner.user.id };
  listing = fakeListing({
    orgId,
    title: 'Deckhand',
    locationId: fakeLocation({ orgId, city: 'Juneau', state: 'AK' }),
    questions: [
      {
        id: 'boat_experience',
        prompt: 'Have you worked on a boat before?',
        required: true,
        type: 'yes_no',
      },
      { id: 'start_date', prompt: 'When could you start?', required: false, type: 'short_answer' },
    ],
    additionalStep: { url: 'https://kettle.test/form', note: 'Fill it in' },
  });
  asSeeker(seeker);
});

function input(
  l: { listingId: string; revisionId: string },
  o: Partial<SubmitInput> = {},
): SubmitInput {
  return {
    listingId: l.listingId,
    listingRevisionId: l.revisionId,
    answers: [{ questionId: 'boat_experience', value: true }],
    source: 'seek',
    acknowledgeSponsorship: false,
    ...o,
  };
}

type Receipt = {
  applicationId: string;
  seekerStatus: string;
  additionalStepCompletedAt: string | null;
};
type Envelope = { error: { code: string; details?: { reason?: string } } };

const submit = (body: unknown = input(listing)) =>
  call(SUBMIT, request('POST', '/api/v1/applications', { body }));

async function applied(): Promise<string> {
  const res = await submit();
  return (res.body as { application: Receipt }).application.applicationId;
}

describe('POST /api/v1/applications', () => {
  it('answers 201 once, then 200 with the same application', async () => {
    const first = await submit();
    expect(first.status).toBe(201);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    expect(first.body).toMatchObject({ created: true, application: { seekerStatus: 'applied' } });
    expect(kickWorker).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
    expect(vi.mocked(track).mock.calls[0]?.slice(0, 2)).toEqual([
      'application_submitted',
      { listingId: listing.listingId, source: 'seek' },
    ]);

    const again = await submit();
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({
      created: false,
      application: {
        applicationId: (first.body as { application: Receipt }).application.applicationId,
      },
    });
    // A retry is not a second application: no second event.
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('tracks an unknown source as other, never the raw text', async () => {
    await submit(input(listing, { source: 'maya@example.test' }));
    expect(vi.mocked(track).mock.calls[0]?.[1]).toEqual({
      listingId: listing.listingId,
      source: 'other',
    });
  });

  it('rejects a malformed body with 400 before touching the database', async () => {
    const res = await submit({ listingId: 'nope', answers: 'no' });
    expect(res.status).toBe(400);
    const long = await submit(
      input(listing, { answers: [{ questionId: 'start_date', value: 'x'.repeat(1001) }] }),
    );
    expect(long.status).toBe(400);
  });

  it('carries the refusal reason in the error envelope', async () => {
    const res = await submit(input(listing, { listingRevisionId: w.orgId }));
    expect(res.status).toBe(409);
    expect((res.body as Envelope).error).toMatchObject({
      code: 'conflict',
      details: { reason: 'listing_changed', currentRevisionId: listing.revisionId },
    });
  });

  it('is for seekers only: a host account gets 403 and no application', async () => {
    guardMocks().requireSeeker.mockRejectedValueOnce(
      forbidden('Seekers only', { reason: 'wrong_account_type' }),
    );
    const res = await submit();
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('applicationId');
    expect(kickWorker).not.toHaveBeenCalled();
  });

  it('allows 30 submissions a day per seeker, then answers 429', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await submit()).status);
    expect(statuses[0]).toBe(201);
    expect(statuses.slice(1, 30).every((s) => s === 200)).toBe(true);
    expect(statuses[30]).toBe(429);

    // Another seeker has their own allowance.
    asSeeker(await seedUser(t.db, { accountType: 'seeker' }));
    expect((await submit()).status).toBe(201);
  });
});

describe('GET /api/v1/apply/{listingId}/context', () => {
  it('returns the context, with the existing application once applied', async () => {
    const before = await call(
      CONTEXT,
      request('GET', `/api/v1/apply/${listing.listingId}/context`),
      {
        listingId: listing.listingId,
      },
    );
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      listing: { title: 'Deckhand', status: 'active' },
      existingApplicationId: null,
      blocked: 'none',
    });
    const id = await applied();
    const after = await call(
      CONTEXT,
      request('GET', `/api/v1/apply/${listing.listingId}/context`),
      {
        listingId: listing.listingId,
      },
    );
    expect(after.body).toMatchObject({ existingApplicationId: id });
  });

  it('answers 404 for an unknown listing and 400 for a malformed id', async () => {
    const unknown = '019a4a3c-0000-7000-8000-0000000f0040';
    expect(
      (
        await call(CONTEXT, request('GET', `/api/v1/apply/${unknown}/context`), {
          listingId: unknown,
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(CONTEXT, request('GET', '/api/v1/apply/x/context'), { listingId: 'x' })).status,
    ).toBe(400);
  });
});

describe('GET /api/v1/me/applications', () => {
  it('lists a view with its cursor and the size of all three (E6)', async () => {
    const id = await applied();
    await setStatus(t.db, {
      applicationId: id,
      from: ['new'],
      to: 'interviewing',
      actor: { type: 'host', userId: w.ownerId, orgId: w.orgId },
    });

    const res = await call(
      LIST,
      request('GET', '/api/v1/me/applications', { query: { view: 'interviews' } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.body).toMatchObject({
      items: [{ applicationId: id, seekerStatus: 'interviewing', title: 'Deckhand' }],
      nextBefore: null,
      counts: { applied: 0, interviews: 1, offers: 0 },
    });

    const applied0 = await call(LIST, request('GET', '/api/v1/me/applications'));
    expect(applied0.body).toMatchObject({ items: [] });
  });

  it('rejects an unknown view and a bad cursor with 400', async () => {
    expect(
      (await call(LIST, request('GET', '/api/v1/me/applications', { query: { view: 'hired' } })))
        .status,
    ).toBe(400);
    expect(
      (await call(LIST, request('GET', '/api/v1/me/applications', { query: { before: 'zzz' } })))
        .status,
    ).toBe(400);
  });

  it('answers 401 when nobody is signed in', async () => {
    guardMocks().requireSeeker.mockRejectedValueOnce(unauthorized());
    expect((await call(LIST, request('GET', '/api/v1/me/applications'))).status).toBe(401);
  });
});

describe('the receipt, withdraw and the tick', () => {
  it("serves the owner's receipt and hides it from another seeker", async () => {
    const id = await applied();
    const mine = await call(RECEIPT, request('GET', `/api/v1/me/applications/${id}`), { id });
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({
      applicationId: id,
      seekerStatus: 'applied',
      canWithdraw: true,
    });

    asSeeker(await seedUser(t.db, { accountType: 'seeker' }));
    const theirs = await call(RECEIPT, request('GET', `/api/v1/me/applications/${id}`), { id });
    expect(theirs.status).toBe(404);
    expect(JSON.stringify(theirs.body)).not.toContain('Maya');
  });

  it('withdraws with a reason and returns the receipt; a retry returns it again', async () => {
    const id = await applied();
    vi.mocked(kickWorker).mockClear();
    const body = { reason: 'dates_changed' };
    const res = await call(
      WITHDRAW,
      request('POST', `/api/v1/me/applications/${id}/withdraw`, { body }),
      { id },
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      applicationId: id,
      seekerStatus: 'withdrawn',
      canWithdraw: false,
    });
    expect(kickWorker).toHaveBeenCalled();

    const retry = await call(
      WITHDRAW,
      request('POST', `/api/v1/me/applications/${id}/withdraw`, { body }),
      { id },
    );
    expect(retry.status).toBe(200);
    expect((retry.body as { events: unknown[] }).events).toHaveLength(2);
  });

  it("cannot withdraw or tick another seeker's application", async () => {
    const id = await applied();
    asSeeker(await seedUser(t.db, { accountType: 'seeker' }));
    const withdrawn = await call(
      WITHDRAW,
      request('POST', `/api/v1/me/applications/${id}/withdraw`, { body: {} }),
      { id },
    );
    expect(withdrawn.status).toBe(404);
    const ticked = await call(
      TICK,
      request('PUT', `/api/v1/me/applications/${id}/additional-step`, {
        body: { completed: true },
      }),
      { id },
    );
    expect(ticked.status).toBe(404);

    asSeeker(w.seeker);
    const mine = await call(RECEIPT, request('GET', `/api/v1/me/applications/${id}`), { id });
    expect(mine.body).toMatchObject({ seekerStatus: 'applied', additionalStepCompletedAt: null });
  });

  it('rejects an unknown withdraw reason and an over-long note with 400', async () => {
    const id = await applied();
    for (const body of [{ reason: 'bored' }, { note: 'x'.repeat(501) }]) {
      const res = await call(
        WITHDRAW,
        request('POST', `/api/v1/me/applications/${id}/withdraw`, { body }),
        { id },
      );
      expect(res.status).toBe(400);
    }
  });

  it('ticks and clears the Additional step, and refuses once withdrawn', async () => {
    const id = await applied();
    const tick = (completed: boolean) =>
      call(
        TICK,
        request('PUT', `/api/v1/me/applications/${id}/additional-step`, { body: { completed } }),
        { id },
      );
    expect(((await tick(true)).body as Receipt).additionalStepCompletedAt).not.toBeNull();
    expect(((await tick(false)).body as Receipt).additionalStepCompletedAt).toBeNull();

    await call(WITHDRAW, request('POST', `/api/v1/me/applications/${id}/withdraw`, { body: {} }), {
      id,
    });
    const closed = await tick(true);
    expect(closed.status).toBe(409);
    expect((closed.body as Envelope).error.details?.reason).toBe('terminal');
  });
});
