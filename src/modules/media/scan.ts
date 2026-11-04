// The scan pipeline (spec section 7, steps 3-4), run by the `media.scan` outbox job:
//   1. read the upload from quarantine;
//   2. trust the bytes, not the name: the detected type must equal the declared one and be
//      allowed for the kind, else `type_mismatch` (an SVG is never an image here);
//   3. images: run the child-safety hash check on the original bytes before anything can
//      reject them (a match is `blocked`, preserved as evidence and sent to the child_safety
//      queue, and nothing else happens; a recognised image the scanner cannot read is held for
//      review, never deleted unchecked; bytes nothing can decode are rejected `invalid_image`,
//      as the re-encode would), then re-encode (auto-rotated, no metadata) into WebP
//      variants, then the AI safety check;
//   4. PDFs: structure and malware checks;
//   5. the file lands in its final bucket and the quarantine copy is deleted (unless blocked
//      or unreadable by the scanner). An image the classifier rejects is kept in
//      media-private, never served to its owner, so an operator can still overturn it.
// Each run is idempotent: only a row still `scanning` is processed and settled, every storage
// write goes to a fixed path, and the AI check is reused once stored, so a retried job
// converges on the same result with one check and one review item.
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { conflict, isAppError, notFound } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import { enqueue, type HandlerMap } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import {
  findLatestCheck,
  openReviewItem,
  runCheck,
  type CheckResult,
  type ReviewAction,
} from '@/modules/trust';
import {
  allowsMime,
  ALT_TEXT_KINDS,
  BUCKETS,
  canonicalMime,
  isImageMime,
  KIND_RULES,
  PRIVATE_KINDS,
  VARIANT_WIDTHS,
  type Bucket,
  type MediaKind,
  type MediaStatus,
  type RejectionReason,
  type VariantWidth,
} from './kinds';
import {
  getChildSafetyScanner,
  getMalwareScanner,
  UndecodableImageError,
  UnscannableImageError,
  type ChildSafetyScanner,
  type MalwareScanner,
} from './scanners';
import { media } from './schema';
import { getStorage, ObjectNotFoundError, type ObjectRef, type Storage } from './storage';
import { isUuid, SCAN_TOPIC } from './uploads';

export type ScanDeps = {
  storage: Storage;
  childSafety: ChildSafetyScanner;
  malware: MalwareScanner;
};

export const CLEANUP_TOPIC = 'media.cleanup';

/** The review reason for an image the child-safety scanner cannot read. */
export const UNSCANNABLE_REASON = 'child_safety_unscannable';

/** Rejections whose file is kept (in media-private), so an operator can still publish it. */
const RESTORABLE: readonly RejectionReason[] = ['unsafe_content', 'removed_by_operator'];

/** Larger inputs are decompression bombs, not photos (about 100 megapixels). */
const MAX_INPUT_PIXELS = 100_000_000;
const WEBP_QUALITY = 82;
/** `%%EOF` must appear this close to the end of a PDF. */
const PDF_EOF_WINDOW = 4096;

type MediaRow = typeof media.$inferSelect;
type MediaUpdate = Partial<typeof media.$inferInsert>;
type Facts = { sizeBytes: number; sha256: string; detectedMime?: string | null };

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Where an image's WebP variants live, inside whichever bucket holds them. */
export function variantPaths(mediaId: string): Record<string, string> {
  return Object.fromEntries(VARIANT_WIDTHS.map((w) => [String(w), `${mediaId}/${w}.webp`]));
}

/** The bucket an approved file of this kind is served from. */
export function destinationBucket(kind: MediaKind): Bucket {
  return PRIVATE_KINDS.includes(kind) ? 'media-private' : 'media-public';
}

/** Every stored object of a scanned file, in its current bucket. */
function objectPathsOf(row: MediaRow): string[] {
  return row.variants ? Object.values(row.variants) : [row.path];
}

