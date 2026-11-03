// The scan pipeline (spec section 7, steps 3-4), run by the `media.scan` outbox job:
//   1. read the upload from quarantine;
//   2. trust the bytes, not the name: the detected type must equal the declared one and be
//      allowed for the kind, else `type_mismatch` (an SVG is never an image here);
//   3. images: re-encode (auto-rotated, no metadata) into WebP variants, run the child-safety
//      hash check (a match is `blocked`, preserved as evidence and sent to the child_safety
//      queue, and nothing else happens), then the AI safety check;
//   4. PDFs: structure and malware checks;
//   5. the file lands in its final bucket and the quarantine copy is deleted (unless blocked).
// Each run is idempotent: only a row still `scanning` is processed and settled, and every
// storage write goes to a fixed path, so a retried job converges on the same result.
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
import { openReviewItem, runCheck, type ReviewAction } from '@/modules/trust';
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

async function reject(
  db: DbOrTx,
  deps: ScanDeps,
  row: MediaRow,
  reason: RejectionReason,
  facts: Partial<Facts>,
  log: Record<string, unknown> = {},
): Promise<MediaStatus> {
  const settled = await settle(db, row.id, {
    status: 'rejected',
    rejectionReason: reason,
    ...factColumns(facts),
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

async function scanImage(
  db: DbOrTx,
  deps: ScanDeps,
  row: MediaRow,
  original: Uint8Array,
  facts: Facts,
): Promise<MediaStatus> {
  let processed: Processed;
  try {
    processed = await processImage(original);
  } catch (err) {
    // The bundled libvips cannot decode HEVC, so most HEIC photos end here.
    const reason = facts.detectedMime === 'image/heic' ? 'unsupported_format' : 'invalid_image';
    return reject(db, deps, row, reason, facts, { error: err });
  }

  const match = await deps.childSafety.scanImage(original);
  if (match.match) return block(db, deps, row, original, facts, match);

  // The classifier sees the largest re-encoded variant: no metadata, a format and size the
  // model accepts, and the same pixels the public will see.
  const largest = processed.variants[processed.variants.length - 1];
  if (!largest) throw new Error('No image variants were produced');
  const wantAltText = ALT_TEXT_KINDS.includes(row.kind);
  const check = await runCheck(db, {
    kind: 'image_safety',
    subjectType: 'media',
    subjectId: row.id,
    image: { mime: 'image/webp', bytes: largest.bytes },
    wantAltText,
  });
  if (check.decision === 'rejected') {
    return reject(db, deps, row, 'unsafe_content', facts, { checkId: check.checkId });
  }

  // Held for review in the private bucket, where only the owner and operators can see it.
  const approved = check.decision === 'approved';
  const bucket = approved ? destinationBucket(row.kind) : 'media-private';
  const variants = variantPaths(row.id);
  for (const v of processed.variants) {
    const objectPath = variants[String(v.width)];
    if (objectPath) await deps.storage.write(bucket, objectPath, v.bytes, 'image/webp');
  }

  const status = approved ? 'approved' : 'in_review';
  const settled = await settle(db, row.id, {
    status,
    bucket,
    path: row.id,
    variants,
    width: processed.width,
    height: processed.height,
    altText: wantAltText ? (check.altText ?? null) : null,
    ...factColumns(facts),
  });
  if (!settled) return statusOf(db, row.id);
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

/** Deletes objects once the caller's transaction commits (they may still be needed if not). */
async function enqueueCleanup(db: DbOrTx, objects: ObjectRef[]): Promise<void> {
  if (objects.length > 0) await enqueue(db, { topic: CLEANUP_TOPIC, payload: { objects } });
}

/** `approve` on a held file: it is published to its final bucket. */
export async function approveHeldMedia(
  db: DbOrTx,
  storage: Storage,
  mediaId: string,
): Promise<void> {
  const row = await lockRow(db, mediaId);
  if (row.status === 'approved') return;
  if (row.status !== 'in_review') {
    throw conflict(`Media ${mediaId} is ${row.status}, not in review`);
  }

  const from = row.bucket;
  const to = destinationBucket(row.kind);
  const paths = objectPathsOf(row);
  if (to === from) {
    await db.update(media).set({ status: 'approved' }).where(eq(media.id, mediaId));
    return;
  }
  for (const p of paths) await storage.copy({ bucket: from, path: p }, { bucket: to, path: p });
  await db.update(media).set({ status: 'approved', bucket: to }).where(eq(media.id, mediaId));
  await enqueueCleanup(
    db,
    paths.map((p) => ({ bucket: from, path: p })),
  );
}

/** `remove` on a held or published file: it is rejected and its copies deleted. */
export async function removeMedia(db: DbOrTx, mediaId: string): Promise<void> {
  const row = await lockRow(db, mediaId);
  if (row.status === 'rejected') return;
  if (row.status === 'blocked') {
    throw conflict('Blocked media is preserved as evidence and cannot be removed here');
  }
  if (row.status !== 'in_review' && row.status !== 'approved') {
    throw conflict(`Media ${mediaId} is still ${row.status}`);
  }

  await db
    .update(media)
    .set({ status: 'rejected', rejectionReason: 'removed_by_operator' })
    .where(eq(media.id, mediaId));
  await enqueueCleanup(
    db,
    objectPathsOf(row).map((p) => ({ bucket: row.bucket, path: p })),
  );
}

type SubjectHandlers = Partial<
  Record<ReviewAction, (db: DbOrTx, subjectId: string, data?: unknown) => Promise<void>>
>;

/** What trust's decisions do to a `media` subject. `storage` is read when a decision runs. */
export function createMediaSubjectHandlers(storage: () => Storage): SubjectHandlers {
  return {
    approve: (db, subjectId) => approveHeldMedia(db, storage(), subjectId),
    remove: (db, subjectId) => removeMedia(db, subjectId),
  };
}

// --- Jobs ---------------------------------------------------------------------------------

const scanPayload = z.object({ mediaId: z.string() });
const cleanupPayload = z.object({
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
  [CLEANUP_TOPIC]: async (payload) => {
    const { objects } = cleanupPayload.parse(payload);
    const storage = getStorage();
    for (const o of objects) await storage.remove(o.bucket, o.path);
  },
};
