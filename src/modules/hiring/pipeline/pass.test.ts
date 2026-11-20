import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditEvents } from '@/db/schema';
import type { HostApplicationCard } from '@/lib/applications';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker } from '@/modules/jobs';
import { jobHandlers } from '../jobs';
import { pendingPasses, pipelineEntries } from '../schema';
import * as applications from '@/modules/applications';
import * as messaging from '@/modules/messaging';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { listingsFake } from '@tests/fakes/sp5/sp2';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { FIXED_NOW, seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
import { pass, undoPass } from './pass';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));

const NOT_SELECTED =
  "Hi Maya, thank you for applying for Lift Operator at Kettle Ridge Lodge. We've decided to move forward with other candidates for this role. We wish you the best with your search.";

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  applicationsFake.reset();
  listingsFake.reset();
  messagingFake.reset();
  vi.spyOn(applications, 'getHostCards').mockImplementation(async (_db, input) =>
    input.applicationIds.map((applicationId) => mayaCard(applicationId)),
  );
});

function mayaCard(applicationId: string): HostApplicationCard {
  return {
    applicationId,
    listingId: newId(),
    status: 'new',
    source: 'seek',
    submittedAt: FIXED_NOW.toISOString(),
    firstName: 'Maya',
    lastName: 'Chen',
    city: 'Anchorage',
    region: 'AK',
    avatarMediaId: null,
    coverMediaId: null,
    availabilityDate: null,
    skills: [],
    additionalStepCompletedAt: null,
  };
}

/** Sets the org's verification status; only a verified host may pass or undo (issue 234). */
async function setVerification(orgId: string, status: string): Promise<void> {
  await t.db.execute(sql`update app.organizations set verification_status = ${status} where id = ${orgId}`);
}

async function ready(status: 'new' | 'withdrawn' | 'offered' = 'new') {
  const org = await seedHostOrg(t.db);
  await setVerification(org.orgId, 'verified');
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Lift Operator' });
  const applicationId = await seedEntry(t.db, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    status,
  });
  const { threadId } = await messagingFake.ensureThread({} as never, {
    orgId: org.orgId,
    listingId,
    seekerUserId: seeker.userId,
    applicationId,
  });
  return { org, seeker, listingId, applicationId, threadId, ctx: org.owner.ctx };
}

function messages() {
  return messagingFake.calls.filter((call) => call.name === 'sendHostMessage');
}

async function runAt(at: Date) {
  await runWorker(t.db as Db, { handlers: jobHandlers, now: at });
}

