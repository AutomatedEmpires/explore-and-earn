// Upload requests and completion (spec section 7, steps 1-2). The client asks for a signed URL,
// uploads the file straight into the private `quarantine` bucket, then calls complete, which
// queues the scan. Nothing is readable by anyone until the scan approves it.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { enqueue } from '@/modules/jobs';
import { allowsMime, canonicalMime, KIND_RULES, MEDIA_KINDS, type MediaKind } from './kinds';
import { media } from './schema';
import type { Storage } from './storage';

/** Who is uploading: the user, and the host organization the file belongs to, if any. */
export type UploadActor = { userId: string; orgId?: string };

export type UploadRequest = { kind: MediaKind; mime: string; sizeBytes: number };

export const uploadRequestSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  mime: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive(),
});

export const SCAN_TOPIC = 'media.scan';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Checks the declared type and size against KIND_RULES, creates the `app.media` row (status
 * `uploaded`, object `quarantine/<mediaId>`) and returns a signed upload URL for it.
 * Throws `bad_request` for a type the kind doesn't allow (SVG never is) or a file too large.
 */
export async function requestUpload(
  db: DbOrTx,
  storage: Storage,
  actor: UploadActor,
  i: UploadRequest,
): Promise<{ mediaId: string; uploadUrl: string; token: string }> {
  const parsed = uploadRequestSchema.safeParse(i);
  if (!parsed.success) throw badRequest('Invalid upload request', parsed.error.issues);
  const { kind, sizeBytes } = parsed.data;
  const mime = canonicalMime(parsed.data.mime);
  const rule = KIND_RULES[kind];

  if (!allowsMime(kind, mime)) {
    throw badRequest(`A ${kind} cannot be ${mime || 'that type'}`, { allowed: rule.mimes });
  }
  if (sizeBytes > rule.maxBytes) {
    throw badRequest(`A ${kind} can be at most ${rule.maxBytes} bytes`, {
      maxBytes: rule.maxBytes,
    });
  }

  const mediaId = newId();
  const { url, token } = await storage.signedUploadUrl('quarantine', mediaId);
  await db.insert(media).values({
    id: mediaId,
    ownerUserId: actor.userId,
    ownerOrgId: actor.orgId ?? null,
    kind,
    status: 'uploaded',
    bucket: 'quarantine',
    path: mediaId,
    declaredMime: mime,
    sizeBytes,
  });
  return { mediaId, uploadUrl: url, token };
}

/**
 * The owner says the upload finished: the file moves to `scanning` and a `media.scan` job is
 * queued in the same transaction (dedupe key `scan:<id>`). Calling it again is a no-op.
 * Throws `not_found` for an unknown id and `forbidden` for anyone but the owner. Call
 * `kickWorker()` after it returns to scan right away.
 */
export async function completeUpload(
  db: DbOrTx,
  actor: UploadActor,
  mediaId: string,
): Promise<void> {
  if (!isUuid(mediaId)) throw notFound('Media not found');

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ ownerUserId: media.ownerUserId, status: media.status })
      .from(media)
      .where(eq(media.id, mediaId))
      .for('update');
    if (!row) throw notFound('Media not found');
    if (row.ownerUserId !== actor.userId) throw forbidden('Only the uploader can complete it');
    if (row.status !== 'uploaded') return;

    await tx.update(media).set({ status: 'scanning' }).where(eq(media.id, mediaId));
    await enqueue(tx, { topic: SCAN_TOPIC, payload: { mediaId }, dedupeKey: `scan:${mediaId}` });
  });
}
