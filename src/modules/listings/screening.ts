// The screening pipeline (spec section 8.3 steps 2-6), run by the `listings.screen` outbox job:
// business verification, then media, the Additional step link and the two AI checks, then the
// decision. Also the photo-slot check and resuming after verification.
//
// Each run reads the revision afresh and does nothing unless it is still `screening`, so a
// retried or duplicated job is harmless. Waits re-enqueue the job with their own dedupe keys.
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import { enqueue, readEnvelope } from '@/modules/jobs';
import {
  getMediaInfo,
  getStorage,
  readMediaVariant,
  type MediaInfo,
  type Storage,
} from '@/modules/media';
import { notify } from '@/modules/notifications';
import { getOrgSummaries, type OrgSummary } from '@/modules/orgs';
import { getSetting } from '@/modules/settings';
import {
  findLatestCheck,
  listOpenReviewItems,
  openReviewItem,
  runCheck,
  type CheckResult,
  type RunCheckInput,
} from '@/modules/trust';
import { getVerificationStatus, startVerification } from '@/modules/verification';
import { findListing, isUuid, type ListingRecord } from './access';
import { SLOT_LABELS } from './checks';
import { HOUSING_SLOTS, MEAL_SLOTS, type ListingContent } from './content';
import { getLinkSafety, domainStatus, type DomainStatus, type LinkSafety } from './link-safety';
import { checkLinkSyntax } from './links';
import { PHOTO_SLOT_CHECK_TOPIC } from './drafts';
import {
  SCREEN_TOPIC,
  publishRevision,
  rejectRevision,
  revisionUnderReview,
  teamFor,
} from './publish';
import { listingRevisions, listings, photoSlotChecks, PHOTO_SLOTS } from './schema';

/** Scanning media is waited for this many times (30 s apart) before going to moderation. */
export const MEDIA_MAX_ATTEMPTS = 20;
const MEDIA_RETRY_MS = 30_000;
/** Media held for an operator is waited for without a limit. */
const MEDIA_HOLD_WAIT_MS = 5 * 60_000;

/** The review subject of a revision. */
export const REVISION_SUBJECT = 'listing_revision';

type RevisionRecord = typeof listingRevisions.$inferSelect;

const screenPayload = z.object({
  revisionId: z.uuid(),
  attempt: z.number().int().min(0).default(0),
  wait: z.number().int().min(0).optional(),
});

export type ScreenDeps = { linkSafety?: LinkSafety };

async function loadRevision(db: DbOrTx, id: string): Promise<RevisionRecord | null> {
  if (!isUuid(id)) return null;
  const [rev] = await db.select().from(listingRevisions).where(eq(listingRevisions.id, id));
  return rev ?? null;
}

