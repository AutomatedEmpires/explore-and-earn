// Submitting an application, in one transaction (SP4 spec 8.4; plan Task 20).
//
// Idempotent on (listing, seeker): an existing application comes back first, before any other
// check, so a retry, a double tap or a withdrawn application never creates a second row or a
// second notification. Concurrent submits race on the unique key; the losers return the
// winner's row with `created: false`.
import { and, eq, sql } from 'drizzle-orm';
import { withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import {
  APPLICATION_LIMITS,
  APPLICATION_SOURCES,
  LISTING_CHANGED_PROMPT,
  UNAVAILABLE,
  youBlocked,
  type ApplicationSource,
  type ReceiptDto,
  type SubmitInput,
} from '@/lib/applications';
import { badRequest, conflict, forbidden } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { emit } from '@/modules/jobs';
import { canAcceptApplications, getListingSummaries, getRevision } from '@/modules/listings';
import { notify } from '@/modules/notifications';
import { canAccessListing, listMembers, type Member } from '@/modules/orgs';
import { buildProfileSnapshot, getOwnProfile, grantReveal } from '@/modules/profiles';
import { isBlockedBetween } from '@/modules/safety';
import { buildReceipt } from './receipt';
import { applicationEvents, applications, type ApplicationRow } from './schema';
import {
  buildSnapshot,
  checkAnswers,
  loadListingFacts,
  missingFields,
  snapshotBytes,
} from './snapshot';

const TEAM_ROLES: readonly Member['role'][] = ['owner', 'admin', 'recruiter'];
const MANAGER_ROLES: readonly Member['role'][] = ['owner', 'admin'];

/**
 * The members to tell about an applicant (spec 8.4 step 10; SP2 section 6's listing team):
 * the listing's notify members who are Owner, Admin or Recruiter and can access the listing;
 * when none remain, the Owner and Admins who can. A Recruiter scoped to other listings never
 * gets the applicant's name or a link that would 404.
 */
export async function resolveListingTeam(
  tx: DbOrTx,
  i: { orgId: string; listingId: string; notifyMemberIds: readonly string[] },
): Promise<Member[]> {
  const members = await listMembers(tx, i.orgId);
  const locationId =
    (await getListingSummaries(tx, [i.listingId])).get(i.listingId)?.locationId ?? null;

  const withAccess = async (candidates: Member[]): Promise<Member[]> => {
    const out: Member[] = [];
    const seen = new Set<string>();
    for (const m of candidates) {
      if (seen.has(m.userId)) continue;
      const allowed = await canAccessListing(
        tx,
        {
          user: { id: m.userId, email: m.email, accountType: 'host', clerkUserId: '' },
          orgId: i.orgId,
          role: m.role,
        },
        { id: i.listingId, locationId },
      );
      if (allowed) {
        seen.add(m.userId);
        out.push(m);
      }
    }
    return out;
  };

  const listed = await withAccess(
    members.filter(
      (m) => i.notifyMemberIds.includes(m.membershipId) && TEAM_ROLES.includes(m.role),
    ),
  );
  if (listed.length > 0) return listed;
  return withAccess(members.filter((m) => MANAGER_ROLES.includes(m.role)));
}

function findExisting(
  tx: DbOrTx,
  listingId: string,
  seekerUserId: string,
): Promise<ApplicationRow | undefined> {
  return tx
    .select()
    .from(applications)
    .where(and(eq(applications.listingId, listingId), eq(applications.seekerUserId, seekerUserId)))
    .then((rows) => rows[0]);
}

function storedSource(source: string): ApplicationSource {
  return (APPLICATION_SOURCES as readonly string[]).includes(source)
    ? (source as ApplicationSource)
    : 'other';
}

async function submitInTx(
  tx: Tx,
  seekerUserId: string,
  input: SubmitInput,
): Promise<{ application: ReceiptDto; created: boolean }> {
  // Step 2: the existing application, whatever its status and whatever the listing's state.
  const existing = await findExisting(tx, input.listingId, seekerUserId);
  if (existing) return { application: await buildReceipt(tx, existing), created: false };

  // Step 3: closed, paused, past its deadline, or the host is inactive.
  const accepting = await canAcceptApplications(tx, input.listingId);
  if (!accepting.ok) {
    throw conflict('This listing is no longer taking applications.', {
      reason: 'listing_closed',
      cause: accepting.reason,
    });
  }
  // Step 4: the seeker reviewed an older revision.
  if (accepting.revisionId !== input.listingRevisionId) {
    throw conflict(LISTING_CHANGED_PROMPT, {
      reason: 'listing_changed',
      currentRevisionId: accepting.revisionId,
    });
  }

  const published = await getRevision(tx, accepting.revisionId);
  const { orgId, content } = published;
  const listing = await loadListingFacts(tx, published);

  // Step 5.
  const blocks = await isBlockedBetween(
    tx,
    { type: 'user', id: seekerUserId },
    { type: 'org', id: orgId },
  );
  if (blocks.byA) throw forbidden(youBlocked(listing.orgName), { reason: 'you_blocked' });
  if (blocks.byB) throw forbidden(UNAVAILABLE, { reason: 'unavailable' });

  // Step 6.
  const profile = await buildProfileSnapshot(tx, seekerUserId, { includeWorkAuthorization: true });
  const missing = missingFields(profile);
  if (missing.length > 0) {
    throw badRequest('Finish your profile before you apply.', {
      reason: 'missing_fields',
      fields: missing,
    });
  }

  // Step 7.
  const answers = checkAnswers(content.applying.questions, input.answers);
  if (!answers.ok) {
    throw badRequest('Check your answers.', {
      reason: 'invalid_answers',
      questionIds: answers.questionIds,
    });
  }

  // Step 8: read from the live profile; the snapshot keeps only the two host-visible answers.
  const sponsorshipMismatch =
    content.job.visaSponsorship === 'none' &&
    profile.workAuthorization?.status === 'needs_sponsorship';
  if (sponsorshipMismatch && !input.acknowledgeSponsorship) {
    throw conflict("This host doesn't sponsor visas.", { reason: 'sponsorship_ack_required' });
  }

  // Step 9 (FD-2): the resume is always a generated template, so there is no file to check.
  const { resume } = await getOwnProfile(tx, seekerUserId);
  const snapshot = buildSnapshot({
    listing,
    profile,
    answers: answers.answers,
    resumeMode: resume.mode,
    sponsorshipMismatchAcknowledged: sponsorshipMismatch,
  });
  if (snapshotBytes(snapshot) > APPLICATION_LIMITS.snapshotMaxBytes) {
    throw badRequest('Your profile is too long to send. Shorten it and try again.', {
      reason: 'snapshot_too_large',
    });
  }

  // Step 10.
  const source = storedSource(input.source);
  const inviteId = source === 'invite' ? (input.inviteId ?? null) : null;
  const [inserted] = await tx
    .insert(applications)
    .values({
      id: newId(),
      listingId: input.listingId,
      listingRevisionId: accepting.revisionId,
      orgId,
      seekerUserId,
      source,
      inviteId,
      snapshot: sql`${JSON.stringify(snapshot)}::jsonb`,
      sponsorshipMismatch,
    })
    .onConflictDoNothing({ target: [applications.listingId, applications.seekerUserId] })
    .returning();
  if (!inserted) {
    // A concurrent submit won the unique key and has committed.
    const winner = await findExisting(tx, input.listingId, seekerUserId);
    if (!winner) throw conflict('Try again.', { reason: 'submit_raced' });
    return { application: await buildReceipt(tx, winner), created: false };
  }

  const eventId = newId();
  await tx.insert(applicationEvents).values({
    id: eventId,
    applicationId: inserted.id,
    type: 'submitted',
    fromStatus: null,
    toStatus: 'new',
    actorType: 'seeker',
    actorUserId: seekerUserId,
  });
  await emit(
    tx,
    'application.submitted',
    {
      applicationId: inserted.id,
      listingId: inserted.listingId,
      orgId,
      seekerUserId,
      submittedAt: inserted.submittedAt.toISOString(),
      source,
      inviteId,
    },
    eventId,
  );
  await grantReveal(tx, { seekerUserId, orgId, reason: 'applied', sourceId: inserted.id });

  await notify(tx, seekerUserId, 'applications.submitted', {
    applicationId: inserted.id,
    listingId: inserted.listingId,
    listingTitle: listing.title,
    orgName: listing.orgName,
    url: `/profile/applications/${inserted.id}`,
  });
  const team = await resolveListingTeam(tx, {
    orgId,
    listingId: inserted.listingId,
    notifyMemberIds: content.applying.notifyMemberIds,
  });
  for (const member of team) {
    await notify(tx, member.userId, 'applications.new_applicant', {
      applicationId: inserted.id,
      listingId: inserted.listingId,
      listingTitle: listing.title,
      firstName: snapshot.profile.firstName,
      url: `/host/applicants?application=${inserted.id}`,
    });
  }

  // Ids and enum codes only: never profile text or answers.
  await record(tx, {
    actorType: 'user',
    actorId: seekerUserId,
    orgId,
    action: 'applications.submitted',
    subjectType: 'application',
    subjectId: inserted.id,
    data: { listingId: inserted.listingId, source, sponsorshipMismatch },
  });

  return { application: await buildReceipt(tx, inserted), created: true };
}

/**
 * An existing application for the listing comes back with `created: false`. The caller runs
 * `kickWorker()` after this resolves (the route does).
 */
export function submitApplication(
  db: Db,
  seekerUserId: string,
  input: SubmitInput,
): Promise<{ application: ReceiptDto; created: boolean }> {
  return withTx(db, (tx) => submitInTx(tx, seekerUserId, input));
}
