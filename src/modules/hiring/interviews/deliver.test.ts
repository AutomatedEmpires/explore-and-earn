// A scan-cleared interview invite from a host the applicant gate refuses (issue 234; review
// pass 3 on issue 198). The host was verified when it proposed, the scan held or was still
// reading the text, and the host was then moved to a refused status. Clearing the text must not
// deliver the invite: no card, no notice, and the invite stays held so it can go out once the
// host is verified again. Messaging holds a message the same way (`releaseMessage`).
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews, notifications } from '@/db/schema';
import { newId } from '@/lib/ids';
import type { VerificationStatus } from '@/modules/verification';
import { applicationsFake, safetyFake } from '@tests/fakes/sp5/sp4';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { mockDbModule, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedSeeker } from '@tests/helpers/sp5';
import { withTx, type Db } from '@/lib/db';
// After the test helpers: loading orgs loads @/lib/db, whose mock needs them.
import * as orgs from '@/modules/orgs';
import { releaseInterviewNote } from './notes';
import { proposeInterview } from './propose';
import { listSeekerInterviews } from './reads';

vi.mock('@/lib/db', async (orig) => mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/modules/applications', async (orig) => ({
  ...(await orig<typeof import('@/modules/applications')>()),
  ...(await import('@tests/fakes/sp5/sp4')).applicationsFake,
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp5/sp2')).listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));
vi.mock('@/modules/safety', async (orig) => ({
  ...(await orig<typeof import('@/modules/safety')>()),
  ...(await import('@tests/fakes/sp5/sp4')).safetyFake,
}));

const t = setupRouteDb();
const NOW = new Date('2026-11-03T17:00:00Z');
const HOUR = 60 * 60_000;
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;
const db = () => t.db as Db;

/** SP2 reports this verification status for this org (the fake reports `verified` otherwise). */
function verification(status: VerificationStatus, orgId: string): void {
  vi.spyOn(orgs, 'getOrgSummaries').mockImplementation(async (conn, ids) => {
    const out = await orgsFake.getOrgSummaries(conn, ids);
    const row = out.get(orgId);
    if (row) out.set(orgId, { ...row, verificationStatus: status });
    return out;
  });
}

/** An invite a verified host proposed, whose text the scan has not cleared yet. */
async function pendingInvite() {
  const org = await seedHostOrg(t.db);
  const seeker = await seedSeeker(t.db);
  const listingId = newId();
  listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
  orgsFake.setAccess(org.owner.userId, { all: true });
  const applicationId = await seedEntry(t.db, { orgId: org.orgId, listingId, seekerUserId: seeker.userId });
  const view = await proposeInterview(
    db(),
    org.owner.ctx,
    applicationId,
    {
      slots: [{ start: new Date(NOW.getTime() + 48 * HOUR).toISOString() }],
      durationMinutes: 30,
      format: 'phone',
      expiryHours: 72,
      note: 'bring boots',
    },
    NOW,
  );
  expect(view.noteState).toBe('pending');
  return { org, seeker, interviewId: view.id };
}

function clear(interviewId: string) {
  return withTx(db(), (tx) =>
    releaseInterviewNote(tx, interviewId, { state: 'clear', checkId: newId(), labels: [] }, NOW),
  );
}

async function scanStateOf(interviewId: string) {
  const [row] = await t.db.select().from(interviews).where(eq(interviews.id, interviewId));
  return row?.scanState;
}

async function invitedNotices(userId: string): Promise<number> {
  const rows = await t.db.select().from(notifications).where(eq(notifications.userId, userId));
  return rows.filter((row) => row.type === 'hiring.interview_invited').length;
}

function cards(): number {
  return messagingFake.calls.filter((c) => c.name === 'postCard').length;
}

beforeEach(() => {
  applicationsFake.reset();
  messagingFake.reset();
  listingsFake.reset();
  orgsFake.reset();
  safetyFake.reset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a scan-cleared interview invite', () => {
  it.each(REFUSED)('is not delivered while the host is %s, and stays held', async (status) => {
    const s = await pendingInvite();
    verification(status, s.org.orgId);

    await clear(s.interviewId);

    expect(cards()).toBe(0);
    expect(await invitedNotices(s.seeker.userId)).toBe(0);
    expect(await scanStateOf(s.interviewId)).toBe('held');
    const listed = await listSeekerInterviews(t.db, s.seeker.userId, { now: NOW });
    expect(listed.items.map((item) => item.id)).not.toContain(s.interviewId);
  });

  it('goes out on a later release, once the host is verified again', async () => {
    const s = await pendingInvite();
    verification('needs_review', s.org.orgId);
    await clear(s.interviewId);
    expect(cards()).toBe(0);

    vi.restoreAllMocks();
    await clear(s.interviewId);

    expect(cards()).toBe(1);
    expect(await invitedNotices(s.seeker.userId)).toBe(1);
    expect(await scanStateOf(s.interviewId)).toBe('clear');
  });

  it('is delivered at once for a verified host', async () => {
    const s = await pendingInvite();
    await clear(s.interviewId);
    expect(cards()).toBe(1);
    expect(await invitedNotices(s.seeker.userId)).toBe(1);
    expect(await scanStateOf(s.interviewId)).toBe('clear');
  });
});
