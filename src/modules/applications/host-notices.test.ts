// SP4's host notices to a host the applicant gate refuses (issue 229, the follow-up to 222). The
// rule (lead, 2026-11-19): a host that `hostApplicantGate` refuses (never verified, running,
// needs_review, needs_info or failed) still gets `applications.new_applicant` and
// `applications.withdrawn`, but never the seeker's first name: no `firstName` in the data, no
// name in the title or body, and the name is not read for it. The seeker's own notices are
// unchanged, and a verified host is still told the name.
//
// The real `canAcceptApplications` refuses a refused host before anything is written (legal
// review 7), so a new applicant reaches one only if its verification changes during the submit.
// The SP2 fake here does not read verification, which stands in for that change.
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notifications } from '@/db/schema';
import type { ApplicationSnapshotV1 } from '@/lib/applications';
import type { VerificationStatus } from '@/modules/verification';
import { resetSp2 } from '@tests/fakes/sp4/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';
// Registers the notification types the real notify() needs.
import './notification-types';
import { applications } from './schema';
import { withdraw, withdrawAllAsSystem, withdrawOpenForOrg } from './status';
import { submitApplication } from './submit';
import { deckhand, input, resetMocks, seedWorld, type World } from './test-fixtures';

/**
 * Counts reads of the seeker's first name. `probe` returns a copy of a snapshot whose
 * `profile.firstName` counts each read. Storing the snapshot does not count: the name is not
 * enumerable, so the size check skips it, and `toJSON` hands the insert the plain copy.
 */
const nameReads = vi.hoisted(() => {
  const state = { count: 0 };
  function probe<T extends { profile: { firstName: string } }>(snapshot: T): T {
    const plain = JSON.parse(JSON.stringify(snapshot)) as T;
    const profile = { ...snapshot.profile };
    const firstName = profile.firstName;
    Object.defineProperty(profile, 'firstName', {
      enumerable: false,
      get: () => {
        state.count += 1;
        return firstName;
      },
    });
    const out = { ...snapshot, profile };
    Object.defineProperty(out, 'toJSON', { enumerable: false, value: () => plain });
    return out;
  }
  return { state, probe };
});

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
vi.mock('@/server/event-subscribers', () => ({
  eventSubscribers: {
    'application.submitted': ['applications.listing_event', 'hiring.application_submitted'],
    'application.withdrawn': ['hiring.application_withdrawn'],
  },
}));
// The snapshot a submit builds carries the counting name.
vi.mock('./snapshot', async (orig) => {
  const real = await orig<typeof import('./snapshot')>();
  return {
    ...real,
    buildSnapshot: (i: Parameters<typeof real.buildSnapshot>[0]) =>
      nameReads.probe(real.buildSnapshot(i)),
  };
});

let t: TestDb;
let w: World;
const REFUSED = ['unverified', 'running', 'needs_review', 'needs_info', 'failed'] as const;

type Note = typeof notifications.$inferSelect;

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
  nameReads.state.count = 0;
});

async function setVerification(orgId: string, status: VerificationStatus): Promise<void> {
  await t.db.execute(
    sql`update app.organizations set verification_status = ${status} where id = ${orgId}`,
  );
}

async function notesOf(userId: string): Promise<Note[]> {
  return t.db.select().from(notifications).where(eq(notifications.userId, userId));
}

/** The one notice of this type to this user. */
async function only(userId: string, type: string): Promise<Note> {
  const rows = (await notesOf(userId)).filter((row) => row.type === type);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (!row) throw new Error(`expected one ${type}`);
  return row;
}

/** Nothing in the notice names the seeker: no `firstName` in the data, no name in the text. */
function expectNoName(note: Note): void {
  expect(note.data).not.toHaveProperty('firstName');
  expect(JSON.stringify({ title: note.title, body: note.body, data: note.data })).not.toMatch(
    /Maya|Rodriguez/,
  );
}

/** The listed team of the Deckhand listing: the Admin and the Recruiter. */
const team = () => [w.admin.user.id, w.recruiter.user.id];

/** Maya's own receipt, the same whatever the host's verification. */
async function expectSeekerReceipt(applicationId: string, listingId: string): Promise<void> {
  const note = await only(w.seeker.id, 'applications.submitted');
  expect(note.title).toBe('Your application to Kettle Ridge Lodge was sent');
  expect(note.body).toBe('We sent your application for Deckhand. You can follow it in My jobs.');
  expect(note.data).toEqual({
    applicationId,
    listingId,
    listingTitle: 'Deckhand',
    orgName: 'Kettle Ridge Lodge',
    url: `/profile/applications/${applicationId}`,
  });
}

/** Runs `fn` with each application row it loads carrying the counting name. */
async function probingLoadedRows<T>(fn: () => Promise<T>): Promise<T> {
  const column = applications.snapshot;
  const map = column.mapFromDriverValue.bind(column);
  const spy = vi
    .spyOn(column, 'mapFromDriverValue')
    .mockImplementation((value) => nameReads.probe(map(value) as ApplicationSnapshotV1));
  try {
    return await fn();
  } finally {
    spy.mockRestore();
  }
}