describe('pass with undo', () => {
  it('undoes inside 10 seconds and the later worker sends nothing', async () => {
    const { applicationId, ctx } = await ready();
    const result = await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
    expect(result.undoUntil).toBe(new Date(FIXED_NOW.getTime() + 10_000).toISOString());

    const undone = await undoPass(t.db as Db, ctx, applicationId, new Date(FIXED_NOW.getTime() + 9_999));
    expect(undone).toEqual({ status: 'new' });
    const pending = await t.db.select().from(pendingPasses).where(eq(pendingPasses.applicationId, applicationId));
    expect(pending).toHaveLength(0);

    await runAt(new Date(FIXED_NOW.getTime() + 11_000));
    expect(messages()).toEqual([]);
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('new');
  });

  it('commits after the window, fills the default message, and does not repeat', async () => {
    const { applicationId, ctx, threadId } = await ready();
    await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
    await runAt(new Date(FIXED_NOW.getTime() + 5_000));
    expect(messages()).toEqual([]);
    const [early] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(early?.status).toBe('new');

    await runAt(new Date(FIXED_NOW.getTime() + 11_000));
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('not_selected');
    expect(applicationsFake.calls).toContainEqual({
      name: 'setStatus',
      args: [expect.objectContaining({ applicationId, to: 'not_selected' })],
    });
    expect(messages()).toEqual([
      { name: 'sendHostMessage', args: [{ threadId, senderUserId: ctx.user.id, body: NOT_SELECTED }] },
    ]);

    await runAt(new Date(FIXED_NOW.getTime() + 20_000));
    expect(messages()).toHaveLength(1);
  });

  it('refuses an undo at exactly 10 seconds and still commits', async () => {
    const { applicationId, ctx } = await ready();
    await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
    await expect(undoPass(t.db as Db, ctx, applicationId, new Date(FIXED_NOW.getTime() + 10_000))).rejects.toMatchObject({
      status: 409,
      details: { reason: 'undo_expired' },
    });
    await runAt(new Date(FIXED_NOW.getTime() + 11_000));
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('not_selected');
    expect(messages()).toHaveLength(1);
  });

  it('fills a custom Not selected template', async () => {
    const { applicationId, ctx, threadId } = await ready();
    vi.spyOn(messaging, 'getNotSelectedMessage').mockResolvedValue({
      body: 'Thanks {first_name}',
      isDefault: false,
    });
    await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
    await runAt(new Date(FIXED_NOW.getTime() + 11_000));
    expect(messages()).toEqual([
      { name: 'sendHostMessage', args: [{ threadId, senderUserId: ctx.user.id, body: 'Thanks Maya' }] },
    ]);
  });

  it('keeps a withdrawal that lands during the window and sends no message', async () => {
    const { applicationId, ctx, org, seeker, listingId } = await ready();
    await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
    applicationsFake.seedApplication({
      id: applicationId,
      orgId: org.orgId,
      seekerUserId: seeker.userId,
      listingId,
      status: 'withdrawn',
    });
    await runAt(new Date(FIXED_NOW.getTime() + 11_000));
    expect(messages()).toEqual([]);
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('withdrawn');
  });

  it('records the commit when the thread cannot take the message', async () => {
    const { applicationId, ctx, threadId } = await ready();
    messagingFake.setUndeliverable(threadId);
    await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
    await runAt(new Date(FIXED_NOW.getTime() + 11_000));
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('not_selected');
    const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, applicationId));
    expect(audits.map((row) => row.action)).toContain('hiring.pass_committed');
  });

  it.each(['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const)(
    'drops a pending pass when the host is %s at commit time (issue 234)',
    async (status) => {
      const { applicationId, ctx, org } = await ready();
      await pass(t.db as Db, ctx, applicationId, FIXED_NOW);
      await setVerification(org.orgId, status);
      applicationsFake.calls.length = 0;

      await runAt(new Date(FIXED_NOW.getTime() + 11_000));

      const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
      expect(entry?.status).toBe('new');
      expect(applicationsFake.calls.some((call) => call.name === 'setStatus')).toBe(false);
      expect(messages()).toEqual([]);
      expect(await t.db.select().from(pendingPasses).where(eq(pendingPasses.applicationId, applicationId))).toEqual([]);
      const audits = await t.db.select().from(auditEvents).where(eq(auditEvents.subjectId, applicationId));
      expect(audits.map((row) => row.action)).not.toContain('hiring.pass_committed');
      expect(audits.find((row) => row.action === 'hiring.pass_dropped')?.data).toEqual({
        reason: `verification_${status}`,
      });

      // The pass is gone, not parked: it does not commit once the host is verified again.
      await setVerification(org.orgId, 'verified');
      await runAt(new Date(FIXED_NOW.getTime() + 60_000));
      const [later] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
      expect(later?.status).toBe('new');
      expect(messages()).toEqual([]);
    },
  );

  it.each(['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const)(
    'refuses pass and undo while the host is %s (issue 234)',
    async (status) => {
      const fresh = await ready();
      const passed = await ready();
      await pass(t.db as Db, passed.ctx, passed.applicationId, FIXED_NOW);
      await setVerification(fresh.org.orgId, status);
      await setVerification(passed.org.orgId, status);
      const refused = { status: 409, code: 'conflict', details: { reason: `verification_${status}` } };

      await expect(pass(t.db as Db, fresh.ctx, fresh.applicationId, FIXED_NOW)).rejects.toMatchObject(refused);
      await expect(
        undoPass(t.db as Db, passed.ctx, passed.applicationId, new Date(FIXED_NOW.getTime() + 1_000)),
      ).rejects.toMatchObject(refused);
      expect(await t.db.select().from(pendingPasses).where(eq(pendingPasses.applicationId, fresh.applicationId))).toEqual([]);
      expect(
        await t.db.select().from(pendingPasses).where(eq(pendingPasses.applicationId, passed.applicationId)),
      ).toHaveLength(1);
    },
  );
});
