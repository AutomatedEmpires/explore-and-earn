import "server-only";

import {
  deleteTrustedListingMedia,
  listTrustedListingMedia,
} from "@explore-and-earn/db";

import { checkRateLimitDistributed } from "../../lib/rateLimit";

/**
 * One persisted photo plus three short-lived replacement attempts is enough for
 * the editor while putting a durable ceiling on abandoned public objects.
 */
export const TRUSTED_UPLOAD_SLOT_OBJECT_LIMIT = 4;

/** An editor session must not keep an unbound public object forever. */
export const TRUSTED_UPLOAD_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000;

const LIST_PAGE_LIMIT = 100;
const MAX_SWEEP_PER_REQUEST = 32;
const DELETE_CONCURRENCY = 4;
const VERSIONED_WEBP_PATH =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/i;

const TRUSTED_UPLOAD_RATE_LIMIT = 30;
const TRUSTED_UPLOAD_RATE_WINDOW_MS = 15 * 60 * 1000;

export type TrustedUploadSlotGuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string };

export interface TrustedUploadSlotGuardInput {
  /** Exact object folder for one host/listing/kind/slot. */
  readonly prefix: string;
  /** Exact object paths currently persisted by the authoritative DB read. */
  readonly referencedPaths: ReadonlySet<string>;
  /** Injectable clock for deterministic expiry tests. */
  readonly nowMs?: number;
}

/** Fleet-wide when KV is configured, with the repository's local fallback. */
export async function hasTrustedUploadBudget(userId: string): Promise<boolean> {
  return (
    await checkRateLimitDistributed(
      `trusted-photo-upload:${userId}`,
      TRUSTED_UPLOAD_RATE_LIMIT,
      TRUSTED_UPLOAD_RATE_WINDOW_MS,
    )
  ).allowed;
}

function isExpiredVersionedUpload(
  object: { readonly path: string; readonly createdAt: string | null },
  referencedPaths: ReadonlySet<string>,
  cutoffMs: number,
): boolean {
  if (referencedPaths.has(object.path) || !VERSIONED_WEBP_PATH.test(object.path)) {
    return false;
  }
  if (!object.createdAt) return false;
  const createdAtMs = Date.parse(object.createdAt);
  return Number.isFinite(createdAtMs) && createdAtMs <= cutoffMs;
}

/**
 * Reclaim expired unbound uploads and enforce a shared Storage-backed slot cap.
 *
 * This runs before Sharp so direct Server Action calls cannot spend decode CPU
 * or grow a slot once its durable allowance is full. Deletion is conservative:
 * only action-generated UUID WebPs older than the TTL and absent from the
 * authoritative reference set are candidates. Database reference triggers are
 * the final race-proof backstop if a concurrent save binds one during cleanup.
 */
export async function guardTrustedUploadSlot(
  input: TrustedUploadSlotGuardInput,
): Promise<TrustedUploadSlotGuardResult> {
  const nowMs = input.nowMs ?? Date.now();
  const cutoffMs = nowMs - TRUSTED_UPLOAD_ORPHAN_TTL_MS;
  const objects = await listTrustedListingMedia(input.prefix, LIST_PAGE_LIMIT);
  const expired = objects
    .filter((object) =>
      isExpiredVersionedUpload(object, input.referencedPaths, cutoffMs),
    )
    .slice(0, MAX_SWEEP_PER_REQUEST);

  for (let offset = 0; offset < expired.length; offset += DELETE_CONCURRENCY) {
    await Promise.allSettled(
      expired
        .slice(offset, offset + DELETE_CONCURRENCY)
        .map((object) => deleteTrustedListingMedia(object.path)),
    );
  }

  // Re-list after cleanup. Missing timestamps, failed deletes, and unexpected
  // entries count against capacity so a malformed bucket state fails closed.
  const remaining = await listTrustedListingMedia(
    input.prefix,
    TRUSTED_UPLOAD_SLOT_OBJECT_LIMIT + 1,
  );
  if (remaining.length >= TRUSTED_UPLOAD_SLOT_OBJECT_LIMIT) {
    return {
      ok: false,
      error:
        "This photo slot has too many pending uploads. Try again after older uploads expire.",
    };
  }

  return { ok: true };
}
