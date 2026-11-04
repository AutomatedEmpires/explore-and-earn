// The host page editor (SP2 spec sections 5 and 8.5). Saving a change that adds text holds it in
// `pending_content` while `text_safety` checks the new text (./check.ts); the live page stays
// up meanwhile. A change that adds no text (media, order, removals, team consent) applies at
// once. Images are checked by the Foundation media scan, not here.
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { emit, enqueue } from '@/modules/jobs';
import { getMediaInfo, type MediaKind } from '@/modules/media';
import { requireCapability } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { HostPageContentSchema, type HostPageContent } from './content';
import { hostPages } from './schema';

export const CHECK_TOPIC = 'hostpages.check_content';

/** `live`: nothing waits. `checking`: a change waits on its text check. `in_review`: on an operator. */
export type HostPageStatus = 'live' | 'checking' | 'in_review';

export type HostPageRow = typeof hostPages.$inferSelect;

export type HostPageForEditor = {
  content: HostPageContent;
  pending: HostPageContent | null;
  status: HostPageStatus;
};

/** What a page holds before its first save. */
export function emptyHostPage(): HostPageContent {
  return {
    logoMediaId: null,
    coverMediaId: null,
    about: { story: '', perks: [], social: [] },
    photos: [],
    team: [],
    teamConsent: false,
    faq: [],
  };
}

/** Runs `fn` in a transaction: a new one on a Db, or a savepoint inside the caller's. */
export function transact<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (db as Db).transaction(fn);
}

/** A jsonb parameter (written as text and cast, the same way on postgres.js and PGlite). */
export const jsonb = (value: unknown) => sql`${JSON.stringify(value)}::jsonb`;

/** Stored content, read back. Stored content always passed the schema when it was saved. */
export function readContent(value: unknown): HostPageContent {
  const parsed = HostPageContentSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  logger.warn('stored host page content does not parse; showing an empty page', {
    issues: parsed.error.issues,
  });
  return emptyHostPage();
}