function factColumns(facts: Partial<Facts>): MediaUpdate {
  const set: MediaUpdate = {};
  if (facts.sizeBytes !== undefined) set.sizeBytes = facts.sizeBytes;
  if (facts.sha256 !== undefined) set.sha256 = facts.sha256;
  if (facts.detectedMime !== undefined) set.detectedMime = facts.detectedMime;
  return set;
}

/** Settles a row that is still `scanning`. False when another run already settled it. */
async function settle(db: DbOrTx, mediaId: string, set: MediaUpdate): Promise<boolean> {
  const rows = await db
    .update(media)
    .set(set)
    .where(and(eq(media.id, mediaId), eq(media.status, 'scanning')))
    .returning({ id: media.id });
  return rows.length > 0;
}

async function statusOf(db: DbOrTx, mediaId: string): Promise<MediaStatus> {
  const [row] = await db.select({ status: media.status }).from(media).where(eq(media.id, mediaId));
  if (!row) throw notFound(`Media ${mediaId} not found`);
  return row.status;
}

async function removeQuietly(storage: Storage, bucket: Bucket, objectPath: string) {
  try {
    await storage.remove(bucket, objectPath);
  } catch (err) {
    logger.warn('media: could not delete an object', { bucket, path: objectPath, error: err });
  }
}

/**
 * Tells the uploader why their file was rejected (spec section 7, step 4), in the transaction
 * that settles it, so they are told exactly once. Never used for a child-safety block.
 */
async function tellRejected(db: DbOrTx, row: MediaRow, reason: RejectionReason): Promise<void> {
  await notify(db, row.ownerUserId, 'media.rejected', {
    mediaId: row.id,
    kind: row.kind,
    reason,
  });
}

async function reject(
  db: DbOrTx,
  deps: ScanDeps,
  row: MediaRow,
  reason: RejectionReason,
  facts: Partial<Facts>,
  log: Record<string, unknown> = {},
): Promise<MediaStatus> {
  const settled = await db.transaction(async (tx) => {
    const done = await settle(tx, row.id, {
      status: 'rejected',
      rejectionReason: reason,
      ...factColumns(facts),
    });
    if (done) await tellRejected(tx, row, reason);
    return done;
  });
  if (!settled) return statusOf(db, row.id);
  logger.info('media rejected', { mediaId: row.id, kind: row.kind, reason, ...log });
  await removeQuietly(deps.storage, 'quarantine', row.path);
  return 'rejected';
}

type Processed = {
  width: number;
  height: number;
  variants: { width: VariantWidth; bytes: Uint8Array }[];
};

/** Auto-rotated WebP variants with no metadata (EXIF, GPS, XMP and ICC are all dropped). */
async function processImage(bytes: Uint8Array): Promise<Processed> {
  const options = { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' as const };
  const meta = await sharp(bytes, options).metadata();
  const width = meta.autoOrient?.width ?? meta.width;
  const height = meta.autoOrient?.height ?? meta.height;
  if (!width || !height) throw new Error('The image has no dimensions');

  const variants: Processed['variants'] = [];
  for (const w of VARIANT_WIDTHS) {
    const out = await sharp(bytes, options)
      .rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    variants.push({ width: w, bytes: new Uint8Array(out) });
  }
  return { width, height, variants };
}

async function block(
  db: DbOrTx,
  deps: ScanDeps,
  row: MediaRow,
  original: Uint8Array,
  facts: Facts,
  match: { provider: string; reference?: string },
): Promise<MediaStatus> {
  // Preserve the original first; the quarantine copy is kept as well.
  await deps.storage.write('evidence', row.id, original, facts.detectedMime ?? row.declaredMime);

  let settled = false;
  await db.transaction(async (tx) => {
    settled = await settle(tx, row.id, {
      status: 'blocked',
      bucket: 'evidence',
      path: row.id,
      ...factColumns(facts),
    });
    if (!settled) return;
    await openReviewItem(tx, {
      queue: 'child_safety',
      subjectType: 'media',
      subjectId: row.id,
      reason: 'child_safety_match',
      priority: 1000,
    });
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: row.ownerOrgId,
      action: 'media.blocked',
      subjectType: 'media',
      subjectId: row.id,
      data: {
        provider: match.provider,
        reference: match.reference ?? null,
        sha256: facts.sha256,
        ownerUserId: row.ownerUserId,
      },
    });
  });
  if (!settled) return statusOf(db, row.id);
  logger.error('media blocked: child-safety match', { mediaId: row.id, provider: match.provider });
  return 'blocked';
}