/** Every media id a listing references (cover, gallery, housing and meal photos). */
function referencedMediaIds(c: ListingContent): string[] {
  const ids = [c.photos.coverMediaId, ...c.photos.galleryMediaIds];
  const { housing, meals } = c;
  if (housing.provided) ids.push(...HOUSING_SLOTS.map((s) => housing.photos[s]));
  if (meals.provided) ids.push(...MEAL_SLOTS.map((s) => meals.photos[s]));
  return [...new Set(ids)];
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * The text both AI checks read: every text field, the screening questions and the Additional
 * step, plus pay, the occupation and the org (the fraud check weighs pay against the role).
 */
export function listingCheckText(c: ListingContent, org: OrgSummary | undefined): string {
  const lines: string[] = [];
  const add = (label: string, value: string | null | undefined) => {
    if (value && value.trim() !== '') lines.push(`${label}: ${value.trim()}`);
  };
  const list = (label: string, values: string[]) => {
    if (values.length > 0) lines.push(`${label}:\n${values.map((v) => `- ${v}`).join('\n')}`);
  };

  add('Organization', org?.name);
  add('Organization website', org?.websiteUrl ?? 'none');
  add('Title', c.basics.title);
  add('Category', `${c.basics.primaryCategory}, genre ${c.basics.genre}`);
  add('Occupation', c.basics.occupationCode);
  add('Openings', String(c.basics.openings));
  add('Employment', `${c.basics.employmentType}, ${c.basics.schedule}`);
  const pay = c.pay;
  add(
    'Pay',
    `${money(pay.minCents)}${pay.maxCents !== pay.minCents ? ` to ${money(pay.maxCents)}` : ''} per ${pay.unit}, paid ${pay.frequency}`,
  );
  if (pay.crewShareEstimate) {
    const e = pay.crewShareEstimate;
    add('Crew share estimate', `${money(e.minCents)} to ${money(e.maxCents)} per ${e.per}`);
  }
  add('Bonuses', pay.bonuses);
  add('Deductions', pay.deductions);
  add('Weekly hours', String(c.when.weeklyHours));
  add('Minimum commitment', c.when.minCommitment);
  if (c.housing.provided) {
    const cost = c.housing.cost.free
      ? 'free'
      : `${money(c.housing.cost.cents)} per ${c.housing.cost.period}`;
    add('Housing', `${c.housing.type}, ${cost}`);
    add('Housing note', c.housing.note);
    add('Housing fine print', c.housing.finePrint.notes);
  } else {
    add('Housing', 'not provided');
  }
  if (c.meals.provided) {
    const cost = c.meals.cost.free
      ? 'free'
      : `${money(c.meals.cost.cents)} per ${c.meals.cost.period}`;
    add('Meals', `${c.meals.perDay} a day, ${cost}`);
    add('Meals note', c.meals.note);
    add('Dietary', c.meals.dietary);
  } else {
    add('Meals', 'not provided');
  }
  const g = c.genreDetails;
  if (g.category === 'maritime') {
    add('Vessel', `${g.vesselType}, home port ${g.homePort}`);
    add('Rotation', g.rotation);
    add('Time at sea', g.timeAtSea);
  } else if (g.category === 'seasonal') {
    list('Staff perks', g.staffPerks);
  } else if (g.category === 'farm') {
    add('Operation', g.operationType);
    add('Harvest window', g.harvestWindow);
    list('Equipment', g.equipment);
    list('Farm certifications', g.certifications);
  } else {
    add('Time zone overlap', g.timeZoneOverlap);
    add('Equipment provided', g.equipmentProvided);
    add('Internet', g.internet);
  }
  add('Description', c.job.description);
  list('Responsibilities', c.job.responsibilities);
  add('Typical day', c.job.typicalDay);
  list('Required qualifications', c.job.requiredQualifications);
  list('Preferred qualifications', c.job.preferredQualifications);
  list('Skills', c.job.skills);
  list('Certifications', c.job.certifications);
  add('Physical demands', c.job.physicalDemands);
  add('Minimum age', String(c.job.minAge));
  add('Visa sponsorship', c.job.visaSponsorship);
  for (const q of c.applying.questions) {
    const choices = q.type === 'multiple_choice' ? ` (choices: ${q.choices.join('; ')})` : '';
    add('Screening question', `${q.prompt}${choices}`);
  }
  if (c.applying.additionalStep) {
    add('Additional step link', c.applying.additionalStep.url);
    add('Additional step note', c.applying.additionalStep.note);
  }
  return lines.join('\n');
}

async function setStage(db: DbOrTx, listingId: string, stage: 'verification' | 'screening') {
  await db.update(listings).set({ reviewStage: stage }).where(eq(listings.id, listingId));
}

/** Opens a review item on the revision unless one with the same reason is already open. */
async function openRevisionItem(db: DbOrTx, revisionId: string, reason: string) {
  const open = await listOpenReviewItems(db, REVISION_SUBJECT, revisionId);
  if (open.some((i) => i.reason === reason)) return;
  await openReviewItem(db, {
    queue: 'moderation',
    subjectType: REVISION_SUBJECT,
    subjectId: revisionId,
    reason,
  });
}

/**
 * Sends a revision to operators: stage `moderation`, revision `in_review`, items for `reasons`
 * (AI checks open their own), and `listings.in_review` to the listing team.
 */
async function toModeration(
  db: DbOrTx,
  rev: RevisionRecord,
  l: ListingRecord,
  reasons: { reason: string; onlyIfNoItem?: boolean }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(listingRevisions)
      .set({ status: 'in_review' })
      .where(and(eq(listingRevisions.id, rev.id), eq(listingRevisions.status, 'screening')));
    await tx.update(listings).set({ reviewStage: 'moderation' }).where(eq(listings.id, l.id));
    for (const r of reasons) {
      if (r.onlyIfNoItem && (await listOpenReviewItems(tx, REVISION_SUBJECT, rev.id)).length > 0) {
        continue;
      }
      await openRevisionItem(tx, rev.id, r.reason);
    }
    for (const userId of await teamFor(tx, l, rev.content)) {
      await notify(tx, userId, 'listings.in_review', {
        listingId: l.id,
        title: rev.title,
        href: `/host/listings/${l.id}`,
      });
    }
  });
}

