// Shared setup for the applications module's unit tests (SP4 plan Tasks 19-23): Maya, a seeker
// with a complete profile, and Kettle Ridge Lodge with an Owner, an Admin, a Recruiter and a
// Billing member, on the in-memory SP2 (tests/fakes/sp4/sp2.ts). Test-only: nothing in the app
// imports this file.
//
// Each test file declares the module mocks itself (vi.mock is hoisted per file):
//
//   vi.mock('@/modules/listings', async (orig) => ({
//     ...(await orig<typeof import('@/modules/listings')>()),
//     ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
//   }));
//   vi.mock('@/modules/orgs', async (orig) => ({
//     ...(await orig<typeof import('@/modules/orgs')>()),
//     ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
//   }));
//   vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
//   vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
//   vi.mock('@/modules/profiles', async () => (await import('./test-fixtures')).profilesMock());
//   vi.mock('@/modules/safety', async () => (await import('./test-fixtures')).safetyMock());
import { sql } from 'drizzle-orm';
import { vi, type Mock } from 'vitest';
import type { ApplicationStatus, SubmitInput } from '@/lib/applications';
import { queryRows, type Db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import type { OwnProfileDto, ProfileSnapshotV1 } from '@/lib/profiles';
import type { CurrentUser, OrgRole } from '@/modules/identity';
import type { ScreeningQuestion } from '@/modules/listings';
import type { Member } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { fakeHost, fakeListing, fakeLocation, fakeMembers } from '@tests/fakes/sp4/sp2';
import { mayaSnapshot } from '@tests/fixtures/sp4/snapshot';
import { seedMember, seedOrg, seedUser } from '@tests/helpers/sp4';

type Profiles = typeof import('@/modules/profiles');
type Safety = typeof import('@/modules/safety');

const mocks = {
  buildProfileSnapshot: vi.fn<Profiles['buildProfileSnapshot']>(),
  getOwnProfile: vi.fn<Profiles['getOwnProfile']>(),
  grantReveal: vi.fn<Profiles['grantReveal']>(),
  isBlockedBetween: vi.fn<Safety['isBlockedBetween']>(),
  listBlocks: vi.fn<Safety['listBlocks']>(),
};

/** Stands in for @/modules/profiles (W1 owns the real one). */
export const profilesMock = () => ({
  buildProfileSnapshot: mocks.buildProfileSnapshot,
  getOwnProfile: mocks.getOwnProfile,
  grantReveal: mocks.grantReveal,
});

/** Stands in for @/modules/safety (W5 owns the real one). */
export const safetyMock = () => ({
  isBlockedBetween: mocks.isBlockedBetween,
  listBlocks: mocks.listBlocks,
});

export const profiles: {
  buildProfileSnapshot: Mock<Profiles['buildProfileSnapshot']>;
  getOwnProfile: Mock<Profiles['getOwnProfile']>;
  grantReveal: Mock<Profiles['grantReveal']>;
} = mocks;
export const safety: {
  isBlockedBetween: Mock<Safety['isBlockedBetween']>;
  listBlocks: Mock<Safety['listBlocks']>;
} = mocks;

/** Maya's live profile as an application sees it: authorized to work, Classic resume. */
export function setProfile(
  o: Partial<ProfileSnapshotV1> = {},
  mode: 'classic' | 'compact' = 'classic',
): void {
  mocks.buildProfileSnapshot.mockResolvedValue(
    mayaSnapshot({ workAuthorization: { status: 'authorized' }, ...o }),
  );
  mocks.getOwnProfile.mockResolvedValue({ resume: { mode } } as OwnProfileDto);
}

/** Resets the profile and safety mocks to Maya, unblocked. Call in beforeEach. */
export function resetMocks(): void {
  for (const m of Object.values(mocks)) m.mockReset();
  setProfile();
  mocks.grantReveal.mockResolvedValue({ created: true });
  mocks.isBlockedBetween.mockResolvedValue({ blocked: false, byA: false, byB: false });
  mocks.listBlocks.mockResolvedValue([]);
}

export const QUESTIONS: ScreeningQuestion[] = [
  {
    id: 'boat_experience',
    prompt: 'Have you worked on a boat before?',
    required: true,
    type: 'yes_no',
  },
  { id: 'start_date', prompt: 'When could you start?', required: false, type: 'short_answer' },
];

export type World = {
  seeker: CurrentUser;
  orgId: string;
  owner: HostContext & { membershipId: string };
  admin: HostContext & { membershipId: string };
  recruiter: HostContext & { membershipId: string };
  billing: HostContext & { membershipId: string };
  locationId: string;
};

/** A seeker and an org with one member of each role, registered with the SP2 fake. */
export async function seedWorld(db: Db): Promise<World> {
  const seeker = await seedUser(db, { accountType: 'seeker' });
  const { orgId } = await seedOrg(db);
  const member = async (role: OrgRole) =>
    seedMember(db, orgId, await seedUser(db, { accountType: 'host' }), role);
  const owner = await member('owner');
  const admin = await member('admin');
  const recruiter = await member('recruiter');
  const billing = await member('billing');
  fakeHost(orgId, { name: 'Kettle Ridge Lodge' });
  fakeMembers(
    orgId,
    [owner, admin, recruiter, billing].map((m): Member => ({
      membershipId: m.membershipId,
      userId: m.user.id,
      displayName: 'Sam',
      email: m.user.email,
      role: m.role,
      scope: m.role === 'recruiter' ? { kind: 'all' } : null,
      joinedAt: new Date('2026-11-01T00:00:00Z'),
    })),
  );
  const locationId = fakeLocation({ orgId, city: 'Juneau', state: 'AK' });
  return { seeker, orgId, owner, admin, recruiter, billing, locationId };
}

/** An active "Deckhand" listing of the world's org with the two default questions. */
export function deckhand(
  w: World,
  o: Omit<Parameters<typeof fakeListing>[0], 'orgId'> = {},
): { listingId: string; revisionId: string } {
  return fakeListing({
    orgId: w.orgId,
    title: 'Deckhand',
    questions: QUESTIONS,
    locationId: w.locationId,
    notifyMemberIds: [w.admin.membershipId, w.recruiter.membershipId],
    ...o,
  });
}

/** A valid submit input for the listing: the required answer, source `seek`. */
export function input(
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

/** The AppError a promise rejects with. */
export async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error('expected a rejection');
}

export const reasonOf = (e: AppError): unknown =>
  (e.details as { reason?: unknown } | undefined)?.reason;

/** Sets a status directly, as SP5's moves would have (the guard allows status changes). */
export async function forceStatus(
  db: Db,
  applicationId: string,
  status: ApplicationStatus,
): Promise<void> {
  await db.execute(
    sql`update app.applications set status = ${status}, status_changed_at = now() where id = ${applicationId}::uuid`,
  );
}

export const statusOf = async (db: Db, applicationId: string): Promise<string | undefined> =>
  (
    await queryRows<{ status: string }>(
      db,
      sql`select status from app.applications where id = ${applicationId}::uuid`,
    )
  )[0]?.status;

/** Outbox topics enqueued for the application's events, sorted. */
export const outboxTopics = async (
  db: Db,
): Promise<{ topic: string; dedupeKey: string | null }[]> =>
  queryRows(
    db,
    sql`select topic, dedupe_key as "dedupeKey" from app.outbox order by topic, dedupe_key`,
  );

export const auditActions = async (
  db: Db,
  action: string,
): Promise<{ orgId: string | null; actorId: string | null }[]> =>
  queryRows(
    db,
    sql`select org_id::text as "orgId", actor_id::text as "actorId" from app.audit_events where action = ${action}`,
  );
