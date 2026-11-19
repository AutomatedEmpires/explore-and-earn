// Shared rows for the messaging tests. Each test file owns its own database.
import { sql } from 'drizzle-orm';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HostContext } from '@/server/guards';
import type { VerificationStatus } from '@/modules/verification';
import { seedHostOrg as seedAnyHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp5';
import type { ThreadViewer } from './access';
import { ensureThread } from './threads';

export { seedMember, seedSeeker };

/** Every verification status the applicant gate refuses, so the host may not message applicants. */
export const GATED_STATUSES = [
  'unverified',
  'running',
  'needs_review',
  'needs_info',
  'failed',
] as const satisfies readonly VerificationStatus[];

/** The applicant list's refusal copy (hiring/pipeline/gate.ts), which messaging repeats. */
export const GATE_REFUSAL: Record<(typeof GATED_STATUSES)[number], string> = {
  unverified: 'Publish your first listing to verify your business, then you can see applicants.',
  running: "We're verifying your business. This usually takes a few hours.",
  needs_review: "We're verifying your business. This usually takes a few hours.",
  needs_info: 'Answer our verification question to see your applicants.',
  failed: "We couldn't verify your business. Ask for a review to see your applicants.",
};

export async function setVerification(
  db: Db,
  orgId: string,
  status: VerificationStatus,
): Promise<void> {
  await db.execute(
    sql`update app.organizations set verification_status = ${status} where id = ${orgId}`,
  );
}

/**
 * A host org that may message applicants. Only a verified host may (legal review 7.1), so the
 * org is verified; a test of the gate itself sets another status with `setVerification`.
 */
export async function seedHostOrg(
  db: Db,
  o?: Parameters<typeof seedAnyHostOrg>[1],
): ReturnType<typeof seedAnyHostOrg> {
  const org = await seedAnyHostOrg(db, o);
  await setVerification(db, org.orgId, 'verified');
  return org;
}

export type SeededThread = {
  orgId: string;
  orgName: string;
  listingId: string;
  seekerId: string;
  seeker: Awaited<ReturnType<typeof seedSeeker>>['user'];
  ownerId: string;
  owner: HostContext;
  threadId: string;
};

/** An org, its owner, a seeker and one thread between them. */
export async function seedThread(db: Db, listingId = newId()): Promise<SeededThread> {
  const org = await seedHostOrg(db);
  const seeker = await seedSeeker(db);
  const { threadId } = await withTx(db, (tx) =>
    ensureThread(tx, {
      orgId: org.orgId,
      listingId,
      seekerUserId: seeker.userId,
    }),
  );
  return {
    orgId: org.orgId,
    orgName: 'Kettle Ridge Lodge',
    listingId,
    seekerId: seeker.userId,
    seeker: seeker.user,
    ownerId: org.owner.userId,
    owner: org.owner.ctx,
    threadId,
  };
}

export function seekerViewer(userId: string): ThreadViewer {
  return { kind: 'seeker', userId };
}

export function hostViewer(
  userId: string,
  orgId: string,
  role: HostContext['role'],
): ThreadViewer {
  return {
    kind: 'host',
    ctx: {
      user: { id: userId, clerkUserId: userId, accountType: 'host', email: null },
      orgId,
      role,
    },
  };
}

/** An attachment row. `scanning` and another owner's id are how the send tests refuse one. */
export async function seedAttachment(
  db: Db,
  i: {
    ownerUserId: string;
    ownerOrgId?: string | null;
    status?: 'approved' | 'scanning';
    mime?: string;
  },
): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.media (
      id, owner_user_id, owner_org_id, kind, status, bucket, path, declared_mime, size_bytes
    )
    values (
      ${id}, ${i.ownerUserId}, ${i.ownerOrgId ?? null}, 'attachment', ${i.status ?? 'approved'},
      'media-private', ${id}, ${i.mime ?? 'application/pdf'}, 1000
    )
  `);
  return id;
}
