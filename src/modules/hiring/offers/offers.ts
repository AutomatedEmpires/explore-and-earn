// Offers: send, cancel, accept, decline, lists and the letter link.
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import type { ApplicationStatus } from '@/lib/applications';
import { track } from '@/lib/analytics';
import { record } from '@/modules/audit';
import type { Db, DbOrTx } from '@/lib/db';
import { withTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { todayInZone } from '@/lib/hiring';
import type { HostOfferView, OfferInput, Page, PayUnit, ScanState, SeekerOfferItem } from '@/lib/hiring';
import { newId } from '@/lib/ids';
import { getAuthorizedMediaUrl, getMediaMeta, getStorage } from '@/modules/media';
import { getHiringInfoMany } from '@/modules/listings';
import { ensureThread, inScope, listingScope, listingTeam, postEvent, type ThreadViewer } from '@/modules/messaging';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import { requireEntry, requireListing } from '../access';
import { staleStatus, transitionStatus } from '../core';
import { enqueueNoteScan } from '../notes';
import { offers, pipelineEntries } from '../schema';
import { blockedConflict, stampIfBlocked } from '../interviews/blocks';
import { placeOf, seekerFirstName } from '../interviews/deliver';
import { publishOffer } from './deliver';
import { setOfferState } from '../interviews/state';
import './register';

type OfferRow = typeof offers.$inferSelect;
type EntryRow = typeof pipelineEntries.$inferSelect;

const PAGE = 25;
const VISIBLE: ScanState[] = ['clear', 'warn'];
const HIRING_ROLES = new Set(['owner', 'admin', 'recruiter']);
const OPENABLE = new Set(['new', 'shortlisted', 'interviewing']);

export type OfferBundle = {
  view: HostOfferView;
  orgId: string;
  listingId: string;
  seekerUserId: string;
  threadId: string;
  scanState: ScanState;
};

function actorHost(ctx: HostContext) {
  return { type: 'host' as const, userId: ctx.user.id, orgId: ctx.orgId };
}

function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string): { at: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!iso || !id) return null;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}

function toHostView(row: OfferRow): HostOfferView {
  return {
    id: row.id,
    applicationId: row.applicationId,
    status: row.status as HostOfferView['status'],
    position: row.position,
    startDate: row.startDate,
    pay: {
      amountCents: row.payAmountCents,
      maxCents: row.payMaxCents,
      unit: row.payUnit as PayUnit,
      currency: row.currency,
    },
    note: row.note,
    noteState: row.scanState as ScanState,
    hasLetter: row.letterMediaId !== null,
    priorStatus: row.priorStatus as ApplicationStatus,
    sentAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  };
}

function toSeekerItem(view: HostOfferView, extra: { orgName: string; title: string; threadId: string }): SeekerOfferItem {
  const { noteState: _noteState, priorStatus: _prior, ...rest } = view;
  return { ...rest, ...extra };
}

async function assertLetter(db: DbOrTx, orgId: string, mediaId: string | undefined): Promise<void> {
  if (!mediaId) return;
  const meta = await getMediaMeta(db, [mediaId]);
  const row = meta.get(mediaId);
  if (
    !row ||
    row.kind !== 'attachment' ||
    row.mime !== 'application/pdf' ||
    row.status !== 'approved' ||
    row.ownerOrgId !== orgId
  ) {
    throw conflict('The offer letter is not ready.', { reason: 'letter_not_ready' });
  }
}

export async function offerBundles(db: DbOrTx, ids: string[]): Promise<Map<string, OfferBundle>> {
  const out = new Map<string, OfferBundle>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ offer: offers, seekerUserId: pipelineEntries.seekerUserId })
    .from(offers)
    .innerJoin(pipelineEntries, eq(offers.applicationId, pipelineEntries.applicationId))
    .where(inArray(offers.id, ids));
  for (const row of rows) {
    out.set(row.offer.id, {
      view: toHostView(row.offer),
      orgId: row.offer.orgId,
      listingId: row.offer.listingId,
      seekerUserId: row.seekerUserId,
      threadId: row.offer.threadId,
      scanState: row.offer.scanState as ScanState,
    });
  }
  return out;
}

export async function hostOfferViews(db: DbOrTx, ids: string[]): Promise<Map<string, HostOfferView>> {
  const rows = await offerBundles(db, ids);
  return new Map([...rows].map(([id, bundle]) => [id, bundle.view]));
}

