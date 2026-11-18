// Shared rows for the messaging tests. Each test file owns its own database.
import { sql } from 'drizzle-orm';
import { withTx, type Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { HostContext } from '@/server/guards';
import { seedHostOrg, seedMember, seedSeeker } from '@tests/helpers/sp5';
import type { ThreadViewer } from './access';
import { ensureThread } from './threads';

export { seedHostOrg, seedMember, seedSeeker };

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
