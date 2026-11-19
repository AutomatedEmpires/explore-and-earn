import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interviews } from '@/db/schema';
import { zonedLocalToUtc } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { listingsFake, orgsFake } from '@tests/fakes/sp5/sp2';
import { asHost, asUser, call, mockDbModule, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedEntry, seedHostOrg, seedInterview, seedSeeker } from '@tests/helpers/sp5';
import { GET } from '@/app/api/v1/interviews/[id]/ics/route';
import { buildIcs, interviewIcsAttachments, interviewUid, organizerEmail, type IcsEvent } from './ics';

vi.mock('@/lib/db', async (orig) => mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
vi.mock('@/lib/env', async (orig) => {
  const actual = await orig<typeof import('@/lib/env')>();
  return {
    ...actual,
    getEnv: () => ({
      ...actual.getEnv(),
      APP_URL: 'https://exploreandearn.com',
      EMAIL_FROM: 'Explore&Earn <hello@send.exploreandearn.com>',
    }),
  };
});
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...listingsFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...orgsFake,
}));

const t = setupRouteDb();
const golden = join(dirname(fileURLToPath(import.meta.url)), '__golden__', 'interview-request.ics');

const event: IcsEvent = {
  method: 'REQUEST',
  uid: 'interview-abc@exploreandearn.com',
  sequence: 2,
  start: new Date('2027-06-01T15:00:00Z'),
  end: new Date('2027-06-01T15:30:00Z'),
  stamp: new Date('2027-05-01T12:00:00Z'),
  summary: 'Interview: Deckhand at Kettle Ridge',
  location: 'Phone',
  description: 'https://exploreandearn.com/inbox/t',
  organizerEmail: 'hello@send.exploreandearn.com',
};

beforeEach(() => {
  listingsFake.reset();
  orgsFake.reset();
});

describe('buildIcs', () => {
  it('matches the golden file, with CRLF lines of at most 75 octets', () => {
    const raw = readFileSync(golden, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
    const built = buildIcs(event);
    expect(built).toBe(`${raw.replace(/\n/g, '\r\n')}\r\n`);
    expect(built.endsWith('\r\n')).toBe(true);
    const lines = built.split('\r\n').filter((line) => line.length > 0);
    for (const line of lines) {
      expect(line.includes('\n')).toBe(false);
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('escapes commas and semicolons', () => {
    const text = buildIcs({ ...event, summary: 'Interview: Deckhand, crew; night' });
    expect(text).toContain('SUMMARY:Interview: Deckhand\\, crew\\; night');
  });

  it('folds a long summary at 75 octets', () => {
    const text = buildIcs({ ...event, summary: 'Interview: ' + 'Deckhand '.repeat(12) });
    const lines = text.split('\r\n').filter((line) => line.length > 0);
    expect(lines.some((line) => line.startsWith(' '))).toBe(true);
    for (const line of lines) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  });

  it('stores Denver local times as UTC, including the spring-forward day', () => {
    const spring = buildIcs({
      ...event,
      start: new Date(zonedLocalToUtc('2027-03-14T10:00', 'America/Denver')),
      end: new Date(zonedLocalToUtc('2027-03-14T10:30', 'America/Denver')),
    });
    const before = buildIcs({
      ...event,
      start: new Date(zonedLocalToUtc('2027-03-13T10:00', 'America/Denver')),
      end: new Date(zonedLocalToUtc('2027-03-13T10:30', 'America/Denver')),
    });
    expect(spring).toContain('DTSTART:20270314T160000Z');
    expect(before).toContain('DTSTART:20270313T170000Z');
  });

  it('writes a cancel with the same uid and the given sequence', () => {
    const text = buildIcs({ ...event, method: 'CANCEL', sequence: 4 });
    expect(text).toContain('METHOD:CANCEL');
    expect(text).toContain('STATUS:CANCELLED');
    expect(text).toContain('UID:interview-abc@exploreandearn.com');
    expect(text).toContain('SEQUENCE:4');
  });

  it('reads the organizer address and the uid host from the environment', () => {
    expect(organizerEmail()).toBe('hello@send.exploreandearn.com');
    expect(interviewUid('abc').endsWith('@exploreandearn.com')).toBe(true);
    expect(buildIcs(event)).toContain('ORGANIZER:mailto:hello@send.exploreandearn.com');
  });
});

describe('interview calendar route', () => {
  it('returns a calendar file to the seeker and hides it from everyone else', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge' });
    const seeker = await seedSeeker(t.db);
    const other = await seedSeeker(t.db);
    const listingId = newId();
    listingsFake.setListing({ id: listingId, orgId: org.orgId, title: 'Deckhand', timezone: 'America/Denver' });
    orgsFake.setAccess(org.owner.userId, { all: true });
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
      status: 'interviewing',
    });
    const interviewId = await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'scheduled',
    });
    const start = new Date('2027-06-01T15:00:00Z');
    await t.db
      .update(interviews)
      .set({ scheduledStart: start, scheduledEnd: new Date(start.getTime() + 30 * 60_000), sequence: 1 })
      .where(eq(interviews.id, interviewId));

    asUser(seeker.user);
    const ok = await call(GET, request('GET', `/api/v1/interviews/${interviewId}/ics`), { id: interviewId });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/calendar');
    expect(ok.headers.get('content-disposition')).toContain('interview.ics');

    asUser(other.user);
    const stranger = await call(GET, request('GET', `/api/v1/interviews/${interviewId}/ics`), { id: interviewId });
    expect(stranger.status).toBe(404);

    const recruiter = org.owner.ctx;
    const outsider = { ...recruiter, role: 'recruiter' as const, user: { ...recruiter.user, id: newId() } };
    orgsFake.setAccess(outsider.user.id, { all: false, listingIds: [], locationIds: [] });
    asHost(outsider);
    const hidden = await call(GET, request('GET', `/api/v1/interviews/${interviewId}/ics`), { id: interviewId });
    expect(hidden.status).toBe(404);
  });

  it('omits an attachment whose sequence is stale', async () => {
    const org = await seedHostOrg(t.db);
    const seeker = await seedSeeker(t.db);
    const listingId = newId();
    const applicationId = await seedEntry(t.db, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
    });
    const interviewId = await seedInterview(t.db, {
      orgId: org.orgId,
      listingId,
      applicationId,
      threadId: newId(),
      organizerUserId: org.owner.userId,
      status: 'scheduled',
    });
    const start = new Date('2027-06-01T15:00:00Z');
    await t.db
      .update(interviews)
      .set({ scheduledStart: start, scheduledEnd: new Date(start.getTime() + 30 * 60_000), sequence: 2 })
      .where(eq(interviews.id, interviewId));
    const files = await interviewIcsAttachments(
      { interviewId, sequence: 1, icsMethod: 'REQUEST', audience: 'seeker' },
      t.db,
    );
    expect(files).toEqual([]);
  });
});