export async function seekerOfferViews(
  db: DbOrTx,
  seekerUserId: string,
  ids: string[],
): Promise<Map<string, SeekerOfferItem>> {
  const rows = await offerBundles(db, ids);
  const visible = [...rows.values()].filter(
    (bundle) => bundle.seekerUserId === seekerUserId && VISIBLE.includes(bundle.scanState),
  );
  const infos = await getHiringInfoMany(db, [...new Set(visible.map((bundle) => bundle.listingId))]);
  const titles = new Map(infos.map((info) => [info.id, info.title]));
  const orgs = await getOrgSummaries(db, [...new Set(visible.map((bundle) => bundle.orgId))]);
  const out = new Map<string, SeekerOfferItem>();
  for (const bundle of visible) {
    out.set(
      bundle.view.id,
      toSeekerItem(bundle.view, {
        orgName: orgs.get(bundle.orgId)?.name ?? 'Org',
        title: titles.get(bundle.listingId) ?? '',
        threadId: bundle.threadId,
      }),
    );
  }
  return out;
}

async function seekerItem(db: Db, seekerUserId: string, id: string): Promise<SeekerOfferItem> {
  const views = await seekerOfferViews(db, seekerUserId, [id]);
  const view = views.get(id);
  if (!view) throw notFound('Offer not found', { reason: 'not_found' });
  return view;
}

async function hostItem(db: Db, id: string): Promise<HostOfferView> {
  const views = await hostOfferViews(db, [id]);
  const view = views.get(id);
  if (!view) throw notFound('Offer not found', { reason: 'not_found' });
  return view;
}