/**
 * Fails closed when the child-safety scanner cannot read the image: the file is never deleted
 * (or published) unchecked. The original stays in quarantine, where nothing serves it, the
 * file is held `in_review`, and a moderation item asks an operator to decide. It can only be
 * removed: approveHeldMedia refuses a file still in quarantine.
 */
async function holdUnscannable(
  db: DbOrTx,
  row: MediaRow,
  facts: Facts,
  err: UnscannableImageError,
): Promise<MediaStatus> {
  let settled = false;
  await db.transaction(async (tx) => {
    settled = await settle(tx, row.id, { status: 'in_review', ...factColumns(facts) });
    if (!settled) return;
    await openReviewItem(tx, {
      queue: 'moderation',
      subjectType: 'media',
      subjectId: row.id,
      reason: UNSCANNABLE_REASON,
    });
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: row.ownerOrgId,
      action: 'media.held_unscannable',
      subjectType: 'media',
      subjectId: row.id,
      data: {
        sha256: facts.sha256,
        detectedMime: facts.detectedMime ?? null,
        ownerUserId: row.ownerUserId,
      },
    });
  });
  if (!settled) return statusOf(db, row.id);
  logger.warn('media held: the child-safety scanner cannot read it', {
    mediaId: row.id,
    mime: facts.detectedMime,
    error: err,
  });
  return 'in_review';
}

/**
 * The image's AI safety check, once per scan. A scan is retried when a later step fails (a
 * storage write, the settle) after the check was stored; the retry reuses that check, with
 * the review item it opened and its alt text, rather than store a second check and open a
 * second item. A file is `scanning` only once, so any image check of it is this scan's.
 */
async function imageCheck(
  db: DbOrTx,
  mediaId: string,
  image: Uint8Array,
  wantAltText: boolean,
): Promise<CheckResult> {
  const subject = { kind: 'image_safety', subjectType: 'media', subjectId: mediaId } as const;
  const earlier = await findLatestCheck(db, subject);
  if (earlier) return earlier;
  return runCheck(db, { ...subject, image: { mime: 'image/webp', bytes: image }, wantAltText });
}

async function scanImage(
  db: DbOrTx,
  deps: ScanDeps,
  row: MediaRow,
  original: Uint8Array,
  facts: Facts,
): Promise<MediaStatus> {
  // The bundled libvips cannot decode HEVC, so most HEIC photos that fail to decode are that.
  const undecodable = facts.detectedMime === 'image/heic' ? 'unsupported_format' : 'invalid_image';

  // The hash check comes first, on the original bytes, so a file that fails to decode below
  // has still been checked before its original is deleted. A scanner that cannot even read
  // the header (no image at all) rejects it the same way the re-encode would.
  let match: Awaited<ReturnType<ChildSafetyScanner['scanImage']>>;
  try {
    match = await deps.childSafety.scanImage(original);
  } catch (err) {
    if (err instanceof UnscannableImageError) return holdUnscannable(db, row, facts, err);
    if (err instanceof UndecodableImageError) {
      return reject(db, deps, row, undecodable, facts, { error: err });
    }
    throw err;
  }
  if (match.match) return block(db, deps, row, original, facts, match);

  let processed: Processed;
  try {
    processed = await processImage(original);
  } catch (err) {
    return reject(db, deps, row, undecodable, facts, { error: err });
  }

  // The classifier sees the largest re-encoded variant: no metadata, a format and size the
  // model accepts, and the same pixels the public will see.
  const largest = processed.variants[processed.variants.length - 1];
  if (!largest) throw new Error('No image variants were produced');
  const wantAltText = ALT_TEXT_KINDS.includes(row.kind);
  const check = await imageCheck(db, row.id, largest.bytes, wantAltText);

  // Approved: the final bucket. Held for review: media-private, for the owner and operators.
  // Rejected: media-private too, for operators only, so an accuracy sample or an appeal can
  // still publish it.
  const status: MediaStatus =
    check.decision === 'approved'
      ? 'approved'
      : check.decision === 'rejected'
        ? 'rejected'
        : 'in_review';
  const bucket = status === 'approved' ? destinationBucket(row.kind) : 'media-private';
  const variants = variantPaths(row.id);
  for (const v of processed.variants) {
    const objectPath = variants[String(v.width)];
    if (objectPath) await deps.storage.write(bucket, objectPath, v.bytes, 'image/webp');
  }

  const settled = await db.transaction(async (tx) => {
    const done = await settle(tx, row.id, {
      status,
      ...(status === 'rejected'
        ? { rejectionReason: 'unsafe_content' satisfies RejectionReason }
        : {}),
      bucket,
      path: row.id,
      variants,
      width: processed.width,
      height: processed.height,
      altText: wantAltText ? (check.altText ?? null) : null,
      ...factColumns(facts),
    });
    if (done && status === 'rejected') await tellRejected(tx, row, 'unsafe_content');
    return done;
  });
  if (!settled) return statusOf(db, row.id);
  if (status === 'rejected') {
    logger.info('media rejected', {
      mediaId: row.id,
      kind: row.kind,
      reason: 'unsafe_content',
      checkId: check.checkId,
    });
  }
  await removeQuietly(deps.storage, 'quarantine', row.path);
  return status;
}