/** Runs an AI check once per revision: a retried job reuses the stored result. */
async function checkOnce(db: DbOrTx, i: RunCheckInput): Promise<CheckResult> {
  const previous = await findLatestCheck(db, {
    kind: i.kind,
    subjectType: i.subjectType,
    subjectId: i.subjectId,
  });
  return previous ?? runCheck(db, i);
}

type MediaVerdict = 'ready' | 'rejected' | 'pending' | 'held';

function mediaVerdict(ids: string[], info: Map<string, MediaInfo>): MediaVerdict {
  const statuses = ids.map((id) => info.get(id)?.status ?? 'missing');
  if (statuses.some((s) => s === 'rejected' || s === 'blocked' || s === 'missing'))
    return 'rejected';
  if (statuses.some((s) => s === 'uploaded' || s === 'scanning')) return 'pending';
  if (statuses.some((s) => s === 'in_review')) return 'held';
  return 'ready';
}

/** The `listings.screen` handler: spec section 8.3 steps 2-6. */
export async function screenRevision(
  db: DbOrTx,
  payload: unknown,
  now: Date,
  deps: ScreenDeps = {},
): Promise<void> {
  const p = screenPayload.parse(payload);
  const rev = await loadRevision(db, p.revisionId);
  if (!rev || rev.status !== 'screening') return;
  const l = await findListing(db, rev.listingId);
  if (!l || l.reviewStage === 'team_approval') return;
  if (l.state !== 'in_review' && l.pendingRevisionId !== rev.id) return;
  const content = rev.content as ListingContent;

  // 2. Business verification.
  const verification = await getVerificationStatus(db, rev.orgId);
  if (verification === 'failed') {
    await rejectRevision(db, rev.id, ['verification_failed'], now);
    return;
  }
  if (verification !== 'verified') {
    await db.transaction(async (tx) => {
      if (verification === 'unverified') await startVerification(tx, rev.orgId, l.id);
      await setStage(tx, l.id, 'verification');
    });
    return;
  }
  if (l.reviewStage !== 'screening') await setStage(db, l.id, 'screening');

  // 3. Media: every referenced photo must be approved.
  const mediaIds = referencedMediaIds(content);
  const media = mediaVerdict(mediaIds, await getMediaInfo(db, mediaIds));
  if (media === 'rejected') {
    await rejectRevision(db, rev.id, ['photo_rejected'], now);
    return;
  }
  if (media === 'pending') {
    if (p.attempt >= MEDIA_MAX_ATTEMPTS) {
      await toModeration(db, rev, l, [{ reason: 'media_timeout' }]);
      return;
    }
    const attempt = p.attempt + 1;
    await enqueue(db, {
      topic: SCREEN_TOPIC,
      payload: { revisionId: rev.id, attempt },
      dedupeKey: `screen:${rev.id}:${attempt}`,
      availableAt: new Date(now.getTime() + MEDIA_RETRY_MS),
    });
    return;
  }
  if (media === 'held') {
    const wait = (p.wait ?? 0) + 1;
    await enqueue(db, {
      topic: SCREEN_TOPIC,
      payload: { revisionId: rev.id, attempt: p.attempt, wait },
      dedupeKey: `screen:${rev.id}:${p.attempt}:w${wait}`,
      availableAt: new Date(now.getTime() + MEDIA_HOLD_WAIT_MS),
    });
    return;
  }

  // 4. The Additional step link.
  let link: DomainStatus | null = null;
  const step = content.applying.additionalStep;
  if (step && step.url.trim() !== '') {
    const [blocked, shorteners] = await Promise.all([
      getSetting(db, 'links.blocked_domains'),
      getSetting(db, 'links.shortener_domains'),
    ]);
    const syntax = checkLinkSyntax(step.url, { blocked, shorteners });
    link = syntax.ok
      ? await domainStatus(db, syntax.host, step.url, deps.linkSafety ?? getLinkSafety(), now)
      : 'blocked';
    if (link === 'blocked') {
      await rejectRevision(db, rev.id, ['link_unsafe'], now);
      return;
    }
  }

  // 5. The AI checks, in parallel.
  const org = (await getOrgSummaries(db, [rev.orgId])).get(rev.orgId);
  const text = listingCheckText(content, org);
  const subject = { subjectType: REVISION_SUBJECT, subjectId: rev.id, text };
  const [moderation, fraud] = await Promise.all([
    checkOnce(db, { kind: 'listing_moderation', reviewQueue: 'moderation', ...subject }),
    checkOnce(db, { kind: 'listing_fraud', reviewQueue: 'fraud', ...subject }),
  ]);
  if (fraud.decision === 'rejected') {
    const open = await listOpenReviewItems(db, 'organization', rev.orgId);
    if (!open.some((i) => i.reason === 'listing_fraud_rejected')) {
      await openReviewItem(db, {
        queue: 'fraud',
        subjectType: 'organization',
        subjectId: rev.orgId,
        priority: 100,
        reason: 'listing_fraud_rejected',
      });
    }
  }

  // 6. The decision.
  const keptMismatch = rev.acknowledgedWarnings.some((w) => w.startsWith('photo_slot_mismatch:'));
  const summary = {
    verification,
    media: 'approved',
    link,
    moderation: {
      decision: moderation.decision,
      score: moderation.score,
      checkId: moderation.checkId,
    },
    fraud: { decision: fraud.decision, score: fraud.score, checkId: fraud.checkId },
    photoSlotMismatchKept: keptMismatch,
  };
  await db
    .update(listingRevisions)
    .set({ trustCheckIds: [moderation.checkId, fraud.checkId], checks: summary })
    .where(and(eq(listingRevisions.id, rev.id), eq(listingRevisions.status, 'screening')));

  const rejected = [moderation, fraud].filter((c) => c.decision === 'rejected');
  if (rejected.length > 0) {
    const labels = [...new Set(rejected.flatMap((c) => c.labels))];
    await rejectRevision(db, rev.id, labels.length > 0 ? labels : ['moderation'], now);
    return;
  }
  const reasons: { reason: string; onlyIfNoItem?: boolean }[] = [];
  if (link === 'unknown') reasons.push({ reason: 'link_unknown' });
  if (keptMismatch) reasons.push({ reason: 'photo_slot_mismatch_kept', onlyIfNoItem: true });
  if (
    moderation.decision === 'needs_review' ||
    fraud.decision === 'needs_review' ||
    reasons.length
  ) {
    await toModeration(db, { ...rev, checks: summary }, l, reasons);
    return;
  }
  await publishRevision(db, rev.id, now);
}

