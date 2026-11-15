// Status changes, withdraw and the Additional step tick (SP4 spec 8.5, plan Task 21).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { notify } from '@/modules/notifications';
import { resetSp2, setListingAccess, setListingState } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedOrg, seedUser } from '@tests/helpers/sp4';
import { setAdditionalStep, setStatus, withdraw, withdrawOpenForOrg } from './status';
import { submitApplication } from './submit';
import {
  auditActions,
  deckhand,
  forceStatus,
  input,
  outboxTopics,
  reasonOf,
  rejection,
  resetMocks,
  seedWorld,
  statusOf,
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
  w = await seedWorld(t.db);
});

/** A fresh application by the world's seeker, with the outbox and notify mock cleared. */
async function applied(o: Parameters<typeof deckhand>[1] = {}): Promise<string> {
  const { application } = await submitApplication(t.db, w.seeker.id, input(deckhand(w, o)));
  await t.db.execute(sql`delete from app.outbox`);
  vi.mocked(notify).mockClear();
  return application.applicationId;
}

const hostActor = () => ({ type: 'host' as const, userId: w.owner.user.id, orgId: w.orgId });
const seekerActor = () => ({ type: 'seeker' as const, userId: w.seeker.id });

const eventsOf = (id: string) =>
  queryRows<{ type: string; from: string | null; to: string; actor: string; note: string | null }>(
    t.db,
    sql`select type, from_status as "from", to_status as "to", actor_type as actor, note
      from app.application_events where application_id = ${id}::uuid order by created_at, id`,
  );

const withdrawnTo = (): string[] =>
  vi
    .mocked(notify)
    .mock.calls.filter((c) => c[2] === 'applications.withdrawn')
    .map((c) => c[1]);

describe('setStatus', () => {
  it('moves the application and records who moved it', async () => {
    const id = await applied();
    expect(
      await setStatus(t.db, {
        applicationId: id,
        from: ['new'],
        to: 'shortlisted',
        actor: hostActor(),
      }),
    ).toEqual({ ok: true });
    expect(await statusOf(t.db, id)).toBe('shortlisted');
    expect((await eventsOf(id)).at(-1)).toEqual({
      type: 'status_changed',
      from: 'new',
      to: 'shortlisted',
      actor: 'host',
      note: null,
    });
    expect(await auditActions(t.db, 'applications.status_changed')).toContainEqual({
      orgId: w.orgId,
      actorId: w.owner.user.id,
    });
  });

  it('changes nothing and reports the current status when it is not in `from`', async () => {
    const id = await applied();
    await forceStatus(t.db, id, 'shortlisted');
    const before = await eventsOf(id);
    expect(
      await setStatus(t.db, {
        applicationId: id,
        from: ['new'],
        to: 'interviewing',
        actor: hostActor(),
      }),
    ).toEqual({ ok: false, current: 'shortlisted' });
    expect(await statusOf(t.db, id)).toBe('shortlisted');
    expect(await eventsOf(id)).toEqual(before);
  });

  it('refuses a host of another org before saying anything about the application', async () => {
    const id = await applied();
    const other = await seedOrg(t.db, { name: 'Other Lodge' });
    const outsider = await seedUser(t.db, { accountType: 'host' });
    const err = await rejection(
      setStatus(t.db, {
        applicationId: id,
        // Not the current status: an outsider must get forbidden, not `{ ok: false, current }`.
        from: ['offered'],
        to: 'hired',
        actor: { type: 'host', userId: outsider.id, orgId: other.orgId },
      }),
    );
    expect(err.status).toBe(403);
    expect(await statusOf(t.db, id)).toBe('new');
  });

  it('refuses a seeker who does not own the application', async () => {
    const id = await applied();
    await forceStatus(t.db, id, 'offered');
    const stranger = await seedUser(t.db, { accountType: 'seeker' });
    const err = await rejection(
      setStatus(t.db, {
        applicationId: id,
        from: ['offered'],
        to: 'hired',
        actor: { type: 'seeker', userId: stranger.id },
      }),
    );
    expect(err.status).toBe(403);
    expect(await statusOf(t.db, id)).toBe('offered');
  });

  it('lets the seeker accept an offer', async () => {
    const id = await applied();
    await forceStatus(t.db, id, 'offered');
    expect(
      await setStatus(t.db, {
        applicationId: id,
        from: ['offered'],
        to: 'hired',
        actor: seekerActor(),
      }),
    ).toEqual({ ok: true });
    expect(await statusOf(t.db, id)).toBe('hired');
  });

  it('refuses a move the table does not give the actor', async () => {
    const id = await applied();
    const seeker = await rejection(
      setStatus(t.db, {
        applicationId: id,
        from: ['new'],
        to: 'shortlisted',
        actor: seekerActor(),
      }),
    );
    expect(seeker.status).toBe(403);
    const host = await rejection(
      setStatus(t.db, { applicationId: id, from: ['new'], to: 'withdrawn', actor: hostActor() }),
    );
    expect(host.status).toBe(403);
    expect(await statusOf(t.db, id)).toBe('new');
  });

  it('lets nobody move an application out of a terminal status', async () => {
    const id = await applied();
    await forceStatus(t.db, id, 'not_selected');
    const err = await rejection(
      setStatus(t.db, { applicationId: id, from: ['not_selected'], to: 'new', actor: hostActor() }),
    );
    expect(err.status).toBe(403);
  });

  it('is not found for an unknown application', async () => {
    const err = await rejection(
      setStatus(t.db, {
        applicationId: '019a4a3c-0000-7000-8000-0000000f0009',
        from: ['new'],
        to: 'shortlisted',
        actor: hostActor(),
      }),
    );
    expect(err.status).toBe(404);
  });

  it("rolls back with the caller's transaction", async () => {
    const id = await applied();
    await expect(
      t.db.transaction(async (tx) => {
        await setStatus(tx, {
          applicationId: id,
          from: ['new'],
          to: 'shortlisted',
          actor: hostActor(),
        });
        throw new Error('later step failed');
      }),
    ).rejects.toThrow('later step failed');
    expect(await statusOf(t.db, id)).toBe('new');
  });
});