function looksLikePdf(bytes: Uint8Array): boolean {
  const tail = Buffer.from(bytes.subarray(Math.max(0, bytes.byteLength - PDF_EOF_WINDOW)));
  return tail.includes('%%EOF');
}

async function scanPdf(
  db: DbOrTx,
  deps: ScanDeps,
  row: MediaRow,
  original: Uint8Array,
  facts: Facts,
): Promise<MediaStatus> {
  if (!looksLikePdf(original)) return reject(db, deps, row, 'invalid_pdf', facts);

  const verdict = await deps.malware.scanFile(original, `${row.id}.pdf`);
  if (!verdict.clean) {
    return reject(db, deps, row, 'malware', facts, { threat: verdict.threat ?? 'unknown' });
  }

  // Write the bytes that were scanned (not a copy of the quarantine object, which the
  // uploader could replace between the scan and the copy).
  const objectPath = `${row.id}.pdf`;
  await deps.storage.write('media-private', objectPath, original, 'application/pdf');
  const settled = await settle(db, row.id, {
    status: 'approved',
    bucket: 'media-private',
    path: objectPath,
    ...factColumns(facts),
  });
  if (!settled) return statusOf(db, row.id);
  await removeQuietly(deps.storage, 'quarantine', row.path);
  return 'approved';
}

/**
 * Scans one upload and returns its resulting status. A file that is not `scanning` (already
 * scanned, or never completed) is left alone and its status returned. Throws `not_found` for
 * an unknown id; storage and scanner failures throw too, so the job retries.
 */
export async function scanMedia(db: DbOrTx, deps: ScanDeps, mediaId: string): Promise<MediaStatus> {
  if (!isUuid(mediaId)) throw notFound(`Media ${mediaId} not found`);
  const [row] = await db.select().from(media).where(eq(media.id, mediaId));
  if (!row) throw notFound(`Media ${mediaId} not found`);
  if (row.status !== 'scanning') return row.status;

  let original: Uint8Array;
  try {
    original = await deps.storage.read('quarantine', row.path);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return reject(db, deps, row, 'missing_file', {});
    throw err;
  }

  const facts: Facts = { sizeBytes: original.byteLength, sha256: sha256(original) };
  if (facts.sizeBytes === 0) return reject(db, deps, row, 'missing_file', {});
  if (facts.sizeBytes > KIND_RULES[row.kind].maxBytes) {
    return reject(db, deps, row, 'too_large', facts);
  }

  const detected = await fileTypeFromBuffer(original);
  facts.detectedMime = detected ? canonicalMime(detected.mime) : null;
  const mime = facts.detectedMime;
  if (!mime || mime !== row.declaredMime || !allowsMime(row.kind, mime)) {
    return reject(db, deps, row, 'type_mismatch', facts, { declared: row.declaredMime });
  }

  return isImageMime(mime)
    ? scanImage(db, deps, row, original, facts)
    : scanPdf(db, deps, row, original, facts);
}

