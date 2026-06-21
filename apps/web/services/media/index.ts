import {
  UPLOAD_ALLOWED_MIME_TYPES,
  UPLOAD_MAX_FILE_BYTES,
} from "@explore-and-earn/contracts";

/**
 * Server-side media finalization.
 *
 * The upload primitives live in `@explore-and-earn/db` (storage.ts) and run as
 * the caller under Storage RLS. This service is the server-side guard the action
 * layer calls BEFORE any storage write: it re-validates type + size against the
 * canonical media contracts so client-side checks can never be the only gate.
 *
 * (Image moderation will hook in here once the moderation provider is wired; the
 * seam is intentional so the action layer never needs to change.)
 */

export type MediaValidationResult = { ok: true } | { ok: false; error: string };

const ALLOWED_TYPES: readonly string[] = UPLOAD_ALLOWED_MIME_TYPES;

/** Validate an uploaded image file (type + size) before it reaches storage. */
export function validateUploadFile(file: File | null | undefined): MediaValidationResult {
  if (!file || typeof file === "string") {
    return { ok: false, error: "No file was provided." };
  }
  if (file.size === 0) {
    return { ok: false, error: "The uploaded file is empty." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "Please choose a JPEG, PNG, WebP, or HEIC image." };
  }
  if (file.size > UPLOAD_MAX_FILE_BYTES) {
    return { ok: false, error: "Images must be 5 MB or smaller." };
  }
  return { ok: true };
}