export async function listSeekerOffers(
  db: DbOrTx,
  seekerUserId: string,
  o?: { cursor?: string },
): Promise<Page<SeekerOfferItem>> {
  const filters = [eq(pipelineEntries.seekerUserId, seekerUserId), inArray(offers.scanState, VISIBLE)];
  if (o?.cursor) {
    const cursor = decodeCursor(o.cursor);
    if (!cursor) throw badRequest('That page link is not valid.');
    const older = or(lt(offers.createdAt, cursor.at), and(eq(offers.createdAt, cursor.at), lt(offers.id, cursor.id)));
    if (older) filters.push(older);
  }
  const rows = await db
    .select({ offer: offers })
    .from(offers)
    .innerJoin(pipelineEntries, eq(offers.applicationId, pipelineEntries.applicationId))
    .where(and(...filters))
    .orderBy(desc(offers.createdAt), desc(offers.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  const views = await seekerOfferViews(
    db,
    seekerUserId,
    page.map((row) => row.offer.id),
  );
  const last = page.at(-1)?.offer;
  return {
    items: page.flatMap((row) => {
      const item = views.get(row.offer.id);
      return item ? [item] : [];
    }),
    nextCursor: rows.length > PAGE && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

async function loadVisibleOffer(
  db: DbOrTx,
  seekerUserId: string,
  offerId: string,
): Promise<{ offer: OfferRow; entry: EntryRow }> {
  const [row] = await db
    .select({ offer: offers, entry: pipelineEntries })
    .from(offers)
    .innerJoin(pipelineEntries, eq(offers.applicationId, pipelineEntries.applicationId))
    .where(eq(offers.id, offerId));
  if (!row || row.entry.seekerUserId !== seekerUserId) throw notFound('Offer not found', { reason: 'not_found' });
  if (row.offer.scanState !== 'clear' && row.offer.scanState !== 'warn') {
    throw notFound('Offer not found', { reason: 'not_found' });
  }
  return row;
}

async function notifyResponse(
  db: DbOrTx,
  offer: OfferRow,
  seekerUserId: string,
  accepted: boolean,
): Promise<void> {
  const team = await listingTeam(db, { orgId: offer.orgId, listingId: offer.listingId });
  const recipients = [...new Set([offer.createdBy, ...team])];
  const place = await placeOf(db, offer.listingId, offer.orgId);
  const firstName = await seekerFirstName(db, seekerUserId);
  const base = getEnv().APP_URL.replace(/\/+$/, '');
  for (const userId of recipients) {
    await notify(db, userId, 'hiring.offer_response', {
      offerId: offer.id,
      threadId: offer.threadId,
      audience: 'host',
      orgName: place.orgName,
      position: offer.position,
      firstName,
      accepted,
      url: `${base}/host/messages/${offer.threadId}`,
    });
  }
}

export async function sendOffer(
  db: Db,
  ctx: HostContext,
  applicationId: string,
  input: OfferInput,
  now = new Date(),
): Promise<HostOfferView> {
  const id = await withTx(db, async (tx) => {
    const entry = await requireEntry(tx, ctx, applicationId, { forUpdate: true });
    const [open] = await tx
      .select({ id: offers.id })
      .from(offers)
      .where(and(eq(offers.applicationId, applicationId), eq(offers.status, 'sent')));
    if (open) throw conflict('An offer is already open for this application.', { reason: 'offer_open' });
    if (!OPENABLE.has(entry.status)) throw staleStatus(entry.status as ApplicationStatus);
    if (await stampIfBlocked(tx, { orgId: entry.orgId, seekerUserId: entry.seekerUserId, applicationId })) {
      return null;
    }
    const listing = await requireListing(tx, ctx, entry.listingId);
    if (input.startDate < todayInZone(listing.timezone, now)) {
      throw badRequest('The start date must be today or later.', { reason: 'start_in_past' });
    }
    await assertLetter(tx, ctx.orgId, input.letterMediaId);
    const { threadId } = await ensureThread(tx, {
      orgId: entry.orgId,
      listingId: entry.listingId,
      seekerUserId: entry.seekerUserId,
      applicationId,
    });
    const offerId = newId();
    const note = input.note?.trim() ? input.note.trim() : null;
    const position = input.position?.trim() || listing.title;
    // A position the host typed reaches the seeker in the card and the notification, so it is
    // scanned like the note. The listing title was reviewed with the listing.
    const scanned = note !== null || position !== listing.title;
    const row: OfferRow = {
      id: offerId,
      orgId: entry.orgId,
      listingId: entry.listingId,
      applicationId,
      threadId,
      createdBy: ctx.user.id,
      status: 'sent',
      position,
      startDate: input.startDate,
      payAmountCents: input.pay.amountCents,
      payMaxCents: input.pay.maxCents ?? null,
      payUnit: input.pay.unit,
      currency: 'USD',
      note,
      letterMediaId: input.letterMediaId ?? null,
      priorStatus: entry.status,
      respondedAt: null,
      scanState: scanned ? 'pending' : 'clear',
      checkId: null,
      createdAt: now,
      updatedAt: now,
    };
    await tx.insert(offers).values(row);
    const moved = await transitionStatus(
      tx,
      {
        applicationId,
        from: ['new', 'shortlisted', 'interviewing'],
        to: 'offered',
        actor: actorHost(ctx),
        eventKind: 'offered',
      },
      now,
    );
    if (!moved.ok) throw staleStatus(moved.current);
    await setOfferState(tx, applicationId, 'sent');
    if (scanned) await enqueueNoteScan(tx, 'offer', offerId);
    else await publishOffer(tx, row);
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: entry.orgId,
      action: 'hiring.offer_sent',
      subjectType: 'offer',
      subjectId: offerId,
    });
    return offerId;
  });
  if (id === null) throw blockedConflict();
  track('hiring.offer_sent', { offerId: id });
  return hostItem(db, id);
}

export async function cancelOffer(db: Db, ctx: HostContext, offerId: string, now = new Date()): Promise<HostOfferView> {
  await withTx(db, async (tx) => {
    const [existing] = await tx.select().from(offers).where(eq(offers.id, offerId));
    if (!existing || existing.orgId !== ctx.orgId) throw notFound('Offer not found', { reason: 'not_found' });
    await requireListing(tx, ctx, existing.listingId);
    const [updated] = await tx
      .update(offers)
      .set({ status: 'canceled', respondedAt: now })
      .where(and(eq(offers.id, offerId), eq(offers.status, 'sent')))
      .returning();
    if (!updated) throw conflict('This offer is no longer open.', { reason: 'offer_closed' });
    const moved = await transitionStatus(
      tx,
      {
        applicationId: existing.applicationId,
        from: ['offered'],
        to: 'interviewing',
        actor: actorHost(ctx),
        eventKind: 'offer_canceled',
      },
      now,
    );
    if (!moved.ok) throw staleStatus(moved.current);
    await setOfferState(tx, existing.applicationId, 'canceled');
    // The seeker never saw a pending or held offer, so its cancel is for the host only.
    const delivered = updated.scanState === 'clear' || updated.scanState === 'warn';
    await postEvent(tx, existing.threadId, { code: 'offer_canceled', visibleTo: delivered ? 'all' : 'host' });
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: existing.orgId,
      action: 'hiring.offer_canceled',
      subjectType: 'offer',
      subjectId: offerId,
    });
  });
  return hostItem(db, offerId);
}

