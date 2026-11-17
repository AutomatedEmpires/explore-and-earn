import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { auditEvents } from '@/modules/audit/schema';
import { pipelineEntries, pipelineEvents } from '@/modules/hiring/schema';
import { applicationsFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedEntry } from '@tests/helpers/sp5';

vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/hiring/interviews/close', () => ({
  closeOpenItems: vi.fn(async () => {}),
  onMemberRemoved: vi.fn(async () => {}),
}));
vi.mock('@/modules/hiring/as-described/open', () => ({
  openAsDescribed: vi.fn(async () => {}),
}));

import { openAsDescribed } from '@/modules/hiring/as-described/open';
import { mirrorStatus, transitionStatus } from '@/modules/hiring/core';
import { closeOpenItems } from '@/modules/hiring/interviews/close';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  vi.mocked(closeOpenItems).mockClear();
  vi.mocked(openAsDescribed).mockClear();
});

async function hostEntry(status: 'new' | 'withdrawn' = 'new') {
  const orgId = newId();
  const listingId = newId();
  const seekerUserId = newId();
  const applicationId = await seedEntry(t.db, { orgId, listingId, seekerUserId, status });
  const actor = { type: 'host' as const, userId: newId(), orgId };
  return { orgId, listingId, seekerUserId, applicationId, actor };
}

describe('transitionStatus', () => {
  it('moves the entry, writes the pipeline event and the audit row', async () => {
    const { orgId, applicationId, actor } = await hostEntry();
    const result = await withTx(t.db as Db, (tx) =>
      transitionStatus(tx, {
        applicationId,
        from: ['new'],
        to: 'shortlisted',
        actor,
        eventKind: 'shortlisted',
      }),
    );
    expect(result).toEqual({ ok: true, from: 'new' });

    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('shortlisted');
    const events = await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.applicationId, applicationId));
    expect(events.map((event) => event.kind)).toEqual(['shortlisted']);
    expect(events.map((event) => event.actorType)).toEqual(['host']);
    const audits = await t.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.subjectId, applicationId));
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      orgId,
      action: 'hiring.status_changed',
      data: { from: 'new', to: 'shortlisted' },
    });
  });

  it('keeps the current status and writes no event when SP4 refuses the move', async () => {
    const { applicationId, actor, orgId, seekerUserId, listingId } = await hostEntry();
    applicationsFake.seedApplication({ id: applicationId, orgId, seekerUserId, listingId, status: 'withdrawn' });
    const result = await withTx(t.db as Db, (tx) =>
      transitionStatus(tx, {
        applicationId,
        from: ['new'],
        to: 'shortlisted',
        actor,
        eventKind: 'shortlisted',
      }),
    );
    expect(result).toEqual({ ok: false, current: 'withdrawn' });
    const [entry] = await t.db.select().from(pipelineEntries).where(eq(pipelineEntries.applicationId, applicationId));
    expect(entry?.status).toBe('withdrawn');
    const events = await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.applicationId, applicationId));
    expect(events).toHaveLength(0);
  });

  it('records a hire and closes a pass', async () => {
    const hired = await hostEntry();
    const { threadId } = await messagingFake.ensureThread({} as never, {
      orgId: hired.orgId,
      listingId: hired.listingId,
      seekerUserId: hired.seekerUserId,
      applicationId: hired.applicationId,
    });
    await withTx(t.db as Db, (tx) =>
      transitionStatus(tx, {
        applicationId: hired.applicationId,
        from: ['new'],
        to: 'hired',
        actor: hired.actor,
        eventKind: 'hired',
        hiredSource: 'host',
      }),
    );
    const [entry] = await t.db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.applicationId, hired.applicationId));
    expect(entry?.hiredSource).toBe('host');
    expect(entry?.hiredAt).toBeInstanceOf(Date);
    expect(openAsDescribed).toHaveBeenCalledTimes(1);
    expect(messagingFake.calls).toContainEqual({ name: 'markThreadHired', args: [threadId] });
    expect(messagingFake.calls).toContainEqual({
      name: 'postEvent',
      args: [threadId, { code: 'hired', visibleTo: 'all' }],
    });

    const passed = await hostEntry();
    await withTx(t.db as Db, (tx) =>
      transitionStatus(tx, {
        applicationId: passed.applicationId,
        from: ['new'],
        to: 'not_selected',
        actor: passed.actor,
        eventKind: 'not_selected',
      }),
    );
    expect(closeOpenItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: 'not_selected' }),
    );
  });
});

describe('mirrorStatus', () => {
  it('writes the withdrawn mirror once', async () => {
    const { applicationId, seekerUserId } = await hostEntry();
    const input = {
      applicationId,
      to: 'withdrawn' as const,
      actor: { type: 'seeker' as const, userId: seekerUserId },
      eventKind: 'withdrawn' as const,
      at: new Date('2026-11-01T00:00:00.000Z'),
    };
    const first = await withTx(t.db as Db, (tx) => mirrorStatus(tx, input));
    const second = await withTx(t.db as Db, (tx) => mirrorStatus(tx, input));
    expect(first).toBe(true);
    expect(second).toBe(false);
    const events = await t.db.select().from(pipelineEvents).where(eq(pipelineEvents.applicationId, applicationId));
    expect(events).toHaveLength(1);
  });
});