describe('withdraw', () => {
  it('withdraws from interviewing and tells SP5 once', async () => {
    const id = await applied();
    await forceStatus(t.db, id, 'interviewing');
    await withdraw(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      reason: 'dates_changed',
      note: 'My dates moved',
    });
    expect(await statusOf(t.db, id)).toBe('withdrawn');
    const [row] = await queryRows<{ reason: string }>(
      t.db,
      sql`select withdrawn_reason as reason from app.applications where id = ${id}::uuid`,
    );
    expect(row?.reason).toBe('dates_changed');
    expect((await eventsOf(id)).at(-1)).toEqual({
      type: 'withdrawn',
      from: 'interviewing',
      to: 'withdrawn',
      actor: 'seeker',
      note: 'My dates moved',
    });
    expect((await outboxTopics(t.db)).map((o) => o.topic)).toEqual([
      'hiring.application_withdrawn',
    ]);
    expect(await auditActions(t.db, 'applications.withdrawn')).toContainEqual({
      orgId: w.orgId,
      actorId: w.seeker.id,
    });
  });

  it('keeps the note out of the audit log', async () => {
    const id = await applied();
    await withdraw(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      note: 'Found work in Sitka',
    });
    const rows = await queryRows<{ data: string }>(
      t.db,
      sql`select data::text as data from app.audit_events
          where action = 'applications.withdrawn' and subject_id = ${id}`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.data).not.toContain('Sitka');
  });

  it('changes nothing on a second withdraw (a retry)', async () => {
    const id = await applied();
    await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id });
    const before = await eventsOf(id);
    vi.mocked(notify).mockClear();
    await expect(
      withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id, reason: 'other' }),
    ).resolves.toBeUndefined();
    expect(await eventsOf(id)).toEqual(before);
    expect(notify).not.toHaveBeenCalled();
    expect((await outboxTopics(t.db)).map((o) => o.topic)).toEqual([
      'hiring.application_withdrawn',
    ]);
  });

  it.each(['hired', 'not_selected', 'offer_declined'] as const)(
    'is 409 not_withdrawable from %s',
    async (status) => {
      const id = await applied();
      await forceStatus(t.db, id, status);
      const err = await rejection(withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id }));
      expect(err.status).toBe(409);
      expect(reasonOf(err)).toBe('not_withdrawable');
      expect(await statusOf(t.db, id)).toBe(status);
    },
  );

  it("is not found for another seeker's application", async () => {
    const id = await applied();
    const stranger = await seedUser(t.db, { accountType: 'seeker' });
    const err = await rejection(withdraw(t.db, { applicationId: id, seekerUserId: stranger.id }));
    expect(err.status).toBe(404);
    expect(await statusOf(t.db, id)).toBe('new');
  });

  it('tells the listed members who can access the listing, and only them', async () => {
    const id = await applied();
    setListingAccess((ctx) => ctx.role !== 'recruiter');
    await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id });
    expect(withdrawnTo()).toEqual([w.admin.user.id]);
    const data = vi.mocked(notify).mock.calls.find((c) => c[2] === 'applications.withdrawn')?.[3];
    expect(data).toEqual({
      applicationId: id,
      listingId: expect.any(String) as string,
      listingTitle: 'Deckhand',
      firstName: 'Maya',
      url: `/host/applicants?application=${id}`,
    });
  });

  it('still withdraws after the listing is removed', async () => {
    const l = deckhand(w);
    const { application } = await submitApplication(t.db, w.seeker.id, input(l));
    setListingState(l.listingId, 'removed');
    await withdraw(t.db, { applicationId: application.applicationId, seekerUserId: w.seeker.id });
    expect(await statusOf(t.db, application.applicationId)).toBe('withdrawn');
  });
});