/** The configured storage and scanners (STORAGE_PROVIDER, CHILD_SAFETY_PROVIDER, ...). */
export function defaultScanDeps(): ScanDeps {
  return {
    storage: getStorage(),
    childSafety: getChildSafetyScanner(),
    malware: getMalwareScanner(),
  };
}

// --- Operator decisions on held files (trust subject `media`) ------------------------------

async function lockRow(db: DbOrTx, mediaId: string): Promise<MediaRow> {
  if (!isUuid(mediaId)) throw notFound(`Media ${mediaId} not found`);
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).for('update');
  if (!row) throw notFound(`Media ${mediaId} not found`);
  return row;
}

/**
 * Deletes a file's superseded copies once the caller's transaction commits (they may still be
 * needed if not). The job keeps any copy the file uses again by the time it runs (see
 * cleanupMedia).
 */
async function enqueueCleanup(db: DbOrTx, mediaId: string, objects: ObjectRef[]): Promise<void> {
  if (objects.length > 0) {
    await enqueue(db, { topic: CLEANUP_TOPIC, payload: { mediaId, objects } });
  }
}

/** The objects a file still uses: its copies in its bucket, unless it can never be used. */
function liveObjects(row: MediaRow | undefined): Set<string> {
  // A rejected file still in quarantine was never scanned, so it can never be published.
  if (!row || (row.status === 'rejected' && row.bucket === 'quarantine')) return new Set();
  return new Set(objectPathsOf(row).map((p) => `${row.bucket}/${p}`));
}

/**
 * The `media.cleanup` job. Paths are fixed per file, so a copy queued for deletion can be in use
 * again when the job runs: removed (public copies queued), then restored by an appeal to the
 * same paths before the job ran. The row stays locked while the job deletes, so no decision
 * moves the file in between, and every copy the file uses now is kept.
 */
async function cleanupMedia(
  db: DbOrTx,
  storage: Storage,
  mediaId: string | undefined,
  objects: ObjectRef[],
): Promise<void> {
  await db.transaction(async (tx) => {
    let live = new Set<string>();
    if (mediaId !== undefined && isUuid(mediaId)) {
      const [row] = await tx.select().from(media).where(eq(media.id, mediaId)).for('update');
      live = liveObjects(row);
    }
    for (const o of objects) {
      if (!live.has(`${o.bucket}/${o.path}`)) await storage.remove(o.bucket, o.path);
    }
  });
}

/** Why an operator cannot publish this file, or null when they can. */
function whyNotPublishable(row: MediaRow): string | null {
  switch (row.status) {
    case 'in_review':
      return row.bucket === 'quarantine'
        ? 'This file could not be checked for child safety, so it can never be published'
        : null;
    case 'rejected':
      return row.bucket === 'media-private' &&
        (RESTORABLE as readonly (string | null)[]).includes(row.rejectionReason)
        ? null
        : `This file was rejected (${row.rejectionReason ?? 'unknown'}) and not kept; ask for a new upload`;
    case 'blocked':
      return 'A child-safety match is preserved as evidence and is never published';
    default:
      return `Media ${row.id} is still ${row.status}`;
  }
}

/**
 * `approve`: a held file is published to its final bucket. So is a rejected one that was kept
 * (rejected by the classifier, or removed by an operator), when an accuracy sample or an
 * appeal overturns that. Throws `conflict` for anything else, a blocked file above all.
 */
