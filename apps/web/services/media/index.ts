import {
  SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES,
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
const ALLOWED_DECODED_FORMATS = new Set(["jpeg", "png", "webp", "heif"]);
const MAX_INPUT_PIXELS = 40_000_000;

const WEBP_ATTEMPTS = [
  { dimension: 2400, quality: 86 },
  { dimension: 2100, quality: 78 },
  { dimension: 1800, quality: 68 },
  { dimension: 1500, quality: 58 },
] as const;

export interface PreparedUploadImage {
  readonly bytes: Uint8Array;
  readonly contentType: "image/webp";
}

export type PrepareUploadImageResult =
  | { readonly ok: true; readonly image: PreparedUploadImage }
  | { readonly ok: false; readonly error: string };

export interface PrepareUploadImageOptions {
  /** Optional stricter ceiling, primarily useful to exercise the pixel guard. */
  readonly maxInputPixels?: number;
}

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
  if (file.size > SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES) {
    return { ok: false, error: "Images must be 4 MB or smaller." };
  }
  return { ok: true };
}

/**
 * Decode and normalize an untrusted upload before it reaches public Storage.
 *
 * Sharp validates the actual bytes (not only the caller-controlled MIME), caps
 * decompression, applies EXIF orientation, and re-encodes without source
 * metadata. A bounded set of resize/quality attempts guarantees every returned
 * WebP is non-empty and no larger than the canonical 5 MiB limit.
 */
export async function prepareUploadImage(
  file: File | null | undefined,
  options: PrepareUploadImageOptions = {},
): Promise<PrepareUploadImageResult> {
  const valid = validateUploadFile(file);
  if (!valid.ok) return valid;
  // validateUploadFile intentionally returns a serializable result rather than
  // a type predicate, so retain an explicit guard for TypeScript as well.
  if (!file) return { ok: false, error: "No file was provided." };

  const requestedPixelLimit = Math.floor(options.maxInputPixels ?? MAX_INPUT_PIXELS);
  const pixelLimit = Math.min(Math.max(requestedPixelLimit, 1), MAX_INPUT_PIXELS);

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const { default: sharp } = await import("sharp");
    const probe = sharp(input, {
      failOn: "error",
      limitInputPixels: pixelLimit,
      sequentialRead: true,
    });
    const metadata = await probe.metadata();
    if (
      !metadata.format ||
      !ALLOWED_DECODED_FORMATS.has(metadata.format) ||
      !metadata.width ||
      !metadata.height ||
      metadata.width * metadata.height > pixelLimit ||
      (metadata.pages ?? 1) !== 1
    ) {
      return { ok: false, error: "Please choose a valid, non-animated image." };
    }

    for (const attempt of WEBP_ATTEMPTS) {
      const output = await sharp(input, {
        failOn: "error",
        limitInputPixels: pixelLimit,
        sequentialRead: true,
      })
        .rotate()
        .resize({
          width: attempt.dimension,
          height: attempt.dimension,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: attempt.quality, effort: 4, smartSubsample: true })
        .toBuffer();

      if (output.byteLength > 0 && output.byteLength <= UPLOAD_MAX_FILE_BYTES) {
        return {
          ok: true,
          image: {
            bytes: Uint8Array.from(output),
            contentType: "image/webp",
          },
        };
      }
    }
  } catch {
    // Decoder errors and decompression-limit violations share a safe message.
  }

  return {
    ok: false,
    error: "This image could not be safely processed. Try a smaller JPEG, PNG, WebP, or HEIC.",
  };
}