describe('withdrawOpenForOrg', () => {
  it('withdraws the open applications to the org and leaves the rest', async () => {
    const fresh = await applied();
    const interviewing = await applied();
    const hired = await applied();
    await forceStatus(t.db, interviewing, 'interviewing');
    await forceStatus(t.db, hired, 'hired');

    // The same seeker's application to another org is not touched.
    const other = await seedOrg(t.db, { name: 'Other Lodge' });
    const elsewhere = await submitApplication(
      t.db,
      w.seeker.id,
      input(deckhand({ ...w, orgId: other.orgId }, { notifyMemberIds: [] })),
    );

    expect(await withdrawOpenForOrg(t.db, { seekerUserId: w.seeker.id, orgId: w.orgId })).toBe(2);
    expect(await statusOf(t.db, fresh)).toBe('withdrawn');
    expect(await statusOf(t.db, interviewing)).toBe('withdrawn');
    expect(await statusOf(t.db, hired)).toBe('hired');
    expect(await statusOf(t.db, elsewhere.application.applicationId)).toBe('new');
    expect(await withdrawOpenForOrg(t.db, { seekerUserId: w.seeker.id, orgId: w.orgId })).toBe(0);
  });
});

describe('setAdditionalStep', () => {
  const STEP = { additionalStep: { url: 'https://kettle.test/form', note: 'Fill it in' } };

  it('ticks, then clears', async () => {
    const id = await applied(STEP);
    const ticked = await setAdditionalStep(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      completed: true,
    });
    expect(ticked.additionalStepCompletedAt).not.toBeNull();
    const cleared = await setAdditionalStep(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      completed: false,
    });
    expect(cleared.additionalStepCompletedAt).toBeNull();
    expect((await eventsOf(id)).filter((e) => e.type === 'additional_step_changed')).toHaveLength(
      2,
    );
    expect(await auditActions(t.db, 'applications.additional_step_set')).toHaveLength(2);
    // The tick is not a status event on the receipt.
    expect(cleared.events.map((e) => e.type)).toEqual(['submitted']);
  });

  it('writes nothing when the tick already has that value', async () => {
    const id = await applied(STEP);
    const first = await setAdditionalStep(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      completed: true,
    });
    const again = await setAdditionalStep(t.db, {
      applicationId: id,
      seekerUserId: w.seeker.id,
      completed: true,
    });
    expect(again.additionalStepCompletedAt).toBe(first.additionalStepCompletedAt);
    expect((await eventsOf(id)).filter((e) => e.type === 'additional_step_changed')).toHaveLength(
      1,
    );
  });

  it('is 409 terminal once the application is withdrawn', async () => {
    const id = await applied(STEP);
    await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id });
    const err = await rejection(
      setAdditionalStep(t.db, { applicationId: id, seekerUserId: w.seeker.id, completed: true }),
    );
    expect(err.status).toBe(409);
    expect(reasonOf(err)).toBe('terminal');
  });

  it('is 409 when the listing has no Additional step', async () => {
    const id = await applied();
    const err = await rejection(
      setAdditionalStep(t.db, { applicationId: id, seekerUserId: w.seeker.id, completed: true }),
    );
    expect(err.status).toBe(409);
    expect(reasonOf(err)).toBe('no_additional_step');
  });

  it("is not found for another seeker's application", async () => {
    const id = await applied(STEP);
    const stranger = await seedUser(t.db, { accountType: 'seeker' });
    const err = await rejection(
      setAdditionalStep(t.db, { applicationId: id, seekerUserId: stranger.id, completed: true }),
    );
    expect(err.status).toBe(404);
  });
});