const slotPayload = z.object({
  mediaId: z.uuid(),
  slot: z.enum(PHOTO_SLOTS),
  listingId: z.string(),
  attempt: z.number().int().min(0).optional(),
  wait: z.number().int().min(0).optional(),
});

async function saveSlotResult(
  db: DbOrTx,
  mediaId: string,
  slot: (typeof PHOTO_SLOTS)[number],
  result: 'match' | 'mismatch' | 'error',
  checkId: string | null,
) {
  await db
    .insert(photoSlotChecks)
    .values({ mediaId, slot, result, checkId })
    .onConflictDoUpdate({
      target: [photoSlotChecks.mediaId, photoSlotChecks.slot],
      set: { result, checkId },
    });
}

/**
 * The `listings.photo_slot_check` handler: once the photo is approved, asks whether its 640 px
 * variant shows the slot (Bedroom, Kitchen, ...). Never opens a review item; a mismatch is a
 * warning the host can keep (which sends the listing to moderation).
 */
export async function photoSlotCheck(
  db: DbOrTx,
  payload: unknown,
  now: Date,
  deps: { storage?: Storage } = {},
): Promise<void> {
  const p = slotPayload.parse(payload);
  const info = (await getMediaInfo(db, [p.mediaId])).get(p.mediaId);
  if (!info || info.status === 'rejected' || info.status === 'blocked') return;
  if (info.status === 'uploaded' || info.status === 'scanning') {
    const attempt = (p.attempt ?? 0) + 1;
    if (attempt > MEDIA_MAX_ATTEMPTS) {
      await saveSlotResult(db, p.mediaId, p.slot, 'error', null);
      return;
    }
    await enqueue(db, {
      topic: PHOTO_SLOT_CHECK_TOPIC,
      payload: { ...p, attempt },
      dedupeKey: `slot:${p.mediaId}:${p.slot}:${attempt}`,
      availableAt: new Date(now.getTime() + MEDIA_RETRY_MS),
    });
    return;
  }
  if (info.status === 'in_review') {
    const wait = (p.wait ?? 0) + 1;
    await enqueue(db, {
      topic: PHOTO_SLOT_CHECK_TOPIC,
      payload: { ...p, wait },
      dedupeKey: `slot:${p.mediaId}:${p.slot}:${p.attempt ?? 0}:w${wait}`,
      availableAt: new Date(now.getTime() + MEDIA_HOLD_WAIT_MS),
    });
    return;
  }

  const image = await readMediaVariant(db, deps.storage ?? getStorage(), p.mediaId, 640);
  if (!image) {
    await saveSlotResult(db, p.mediaId, p.slot, 'error', null);
    return;
  }
  const check = await runCheck(db, {
    kind: 'photo_slot',
    reviewQueue: null,
    subjectType: 'media',
    subjectId: p.mediaId,
    image,
    text: SLOT_LABELS[p.slot] ?? p.slot,
  });
  const result =
    check.decision === 'rejected' ? 'mismatch' : check.decision === 'approved' ? 'match' : 'error';
  await saveSlotResult(db, p.mediaId, p.slot, result, check.checkId);
}

/**
 * The `listings.resume_screening` handler (`verification.decided`): the org's listings waiting
 * at the verification stage go on to screening once verified, or are returned once failed.
 */
export async function resumeScreening(db: DbOrTx, payload: unknown, now: Date): Promise<void> {
  const env = readEnvelope(payload, 'verification.decided');
  const { orgId, status } = env.data;
  if (status !== 'verified' && status !== 'failed') return;
  const waiting = await db
    .select()
    .from(listings)
    .where(and(eq(listings.orgId, orgId), eq(listings.reviewStage, 'verification')));
  for (const l of waiting) {
    const rev = await revisionUnderReview(db, l);
    if (!rev || rev.status !== 'screening') continue;
    if (status === 'failed') {
      await rejectRevision(db, rev.id, ['verification_failed'], now);
      continue;
    }
    await db.transaction(async (tx) => {
      await setStage(tx, l.id, 'screening');
      await enqueue(tx, {
        topic: SCREEN_TOPIC,
        payload: { revisionId: rev.id, attempt: 0 },
        dedupeKey: `screen:${rev.id}:${env.eventId || newId()}`,
      });
    });
  }
}