/** JSON with object keys sorted at every depth (jsonb doesn't keep key order). */
export function canonicalJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (typeof v === 'object' && v !== null) {
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

/** Every piece of text on a page that people read: the story, perks, links, captions, team, FAQ. */
export function textParts(c: HostPageContent): string[] {
  return [
    c.about.story,
    ...c.about.perks,
    ...c.about.social.map((s) => s.url),
    ...c.photos.flatMap((p) => (p.caption === null ? [] : [p.caption])),
    ...c.team.flatMap((m) => [m.name, m.title, ...(m.bio === null ? [] : [m.bio])]),
    ...c.faq.flatMap((f) => [f.q, f.a]),
  ]
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/** The text in `next` that `live` doesn't already show: what the check has to read. */
export function addedText(live: HostPageContent, next: HostPageContent): string[] {
  const shown = new Set(textParts(live));
  return [...new Set(textParts(next).filter((s) => !shown.has(s)))];
}

export function statusOf(row: Pick<HostPageRow, 'pendingContent' | 'pendingCheckId'> | null) {
  if (!row || row.pendingContent === null) return 'live' as const;
  return row.pendingCheckId === null ? ('checking' as const) : ('in_review' as const);
}

/** The org's page row, or null. `lock` takes a row lock for the caller's transaction. */
export async function loadPage(
  db: DbOrTx,
  orgId: string,
  o: { lock?: boolean } = {},
): Promise<HostPageRow | null> {
  const q = db.select().from(hostPages).where(eq(hostPages.orgId, orgId));
  const [row] = await (o.lock ? q.for('update') : q);
  return row ?? null;
}

/** Creates the org's row (empty, not public) if it has none. */
export async function ensurePage(db: DbOrTx, orgId: string): Promise<void> {
  await db
    .insert(hostPages)
    .values({ orgId, content: jsonb(emptyHostPage()) })
    .onConflictDoNothing({ target: hostPages.orgId });
}

/** Records `hostpages.updated` and emits `hostpage.updated`, in the caller's transaction. */
async function announceUpdate(
  tx: DbOrTx,
  orgId: string,
  byUserId: string | null,
  source: 'direct' | 'check' | 'review',
): Promise<void> {
  await emit(tx, 'hostpage.updated', { orgId }, newId());
  await record(tx, {
    actorType: byUserId ? 'user' : 'system',
    actorId: byUserId,
    orgId,
    action: 'hostpages.updated',
    subjectType: 'host_page',
    subjectId: orgId,
    data: { source },
  });
}

/** Makes the held change live. `row` is the org's row, locked by the caller. */
export async function applyPending(
  tx: DbOrTx,
  row: HostPageRow,
  source: 'check' | 'review',
): Promise<void> {
  if (row.pendingContent === null) return;
  await tx
    .update(hostPages)
    .set({ content: jsonb(row.pendingContent), pendingContent: null, pendingCheckId: null })
    .where(eq(hostPages.orgId, row.orgId));
  await announceUpdate(tx, row.orgId, row.updatedBy, source);
}

/** Drops the held change; the live page is untouched. */
export async function discardPending(tx: DbOrTx, orgId: string): Promise<void> {
  await tx
    .update(hostPages)
    .set({ pendingContent: null, pendingCheckId: null })
    .where(eq(hostPages.orgId, orgId));
}

/** The media a page may use: the org's own, of the kind its slot shows. */
async function assertMedia(db: DbOrTx, orgId: string, c: HostPageContent): Promise<void> {
  const wanted: { id: string; kind: MediaKind; field: string }[] = [];
  if (c.logoMediaId) wanted.push({ id: c.logoMediaId, kind: 'logo', field: 'logoMediaId' });
  if (c.coverMediaId) wanted.push({ id: c.coverMediaId, kind: 'cover', field: 'coverMediaId' });
  c.photos.forEach((p, i) =>
    wanted.push({ id: p.mediaId, kind: 'listing_photo', field: `photos.${i}.mediaId` }),
  );
  c.team.forEach((m, i) => {
    if (m.mediaId) wanted.push({ id: m.mediaId, kind: 'avatar', field: `team.${i}.mediaId` });
  });
  if (wanted.length === 0) return;

  const info = await getMediaInfo(
    db,
    wanted.map((w) => w.id),
  );
  for (const w of wanted) {
    const m = info.get(w.id);
    if (!m || m.ownerOrgId !== orgId) {
      throw badRequest("That photo isn't one of your organization's uploads", {
        field: w.field,
      });
    }
    if (m.kind !== w.kind) {
      throw badRequest('That photo was uploaded for a different spot on your page', {
        field: w.field,
        expected: w.kind,
      });
    }
  }
}

/** The page as its editor shows it: the live content, a held change and where that stands. */
export async function getHostPageForEditor(
  db: DbOrTx,
  ctx: HostContext,
): Promise<HostPageForEditor> {
  requireCapability(ctx, 'hostpage.edit');
  const row = await loadPage(db, ctx.orgId);
  return {
    content: row ? readContent(row.content) : emptyHostPage(),
    pending: row?.pendingContent ? readContent(row.pendingContent) : null,
    status: statusOf(row),
  };
}

/**
 * Saves the whole page (Owner or Admin). A change without new text applies at once (`live`).
 * Otherwise it waits in `pending_content`, replacing any earlier held change, and
 * `hostpages.check_content` reads the new text (`checking`). Saving the held change again
 * changes nothing. Call `kickWorker()` after it returns.
 */
export async function saveHostPage(
  db: DbOrTx,
  ctx: HostContext,
  content: HostPageContent,
): Promise<{ status: HostPageStatus }> {
  requireCapability(ctx, 'hostpage.edit');
  const parsed = HostPageContentSchema.safeParse(content);
  if (!parsed.success) throw badRequest('Check your host page and try again', parsed.error.issues);
  const next = parsed.data;
  await assertMedia(db, ctx.orgId, next);

  return transact(db, async (tx) => {
    await ensurePage(tx, ctx.orgId);
    const row = await loadPage(tx, ctx.orgId, { lock: true });
    if (!row) throw new Error(`host page row missing for ${ctx.orgId}`);

    if (addedText(readContent(row.content), next).length === 0) {
      await tx
        .update(hostPages)
        .set({
          content: jsonb(next),
          pendingContent: null,
          pendingCheckId: null,
          updatedBy: ctx.user.id,
        })
        .where(eq(hostPages.orgId, ctx.orgId));
      await announceUpdate(tx, ctx.orgId, ctx.user.id, 'direct');
      return { status: 'live' as const };
    }

    const pendingJson = canonicalJson(next);
    if (row.pendingContent !== null && canonicalJson(row.pendingContent) === pendingJson) {
      return { status: statusOf(row) };
    }

    await tx
      .update(hostPages)
      .set({ pendingContent: jsonb(next), pendingCheckId: null, updatedBy: ctx.user.id })
      .where(eq(hostPages.orgId, ctx.orgId));
    // The hash covers the page version this change replaces as well as the change, so content
    // that was checked before (rejected, or an older page put back) is checked again.
    const hash = createHash('sha256')
      .update(`${row.updatedAt.toISOString()}\n${pendingJson}`)
      .digest('hex');
    await enqueue(tx, {
      topic: CHECK_TOPIC,
      payload: { orgId: ctx.orgId },
      dedupeKey: `hpcheck:${ctx.orgId}:${hash}`,
    });
    return { status: 'checking' as const };
  });
}

/** Entitled statuses (spec 8.1): the page is public from the first time the org has one. */
const ENTITLED_STATUSES = new Set(['trialing', 'active', 'past_due']);

export function isEntitledStatus(status: string): boolean {
  return ENTITLED_STATUSES.has(status);
}

/** Stamps `first_public_at` once; later calls keep the first value. */
export async function markPublic(db: DbOrTx, orgId: string, at: Date): Promise<void> {
  await db
    .insert(hostPages)
    .values({ orgId, content: jsonb(emptyHostPage()), firstPublicAt: at })
    .onConflictDoUpdate({
      target: hostPages.orgId,
      set: {
        firstPublicAt: sql`coalesce(${hostPages.firstPublicAt}, ${at.toISOString()}::timestamptz)`,
      },
    });
}
