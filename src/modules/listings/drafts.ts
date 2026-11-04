// Builder drafts (spec sections 5 and 8.2): creating a listing (blank, copied or pasted), the
// editor read, per-section autosave with optimistic versions, and deleting a never-published
// draft. A whole section is replaced per PATCH; a stale base version conflicts only when that
// same section changed since (spec failure mode 5).
import { and, eq, max } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict, forbidden } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { enqueue } from '@/modules/jobs';
import { assignListing, getListingAccess } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';
import {
  draftLocationId,
  draftTitle,
  isUuid,
  loadListing,
  userActor,
  type ListingRecord,
} from './access';
import { checklist, sectionKeys, type ChecklistEntry } from './checklist';
import {
  HOUSING_SLOTS,
  ListingDraftSchema,
  MEAL_SLOTS,
  type BuilderSection,
  type ListingDraft,
} from './content';
import { importPastedPost } from './import';
import { getPath, sameJson } from './paths';
import { listingRevisions, listings } from './schema';

export const PHOTO_SLOT_CHECK_TOPIC = 'listings.photo_slot_check';

export type CreateListingInput =
  { start: 'blank' } | { start: 'copy'; listingId: string } | { start: 'paste'; text: string };

export type EditorListing = {
  id: string;
  state: ListingRecord['state'];
  reviewStage: ListingRecord['reviewStage'];
  provenance: ListingRecord['provenance'];
  title: string | null;
  locationId: string | null;
  copiedFromId: string | null;
  repostedFromId: string | null;
  firstPublishedAt: Date | null;
  publishedAt: Date | null;
  confirmedActiveAt: Date | null;
  autoCloseAt: Date | null;
  closedAt: Date | null;
  closeReason: ListingRecord['closeReason'];
  removedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type EditorRevision = {
  id: string;
  revisionNumber: number;
  status: string;
  content: unknown;
  submittedAt: Date | null;
  decidedAt: Date | null;
  checks: Record<string, unknown> | null;
};

export type ListingEditor = {
  listing: EditorListing;
  draft: ListingDraft;
  draftVersion: number;
  sectionVersions: Partial<Record<BuilderSection, number>>;
  live: EditorRevision | null;
  pending: EditorRevision | null;
  checklist: ChecklistEntry[];
  aiFilledFields: string[];
};

type Json = Record<string, unknown>;

function toEditorListing(l: ListingRecord): EditorListing {
  return {
    id: l.id,
    state: l.state,
    reviewStage: l.reviewStage,
    provenance: l.provenance,
    title: l.title,
    locationId: l.locationId,
    copiedFromId: l.copiedFromId,
    repostedFromId: l.repostedFromId,
    firstPublishedAt: l.firstPublishedAt,
    publishedAt: l.publishedAt,
    confirmedActiveAt: l.confirmedActiveAt,
    autoCloseAt: l.autoCloseAt,
    closedAt: l.closedAt,
    closeReason: l.closeReason,
    removedAt: l.removedAt,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

async function readRevision(db: DbOrTx, id: string | null): Promise<EditorRevision | null> {
  if (!id) return null;
  const [r] = await db
    .select({
      id: listingRevisions.id,
      revisionNumber: listingRevisions.revisionNumber,
      status: listingRevisions.status,
      content: listingRevisions.content,
      submittedAt: listingRevisions.submittedAt,
      decidedAt: listingRevisions.decidedAt,
      checks: listingRevisions.checks,
    })
    .from(listingRevisions)
    .where(eq(listingRevisions.id, id));
  return r ?? null;
}

/** The content a copy or repost starts from: the live revision's, else the draft. */
export async function latestContent(db: DbOrTx, l: ListingRecord): Promise<Json> {
  const live = await readRevision(db, l.publishedRevisionId);
  const content = (live?.content ?? l.draft) as Json;
  return structuredClone(content ?? {});
}

/** An assigned-scope Recruiter's new listing is assigned to them. */
async function assignToCreator(db: DbOrTx, ctx: HostContext, listingId: string): Promise<void> {
  if (ctx.role !== 'recruiter') return;
  const access = await getListingAccess(db, ctx);
  if (!access.all) await assignListing(db, ctx.orgId, ctx.user.id, listingId);
}

/** Inserts a new draft listing and records `listings.created` (Tasks 23 and 27). */
export async function insertDraftListing(
  db: DbOrTx,
  ctx: HostContext,
  i: {
    draft: Json;
    provenance?: 'host_created' | 'imported';
    aiFilledFields?: string[];
    copiedFromId?: string;
    repostedFromId?: string;
  },
): Promise<string> {
  const id = newId();
  await db.transaction(async (tx) => {
    await tx.insert(listings).values({
      id,
      orgId: ctx.orgId,
      provenance: i.provenance ?? 'host_created',
      draft: i.draft,
      aiFilledFields: i.aiFilledFields ?? [],
      title: draftTitle(i.draft),
      locationId: draftLocationId(i.draft),
      copiedFromId: i.copiedFromId ?? null,
      repostedFromId: i.repostedFromId ?? null,
      createdBy: ctx.user.id,
      lastEditedBy: ctx.user.id,
    });
    await assignToCreator(tx, ctx, id);
    await record(tx, {
      ...userActor(ctx),
      orgId: ctx.orgId,
      action: 'listings.created',
      subjectType: 'listing',
      subjectId: id,
      data: {
        start:
          i.provenance === 'imported'
            ? 'paste'
            : i.copiedFromId
              ? 'copy'
              : i.repostedFromId
                ? 'repost'
                : 'blank',
        ...(i.copiedFromId ? { copiedFromId: i.copiedFromId } : {}),
        ...(i.repostedFromId ? { repostedFromId: i.repostedFromId } : {}),
      },
    });
  });
  return id;
}

/** Creates a listing: blank, a copy of a past listing (without dates), or from a pasted post. */
export async function createListing(
  db: DbOrTx,
  ctx: HostContext,
  i: CreateListingInput,
): Promise<{ id: string; openSection: BuilderSection | 'review' }> {
  if (i.start === 'blank') {
    return { id: await insertDraftListing(db, ctx, { draft: {} }), openSection: 'basics' };
  }

  if (i.start === 'copy') {
    const source = await loadListing(db, ctx, i.listingId);
    const draft = await latestContent(db, source);
    const when = draft.when as Json | undefined;
    if (when) delete when.dates;
    const applying = draft.applying as Json | undefined;
    if (applying) applying.deadline = null;
    const id = await insertDraftListing(db, ctx, { draft, copiedFromId: source.id });
    return { id, openSection: 'basics' };
  }

  const imported = await importPastedPost(i.text);
  const id = await db.transaction(async (tx) => {
    const listingId = await insertDraftListing(tx, ctx, {
      draft: imported.draft as Json,
      provenance: 'imported',
      aiFilledFields: imported.aiFilledFields,
    });
    await record(tx, {
      ...userActor(ctx),
      orgId: ctx.orgId,
      action: 'listings.imported',
      subjectType: 'listing',
      subjectId: listingId,
      data: { aiFilledFields: imported.aiFilledFields.length },
    });
    return listingId;
  });
  return { id, openSection: 'basics' };
}

/** Everything the builder needs for one listing. */
export async function getListingForEditor(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
): Promise<ListingEditor> {
  const l = await loadListing(db, ctx, id);
  return {
    listing: toEditorListing(l),
    draft: l.draft as ListingDraft,
    draftVersion: l.draftVersion,
    sectionVersions: l.sectionVersions as Partial<Record<BuilderSection, number>>,
    live: await readRevision(db, l.publishedRevisionId),
    pending: await readRevision(db, l.pendingRevisionId),
    checklist: checklist(l.draft),
    aiFilledFields: l.aiFilledFields,
  };
}

function sectionSchema(section: BuilderSection) {
  const mask = Object.fromEntries(sectionKeys(section).map((k) => [k, true as const]));
  return ListingDraftSchema.pick(mask as never).strict();
}

/** The housing and meal photos a draft sets, as slot -> media id. */
function photoSlots(draft: Json): { slot: string; mediaId: string }[] {
  const out: { slot: string; mediaId: string }[] = [];
  for (const [key, slots] of [
    ['housing', HOUSING_SLOTS],
    ['meals', MEAL_SLOTS],
  ] as const) {
    for (const slot of slots) {
      const mediaId = getPath(draft, `${key}.photos.${slot}`);
      if (isUuid(mediaId)) out.push({ slot, mediaId });
    }
  }
  return out;
}

export type PatchDraftInput = {
  section: BuilderSection;
  baseVersion: number;
  data: unknown;
  confirmedFields?: string[];
};

/**
 * Replaces one builder section of the draft. Allowed while the listing is a draft or live.
 * Throws 409 `section_conflict` (with the server's copy of the section) when the section
 * changed since `baseVersion`, and 403 `location_not_in_scope` when an assigned Recruiter picks
 * a location outside their scope.
 */
export async function patchDraft(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  i: PatchDraftInput,
): Promise<{
  draftVersion: number;
  sectionVersions: Partial<Record<BuilderSection, number>>;
  checklist: ChecklistEntry[];
}> {
  const keys = sectionKeys(i.section);
  const parsed = sectionSchema(i.section).safeParse(i.data ?? {});
  if (!parsed.success) throw badRequest('Invalid section data', parsed.error.issues);
  const data = parsed.data as Json;

  return db.transaction(async (tx) => {
    const l = await loadListing(tx, ctx, id, { forUpdate: true });
    if (l.state !== 'draft' && l.state !== 'active') {
      throw conflict('This listing can no longer be edited', { reason: 'not_editable' });
    }

    const oldDraft = (l.draft ?? {}) as Json;
    const versions = { ...(l.sectionVersions as Partial<Record<BuilderSection, number>>) };
    const current = versions[i.section] ?? 0;
    if (current !== i.baseVersion) {
      const server = Object.fromEntries(
        keys.filter((k) => oldDraft[k] !== undefined).map((k) => [k, oldDraft[k]]),
      );
      throw conflict('Someone else changed this section', {
        reason: 'section_conflict',
        section: i.section,
        version: current,
        data: server,
      });
    }

    const draft: Json = Object.fromEntries(
      Object.entries(oldDraft).filter(([k]) => !(keys as string[]).includes(k)),
    );
    for (const k of keys) if (data[k] !== undefined) draft[k] = data[k];

    const oldLocation = draftLocationId(oldDraft);
    const newLocation = draftLocationId(draft);
    if (newLocation && newLocation !== oldLocation && ctx.role === 'recruiter') {
      const access = await getListingAccess(tx, ctx);
      if (!access.all && !access.locationIds.includes(newLocation)) {
        throw forbidden('Choose one of the locations assigned to you', {
          reason: 'location_not_in_scope',
        });
      }
    }

    const confirmed = new Set(i.confirmedFields ?? []);
    const aiFilledFields = l.aiFilledFields.filter(
      (p) => !confirmed.has(p) && sameJson(getPath(oldDraft, p), getPath(draft, p)),
    );

    versions[i.section] = current + 1;
    const draftVersion = l.draftVersion + 1;
    const live = l.publishedRevisionId !== null;
    await tx
      .update(listings)
      .set({
        draft,
        draftVersion,
        sectionVersions: versions,
        aiFilledFields,
        lastEditedBy: ctx.user.id,
        // A live listing keeps its live title and location until an edit is published.
        ...(live ? {} : { title: draftTitle(draft), locationId: newLocation }),
      })
      .where(eq(listings.id, l.id));

    const before = new Map(photoSlots(oldDraft).map((p) => [p.slot, p.mediaId]));
    for (const p of photoSlots(draft)) {
      if (before.get(p.slot) === p.mediaId) continue;
      await enqueue(tx, {
        topic: PHOTO_SLOT_CHECK_TOPIC,
        payload: { mediaId: p.mediaId, slot: p.slot, listingId: l.id },
        dedupeKey: `slot:${p.mediaId}:${p.slot}`,
      });
    }

    return { draftVersion, sectionVersions: versions, checklist: checklist(draft) };
  });
}

/** Deletes a draft that was never published (`conflict` otherwise). Records `listings.deleted`. */
export async function deleteListing(db: DbOrTx, ctx: HostContext, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const l = await loadListing(tx, ctx, id, { forUpdate: true });
    if (l.firstPublishedAt !== null || l.state !== 'draft') {
      throw conflict('Only a listing that was never published can be deleted', {
        reason: 'not_deletable',
      });
    }
    await tx.delete(listings).where(and(eq(listings.id, l.id), eq(listings.orgId, ctx.orgId)));
    await record(tx, {
      ...userActor(ctx),
      orgId: ctx.orgId,
      action: 'listings.deleted',
      subjectType: 'listing',
      subjectId: l.id,
      data: { title: l.title },
    });
  });
}

/** The next revision number of a listing. */
export async function nextRevisionNumber(db: DbOrTx, listingId: string): Promise<number> {
  const [row] = await db
    .select({ n: max(listingRevisions.revisionNumber) })
    .from(listingRevisions)
    .where(eq(listingRevisions.listingId, listingId));
  return (row?.n ?? 0) + 1;
}

export const createListingSchema = z.discriminatedUnion('start', [
  z.object({ start: z.literal('blank') }),
  z.object({ start: z.literal('copy'), listingId: z.uuid() }),
  z.object({ start: z.literal('paste'), text: z.string().min(1).max(20_000) }),
]);
