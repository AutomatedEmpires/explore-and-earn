// Saved replies and the org's Not selected message (SP5 W4).
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { queryRows } from '@/lib/db';
import { conflict, forbidden, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { NOT_SELECTED_DEFAULT, SAVED_REPLIES, type SavedReply } from '@/lib/messaging';
import { record } from '@/modules/audit';
import type { HostContext } from '@/server/guards';
import { requireHiringCapability } from './access';
import { savedReplies } from './schema';

function toReply(row: typeof savedReplies.$inferSelect): SavedReply {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertLength(title: string | undefined, body: string | undefined): void {
  if (title !== undefined && [...title].length > SAVED_REPLIES.titleMax) {
    throw conflict('Title is too long', { reason: 'limit_reached' });
  }
  if (body !== undefined && [...body].length > SAVED_REPLIES.bodyMax) {
    throw conflict('Body is too long', { reason: 'limit_reached' });
  }
}

async function auditChange(
  db: DbOrTx,
  ctx: HostContext,
  subjectId: string,
  action: 'messaging.saved_reply_changed' | 'messaging.not_selected_changed',
): Promise<void> {
  await record(db, {
    actorType: 'user',
    actorId: ctx.user.id,
    orgId: ctx.orgId,
    action,
    subjectType: action === 'messaging.not_selected_changed' ? 'not_selected' : 'saved_reply',
    subjectId,
    data: {},
  });
}

export async function listSavedReplies(db: DbOrTx, ctx: HostContext): Promise<SavedReply[]> {
  requireHiringCapability(ctx, 'messages.access');
  const rows = await db
    .select()
    .from(savedReplies)
    .where(and(eq(savedReplies.orgId, ctx.orgId), eq(savedReplies.kind, 'reply')))
    .orderBy(desc(savedReplies.updatedAt), desc(savedReplies.id));
  return rows.map(toReply);
}

export async function createSavedReply(
  db: DbOrTx,
  ctx: HostContext,
  i: { title: string; body: string },
): Promise<SavedReply> {
  requireHiringCapability(ctx, 'messages.access');
  assertLength(i.title, i.body);
  const [count] = await queryRows<{ n: number }>(
    db,
    sql`select count(*)::int as n from app.saved_replies where org_id = ${ctx.orgId} and kind = 'reply'`,
  );
  if ((count?.n ?? 0) >= SAVED_REPLIES.max) {
    throw conflict('Saved reply limit reached', { reason: 'limit_reached' });
  }
  const id = newId();
  const [row] = await db
    .insert(savedReplies)
    .values({
      id,
      orgId: ctx.orgId,
      kind: 'reply',
      title: i.title,
      body: i.body,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    })
    .returning();
  if (!row) throw notFound();
  await auditChange(db, ctx, id, 'messaging.saved_reply_changed');
  return toReply(row);
}

async function ownReply(db: DbOrTx, ctx: HostContext, id: string) {
  const [row] = await db
    .select()
    .from(savedReplies)
    .where(and(eq(savedReplies.id, id), eq(savedReplies.orgId, ctx.orgId), eq(savedReplies.kind, 'reply')));
  if (!row) throw notFound();
  return row;
}

export async function updateSavedReply(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  i: { title?: string; body?: string },
): Promise<SavedReply> {
  requireHiringCapability(ctx, 'messages.access');
  assertLength(i.title, i.body);
  await ownReply(db, ctx, id);
  const [row] = await db
    .update(savedReplies)
    .set({
      ...(i.title !== undefined ? { title: i.title } : {}),
      ...(i.body !== undefined ? { body: i.body } : {}),
      updatedBy: ctx.user.id,
    })
    .where(eq(savedReplies.id, id))
    .returning();
  if (!row) throw notFound();
  await auditChange(db, ctx, id, 'messaging.saved_reply_changed');
  return toReply(row);
}

export async function deleteSavedReply(db: DbOrTx, ctx: HostContext, id: string): Promise<void> {
  requireHiringCapability(ctx, 'messages.access');
  await ownReply(db, ctx, id);
  await db.delete(savedReplies).where(eq(savedReplies.id, id));
  await auditChange(db, ctx, id, 'messaging.saved_reply_changed');
}

export async function getNotSelectedMessage(
  db: DbOrTx,
  orgId: string,
): Promise<{ body: string; isDefault: boolean }> {
  const [row] = await db
    .select()
    .from(savedReplies)
    .where(and(eq(savedReplies.orgId, orgId), eq(savedReplies.kind, 'not_selected')));
  if (!row) return { body: NOT_SELECTED_DEFAULT, isDefault: true };
  return { body: row.body, isDefault: false };
}

export async function setNotSelectedMessage(
  db: DbOrTx,
  ctx: HostContext,
  body: string,
): Promise<{ body: string; isDefault: false }> {
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    throw forbidden('Your role cannot change this message', { reason: 'role_not_allowed' });
  }
  assertLength(undefined, body);
  const [existing] = await db
    .select()
    .from(savedReplies)
    .where(and(eq(savedReplies.orgId, ctx.orgId), eq(savedReplies.kind, 'not_selected')));
  if (existing) {
    await db
      .update(savedReplies)
      .set({ body, updatedBy: ctx.user.id })
      .where(eq(savedReplies.id, existing.id));
    await auditChange(db, ctx, existing.id, 'messaging.not_selected_changed');
    return { body, isDefault: false };
  }
  const id = newId();
  await db.insert(savedReplies).values({
    id,
    orgId: ctx.orgId,
    kind: 'not_selected',
    title: 'Not selected',
    body,
    createdBy: ctx.user.id,
    updatedBy: ctx.user.id,
  });
  await auditChange(db, ctx, id, 'messaging.not_selected_changed');
  return { body, isDefault: false };
}