/** An application by Maya to the Deckhand listing, sent while the host was verified. */
async function applied(): Promise<{ applicationId: string; listingId: string }> {
  const l = deckhand(w);
  const { application } = await submitApplication(t.db, w.seeker.id, input(l));
  return { applicationId: application.applicationId, listingId: l.listingId };
}

describe('applications.new_applicant, to a refused host', () => {
  it.each(REFUSED)(
    'tells the listing team without the name while verification is %s',
    async (status) => {
      await setVerification(w.orgId, status);
      const l = deckhand(w);

      const { application } = await submitApplication(t.db, w.seeker.id, input(l));

      const id = application.applicationId;
      for (const userId of team()) {
        const note = await only(userId, 'applications.new_applicant');
        expect(note.title).toBe('New applicant for Deckhand');
        expect(note.body).toBe('Open Applicants to review.');
        expect(note.data).toEqual({
          applicationId: id,
          listingId: l.listingId,
          listingTitle: 'Deckhand',
          url: `/host/applicants?application=${id}`,
        });
        expectNoName(note);
      }
      expect(nameReads.state.count).toBe(0);
      await expectSeekerReceipt(id, l.listingId);
    },
  );

  it('tells a verified listing team the name', async () => {
    const l = deckhand(w);

    const { application } = await submitApplication(t.db, w.seeker.id, input(l));

    const id = application.applicationId;
    for (const userId of team()) {
      const note = await only(userId, 'applications.new_applicant');
      expect(note.title).toBe('New applicant for Deckhand');
      expect(note.body).toBe('Maya applied. Open Applicants to review.');
      expect(note.data).toEqual({
        applicationId: id,
        listingId: l.listingId,
        listingTitle: 'Deckhand',
        firstName: 'Maya',
        url: `/host/applicants?application=${id}`,
      });
    }
    expect(nameReads.state.count).toBeGreaterThan(0);
    await expectSeekerReceipt(id, l.listingId);
  });
});

describe('applications.withdrawn, to a refused host', () => {
  it.each(REFUSED)(
    'tells the listing team without the name while verification is %s',
    async (status) => {
      const { applicationId, listingId } = await applied();
      await setVerification(w.orgId, status);
      nameReads.state.count = 0;

      await probingLoadedRows(() => withdraw(t.db, { applicationId, seekerUserId: w.seeker.id }));

      for (const userId of team()) {
        const note = await only(userId, 'applications.withdrawn');
        expect(note.title).toBe('An applicant withdrew from Deckhand');
        expect(note.body).toBe('They withdrew their application.');
        expect(note.data).toEqual({
          applicationId,
          listingId,
          listingTitle: 'Deckhand',
          url: `/host/applicants?application=${applicationId}`,
        });
        expectNoName(note);
      }
      expect(nameReads.state.count).toBe(0);
      // Maya is sent nothing more than before: her receipt, and no withdrawal notice.
      expect((await notesOf(w.seeker.id)).map((n) => n.type)).toEqual(['applications.submitted']);
      await expectSeekerReceipt(applicationId, listingId);
    },
  );

  it('tells a verified listing team the name', async () => {
    const { applicationId, listingId } = await applied();
    nameReads.state.count = 0;

    await probingLoadedRows(() => withdraw(t.db, { applicationId, seekerUserId: w.seeker.id }));

    for (const userId of team()) {
      const note = await only(userId, 'applications.withdrawn');
      expect(note.title).toBe('An applicant withdrew from Deckhand');
      expect(note.body).toBe('Maya withdrew their application.');
      expect(note.data).toEqual({
        applicationId,
        listingId,
        listingTitle: 'Deckhand',
        firstName: 'Maya',
        url: `/host/applicants?application=${applicationId}`,
      });
    }
    expect(nameReads.state.count).toBeGreaterThan(0);
    expect((await notesOf(w.seeker.id)).map((n) => n.type)).toEqual(['applications.submitted']);
  });

  it.each(REFUSED)(
    'tells the listing team without the name when a block withdraws the application while verification is %s',
    async (status) => {
      const { applicationId } = await applied();
      await setVerification(w.orgId, status);
      nameReads.state.count = 0;

      await probingLoadedRows(() =>
        withdrawOpenForOrg(t.db, { seekerUserId: w.seeker.id, orgId: w.orgId }),
      );

      for (const userId of team()) {
        const note = await only(userId, 'applications.withdrawn');
        expect(note.data).toMatchObject({ applicationId, listingTitle: 'Deckhand' });
        expectNoName(note);
      }
      expect(nameReads.state.count).toBe(0);
    },
  );

  it('still names no one in a system withdrawal, even to a verified host', async () => {
    const { applicationId } = await applied();
    nameReads.state.count = 0;

    await probingLoadedRows(() => t.db.transaction((tx) => withdrawAllAsSystem(tx, w.seeker.id)));

    for (const userId of team()) {
      const note = await only(userId, 'applications.withdrawn');
      expect(note.data).toMatchObject({ applicationId, listingTitle: 'Deckhand' });
      expectNoName(note);
    }
    expect(nameReads.state.count).toBe(0);
  });
});
