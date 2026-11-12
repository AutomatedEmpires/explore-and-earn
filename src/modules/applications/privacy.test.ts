// The applications privacy handler and retention rule (SP4 spec 10, plan Task 23): export, the
// redacting erase, legal holds and the 12-month rule.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationSnapshotV1Schema } from '@/lib/applications';
import { queryRows, withTx } from '@/lib/db';
import type { HoldScope } from '@/modules/privacy';
import { resetSp2, setListingState } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedUser } from '@tests/helpers/sp4';
import { getHostApplication } from './host';
import { privacyHandler, redactDue, retentionRules } from './privacy';
import { getReceipt } from './reads';
import { withdraw } from './status';
import { submitApplication } from './submit';
import {
  deckhand,
  forceStatus,
  input,
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

const ANSWERS = [
  { questionId: 'boat_experience', value: true },
  { questionId: 'start_date', value: 'Mid May, after graduation' },
];

const apply = async (seekerId = w.seeker.id, l = deckhand(w)) =>
  (await submitApplication(t.db, seekerId, input(l, { answers: ANSWERS }))).application
    .applicationId;

const erase = (userId: string, holds: HoldScope[] = []) =>
  withTx(t.db, (tx) =>
    privacyHandler.erase(
      tx,
      { kind: 'user', userId },
      { requestId: 'req-1', now: new Date(), holds },
    ),
  );

const storedSnapshot = async (id: string): Promise<string> =>
  (
    await queryRows<{ s: string }>(
      t.db,
      sql`select snapshot::text as s from app.applications where id = ${id}::uuid`,
    )
  )[0]?.s ?? '';

/** Moves an application's last status change into the past (the guard allows this column). */
const ageStatus = (id: string, months: number) =>
  t.db.execute(
    sql`update app.applications
        set status_changed_at = now() - make_interval(months => ${months}::int) where id = ${id}::uuid`,
  );

describe('privacyHandler', () => {
  it('declares its tables and no media column (FD-2)', () => {
    expect(privacyHandler.module).toBe('applications');
    expect(privacyHandler.tables).toEqual(['applications', 'application_events']);
    expect(privacyHandler.mediaColumns).toEqual([]);
  });

  describe('exportData', () => {
    it("gives the seeker their snapshots and statuses, and nobody else's", async () => {
      const id = await apply();
      await forceStatus(t.db, id, 'shortlisted');
      const other = await seedUser(t.db, { accountType: 'seeker' });
      await apply(other.id);

      const part = await privacyHandler.exportData(t.db, { kind: 'user', userId: w.seeker.id });
      expect(part.files).toEqual([]);
      expect(part.records.applications).toHaveLength(1);
      expect(part.records.applications?.[0]).toMatchObject({
        applicationId: id,
        // The seeker's view: a shortlist stays internal.
        status: 'applied',
        source: 'seek',
        snapshot: { profile: { email: 'maya@example.test' } },
      });
      expect(part.records.application_events).toEqual([
        expect.objectContaining({ applicationId: id, type: 'submitted', status: 'applied' }),
      ]);
    });

    it('holds no applicant data for an org subject', async () => {
      await apply();
      const part = await privacyHandler.exportData(t.db, { kind: 'org', orgId: w.orgId });
      expect(JSON.stringify(part)).not.toContain('maya@example.test');
      expect(part.records.applications).toEqual([]);
    });

    it("exports the seeker's own withdraw note but not a host's note", async () => {
      const id = await apply();
      await t.db.execute(sql`
        insert into app.application_events
          (id, application_id, type, from_status, to_status, actor_type, note)
        values (gen_random_uuid(), ${id}, 'status_changed', 'new', 'interviewing', 'host',
          'Strong fit')`);
      await forceStatus(t.db, id, 'interviewing');
      await withdraw(t.db, { applicationId: id, seekerUserId: w.seeker.id, note: 'Dates moved' });
      const serialized = JSON.stringify(
        await privacyHandler.exportData(t.db, { kind: 'user', userId: w.seeker.id }),
      );
      expect(serialized).toContain('Dates moved');
      expect(serialized).not.toContain('Strong fit');
    });
  });

  describe('erase', () => {
    it('withdraws what is open and redacts every snapshot', async () => {
      const open = await apply();
      const hired = await apply();
      await forceStatus(t.db, hired, 'hired');
      await withdraw(t.db, {
        applicationId: await apply(),
        seekerUserId: w.seeker.id,
        note: 'Dates moved',
      });

      const result = await erase(w.seeker.id);
      expect(result.erased).toBe(3);
      expect(await statusOf(t.db, open)).toBe('withdrawn');
      expect(await statusOf(t.db, hired)).toBe('hired');

      const stored = await storedSnapshot(open);
      for (const gone of ['maya@example.test', 'Maya', 'Rodriguez', '+15415550123', 'Mid May']) {
        expect(stored).not.toContain(gone);
      }
      const snapshot = applicationSnapshotV1Schema.parse(JSON.parse(stored));
      expect(snapshot.profile).toMatchObject({
        firstName: 'Deleted user',
        lastName: '',
        email: '',
        phone: null,
        avatarMediaId: null,
        coverMediaId: null,
        workAuthorization: null,
        portfolioLinks: [],
      });
      expect(snapshot.answers).toEqual([]);
      // The listing the host posted is the host's record and stays.
      expect(snapshot.listing.title).toBe('Deckhand');

      const notes = await queryRows<{ note: string | null }>(
        t.db,
        sql`select e.note from app.application_events e
            join app.applications a on a.id = e.application_id
            where a.seeker_user_id = ${w.seeker.id}::uuid and e.note is not null`,
      );
      expect(notes).toEqual([]);
    });

    it('retains the record as shared for 12 months after its last status change', async () => {
      await apply();
      const result = await erase(w.seeker.id);
      expect(result.retained).toHaveLength(1);
      expect(result.retained[0]).toMatchObject({ table: 'applications', reason: 'shared_record' });
      const until = new Date(result.retained[0]?.until ?? '').getTime();
      const months = (until - Date.now()) / (30 * 86_400_000);
      expect(months).toBeGreaterThan(11.5);
      expect(months).toBeLessThan(12.5);
    });

    it('erases nothing the second time', async () => {
      await apply();
      expect((await erase(w.seeker.id)).erased).toBe(1);
      expect((await erase(w.seeker.id)).erased).toBe(0);
    });

    it("leaves other seekers' applications alone", async () => {
      const other = await seedUser(t.db, { accountType: 'seeker' });
      const theirs = await apply(other.id);
      await apply();
      await erase(w.seeker.id);
      expect(await storedSnapshot(theirs)).toContain('maya@example.test');
      expect(await statusOf(t.db, theirs)).toBe('new');
    });

    it('shows the host and the receipt a redacted record afterwards', async () => {
      const id = await apply();
      await erase(w.seeker.id);
      const dto = await getHostApplication(t.db, w.owner, id);
      expect(dto.snapshot.profile.firstName).toBe('Deleted user');
      expect(JSON.stringify(dto)).not.toContain('maya@example.test');
      expect((await getReceipt(t.db, w.seeker.id, id)).seekerStatus).toBe('withdrawn');
    });

    it('leaves the guard on once it returns', async () => {
      const id = await apply();
      await expect(
        withTx(t.db, async (tx) => {
          await privacyHandler.erase(
            tx,
            { kind: 'user', userId: w.seeker.id },
            { requestId: 'req-1', now: new Date(), holds: [] },
          );
          // A later step in SP8's transaction must not be able to edit a snapshot.
          await tx.execute(
            sql`update app.applications set snapshot = '{"v":1}'::jsonb where id = ${id}::uuid`,
          );
        }),
      ).rejects.toThrow();
      // And outside erase the snapshot is still fixed.
      await expect(
        t.db.execute(
          sql`update app.applications set snapshot = '{"v":1}'::jsonb where id = ${id}::uuid`,
        ),
      ).rejects.toThrow();
    });

    it.each([['applications'], ['all']] as [HoldScope][])(
      'touches nothing under a %s legal hold',
      async (hold) => {
        const id = await apply();
        const result = await erase(w.seeker.id, [hold]);
        expect(result).toEqual({
          erased: 0,
          retained: [{ table: 'applications', reason: 'legal_hold', until: null }],
        });
        expect(await statusOf(t.db, id)).toBe('new');
        expect(await storedSnapshot(id)).toContain('maya@example.test');
      },
    );

    it('erases as usual under a hold on something else', async () => {
      const id = await apply();
      expect((await erase(w.seeker.id, ['reports'])).erased).toBe(1);
      expect(await storedSnapshot(id)).not.toContain('maya@example.test');
    });

    it('erases nothing for an org subject and reports the retention', async () => {
      const id = await apply();
      const result = await withTx(t.db, (tx) =>
        privacyHandler.erase(
          tx,
          { kind: 'org', orgId: w.orgId },
          { requestId: 'req-1', now: new Date(), holds: [] },
        ),
      );
      expect(result.erased).toBe(0);
      expect(result.retained).toEqual([
        expect.objectContaining({ table: 'applications', reason: 'shared_record' }),
      ]);
      expect(await storedSnapshot(id)).toContain('maya@example.test');

      const held = await withTx(t.db, (tx) =>
        privacyHandler.erase(
          tx,
          { kind: 'org', orgId: w.orgId },
          { requestId: 'req-1', now: new Date(), holds: ['all'] },
        ),
      );
      expect(held).toEqual({
        erased: 0,
        retained: [{ table: 'applications', reason: 'legal_hold', until: null }],
      });
    });
  });
});

describe('retention rule applications.terminal_12m', () => {
  const rule = retentionRules.find((r) => r.key === 'applications.terminal_12m');

  it('is registered with a description', () => {
    expect(rule?.description).toMatch(/12 months/);
  });

  it('redacts a finished application from 13 months ago and leaves one from 11', async () => {
    const old = await apply();
    const recent = await apply();
    await forceStatus(t.db, old, 'not_selected');
    await forceStatus(t.db, recent, 'not_selected');
    await ageStatus(old, 13);
    await ageStatus(recent, 11);

    const result = await rule?.run(t.db, new Date(), 100);
    expect(result?.deleted).toBeGreaterThanOrEqual(1);
    expect(await storedSnapshot(old)).not.toContain('maya@example.test');
    expect(await storedSnapshot(recent)).toContain('maya@example.test');
    // Redacted, not deleted, and its status is untouched.
    expect(await statusOf(t.db, old)).toBe('not_selected');
    expect((await rule?.run(t.db, new Date(), 100))?.deleted).toBe(0);
  });

  it('redacts an old open application only once its listing has closed', async () => {
    const live = deckhand(w);
    const closed = deckhand(w);
    const onLive = await apply(w.seeker.id, live);
    const onClosed = await apply(w.seeker.id, closed);
    await ageStatus(onLive, 13);
    await ageStatus(onClosed, 13);
    setListingState(closed.listingId, 'closed');

    await rule?.run(t.db, new Date(), 100);
    expect(await storedSnapshot(onLive)).toContain('maya@example.test');
    expect(await storedSnapshot(onClosed)).not.toContain('maya@example.test');
  });

  it('reaches a due application behind more live ones than one scan holds', async () => {
    await rule?.run(t.db, new Date(), 1000);
    const live = deckhand(w);
    const closed = deckhand(w);
    // Three old applications to a listing that is still active, created first (lower ids)...
    const blockers: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const seeker = await seedUser(t.db, { accountType: 'seeker' });
      blockers.push(await apply(seeker.id, live));
    }
    // ...and one behind them whose listing has closed.
    const behind = await apply(w.seeker.id, closed);
    for (const id of [...blockers, behind]) await ageStatus(id, 13);
    setListingState(closed.listingId, 'closed');

    // A scan of 2 sees only live ones at first; it must page on, on every run.
    expect(await redactDue(t.db, new Date(), 10, 2)).toBe(1);
    expect(await storedSnapshot(behind)).not.toContain('maya@example.test');
    for (const id of blockers) expect(await storedSnapshot(id)).toContain('maya@example.test');
    expect(await redactDue(t.db, new Date(), 10, 2)).toBe(0);
  });

  it('redacts at most `limit` applications in one run', async () => {
    // Drain whatever earlier tests in this file left due.
    await rule?.run(t.db, new Date(), 1000);
    const ids = [await apply(), await apply(), await apply()];
    for (const id of ids) {
      await forceStatus(t.db, id, 'withdrawn');
      await ageStatus(id, 14);
    }
    expect((await rule?.run(t.db, new Date(), 2))?.deleted).toBe(2);
    expect((await rule?.run(t.db, new Date(), 2))?.deleted).toBe(1);
  });
});