export async function approveHeldMedia(
  db: DbOrTx,
  storage: Storage,
  mediaId: string,
): Promise<void> {
  const row = await lockRow(db, mediaId);
  if (row.status === 'approved') return;
  const refusal = whyNotPublishable(row);
  if (refusal) throw conflict(refusal);

  const from = row.bucket;
  const to = destinationBucket(row.kind);
  const paths = objectPathsOf(row);
  const approved = { status: 'approved', rejectionReason: null } as const;
  if (to === from) {
    await db.update(media).set(approved).where(eq(media.id, mediaId));
    return;
  }
  for (const p of paths) await storage.copy({ bucket: from, path: p }, { bucket: to, path: p });
  await db
    .update(media)
    .set({ ...approved, bucket: to })
    .where(eq(media.id, mediaId));
  await enqueueCleanup(
    db,
    mediaId,
    paths.map((p) => ({ bucket: from, path: p })),
  );
}

/**
 * `remove`: a held or published file is rejected (`removed_by_operator`) and taken down. Its
 * copies are kept in media-private, never served to its owner, so an appeal can publish it
 * again; a held file the scanner could not read is deleted instead. The owner is told, in the
 * caller's transaction. On a blocked file (a child-safety match) it confirms the block: nothing
 * changes, the evidence stays and nobody is told; nor is anyone told again when a removal is
 * upheld.
 */
export async function removeMedia(db: DbOrTx, storage: Storage, mediaId: string): Promise<void> {
  const row = await lockRow(db, mediaId);
  if (row.status === 'rejected' || row.status === 'blocked') return;
  if (row.status !== 'in_review' && row.status !== 'approved') {
    throw conflict(`Media ${mediaId} is still ${row.status}`);
  }

  const paths = objectPathsOf(row);
  let bucket = row.bucket;
  if (row.bucket === 'media-public') {
    for (const p of paths) {
      await storage.copy({ bucket: 'media-public', path: p }, { bucket: 'media-private', path: p });
    }
    bucket = 'media-private';
  }
  await db
    .update(media)
    .set({ status: 'rejected', rejectionReason: 'removed_by_operator', bucket })
    .where(eq(media.id, mediaId));
  await tellRejected(db, row, 'removed_by_operator');
  // The public copies are superseded by the private ones; an unscanned original is not kept.
  if (bucket !== row.bucket || row.bucket === 'quarantine') {
    await enqueueCleanup(
      db,
      mediaId,
      paths.map((p) => ({ bucket: row.bucket, path: p })),
    );
  }
}

type SubjectHandlers = Partial<
  Record<ReviewAction, (db: DbOrTx, subjectId: string, data?: unknown) => Promise<void>>
>;

/**
 * What trust's decisions do to a `media` subject, in every state an item can find it: a held
 * file (moderation), a published one (reports), a blocked one (child_safety: `remove` confirms
 * the block), a removed or rejected one (appeals, audit_sample: `approve` publishes it, `remove`
 * upholds it). `storage` is read when a decision runs.
 */
export function createMediaSubjectHandlers(storage: () => Storage): SubjectHandlers {
  return {
    approve: (db, subjectId) => approveHeldMedia(db, storage(), subjectId),
    remove: (db, subjectId) => removeMedia(db, storage(), subjectId),
  };
}

// --- Jobs ---------------------------------------------------------------------------------

const scanPayload = z.object({ mediaId: z.string() });
const cleanupPayload = z.object({
  /** Absent in jobs queued before the copies were checked against the file. */
  mediaId: z.string().optional(),
  objects: z.array(z.object({ bucket: z.enum(BUCKETS), path: z.string().min(1) })),
});

export const mediaJobHandlers: HandlerMap = {
  [SCAN_TOPIC]: async (payload, { db }) => {
    const { mediaId } = scanPayload.parse(payload);
    try {
      await scanMedia(db, defaultScanDeps(), mediaId);
    } catch (err) {
      if (isAppError(err) && err.code === 'not_found') {
        logger.warn('media.scan: no such media; dropping the job', { mediaId });
        return;
      }
      throw err;
    }
  },
  [CLEANUP_TOPIC]: async (payload, { db }) => {
    const { mediaId, objects } = cleanupPayload.parse(payload);
    await cleanupMedia(db, getStorage(), mediaId, objects);
  },
};