async function respond(
  db: Db,
  seekerUserId: string,
  offerId: string,
  to: 'accepted' | 'declined',
  now: Date,
): Promise<SeekerOfferItem> {
  await withTx(db, async (tx) => {
    const visible = await loadVisibleOffer(tx, seekerUserId, offerId);
    const [updated] = await tx
      .update(offers)
      .set({ status: to, respondedAt: now })
      .where(and(eq(offers.id, offerId), eq(offers.status, 'sent')))
      .returning();
    if (!updated) throw conflict('This offer is no longer open.', { reason: 'offer_closed' });
    const moved = await transitionStatus(
      tx,
      {
        applicationId: visible.entry.applicationId,
        from: ['offered'],
        to: to === 'accepted' ? 'hired' : 'offer_declined',
        actor: { type: 'seeker', userId: seekerUserId },
        eventKind: to === 'accepted' ? 'hired' : 'offer_declined',
        ...(to === 'accepted' ? { hiredSource: 'offer_accepted' as const } : {}),
      },
      now,
    );
    if (!moved.ok) throw staleStatus(moved.current);
    await setOfferState(tx, visible.entry.applicationId, to);
    await postEvent(tx, visible.offer.threadId, {
      code: to === 'accepted' ? 'offer_accepted' : 'offer_declined',
      visibleTo: 'all',
    });
    await notifyResponse(tx, updated, seekerUserId, to === 'accepted');
    await record(tx, {
      actorType: 'user',
      actorId: seekerUserId,
      orgId: visible.offer.orgId,
      action: 'hiring.offer_responded',
      subjectType: 'offer',
      subjectId: offerId,
      data: { accepted: to === 'accepted' },
    });
  });
  if (to === 'accepted') track('hiring.hired', { offerId });
  return seekerItem(db, seekerUserId, offerId);
}

export async function acceptOffer(
  db: Db,
  seekerUserId: string,
  offerId: string,
  now = new Date(),
): Promise<{ offer: SeekerOfferItem; applicationStatus: 'hired' }> {
  const offer = await respond(db, seekerUserId, offerId, 'accepted', now);
  return { offer, applicationStatus: 'hired' };
}

export async function declineOffer(
  db: Db,
  seekerUserId: string,
  offerId: string,
  now = new Date(),
): Promise<SeekerOfferItem> {
  return respond(db, seekerUserId, offerId, 'declined', now);
}

export async function getOfferLetterUrl(db: DbOrTx, viewer: ThreadViewer, offerId: string): Promise<string> {
  const [row] = await db
    .select({ offer: offers, entry: pipelineEntries })
    .from(offers)
    .innerJoin(pipelineEntries, eq(offers.applicationId, pipelineEntries.applicationId))
    .where(eq(offers.id, offerId));
  if (!row) throw notFound('Offer not found', { reason: 'not_found' });
  if (viewer.kind === 'seeker') {
    if (row.entry.seekerUserId !== viewer.userId) throw notFound('Offer not found', { reason: 'not_found' });
    if (row.offer.scanState !== 'clear' && row.offer.scanState !== 'warn') {
      throw notFound('Offer not found', { reason: 'not_found' });
    }
  } else {
    if (!HIRING_ROLES.has(viewer.ctx.role) || row.offer.orgId !== viewer.ctx.orgId) {
      throw notFound('Offer not found', { reason: 'not_found' });
    }
    const scope = await listingScope(db, viewer.ctx);
    if (!inScope(scope, row.offer.listingId)) throw notFound('Offer not found', { reason: 'not_found' });
  }
  if (!row.offer.letterMediaId) throw notFound('Offer not found', { reason: 'not_found' });
  return getAuthorizedMediaUrl(db, getStorage(), row.offer.letterMediaId);
}
