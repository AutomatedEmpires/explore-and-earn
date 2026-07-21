import "server-only";

import { UPLOAD_MAX_FILE_BYTES } from "@explore-and-earn/contracts";

import { adminClient } from "./adminClient";
import { LISTING_MEDIA_BUCKET } from "./storage";

const TRUSTED_IMAGE_CONTENT_TYPE = "image/webp" as const;

export interface TrustedListingMediaUpload {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly contentType: typeof TRUSTED_IMAGE_CONTENT_TYPE;
}

export interface TrustedListingMediaObject {
  readonly path: string;
  readonly createdAt: string | null;
}

function assertSafeObjectPath(path: string): void {
  if (
    path.length === 0 ||
    path.length > 1024 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..") ||
    [...path].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new Error("Invalid listing-media object path.");
  }
}

/**
 * Upload a fully prepared image through the server-only service-role client.
 *
 * Callers must authenticate and authorize the owning host before invoking this
 * helper. The service role deliberately bypasses Storage RLS so authenticated
 * browser clients can be denied direct writes to trusted Housing paths.
 */
export async function uploadTrustedListingMedia(
  upload: TrustedListingMediaUpload,
): Promise<string> {
  assertSafeObjectPath(upload.path);
  if (upload.contentType !== TRUSTED_IMAGE_CONTENT_TYPE) {
    throw new Error("Trusted listing-media uploads must be WebP images.");
  }
  if (upload.bytes.byteLength === 0 || upload.bytes.byteLength > UPLOAD_MAX_FILE_BYTES) {
    throw new Error("Trusted listing-media upload exceeds the allowed size.");
  }

  const client = adminClient();
  const { error } = await client.storage
    .from(LISTING_MEDIA_BUCKET)
    .upload(upload.path, upload.bytes, {
      upsert: false,
      cacheControl: "31536000",
      contentType: upload.contentType,
    });
  if (error) {
    throw new Error(
      `uploadTrustedListingMedia(${LISTING_MEDIA_BUCKET}/${upload.path}): ${error.message}`,
    );
  }

  return client.storage.from(LISTING_MEDIA_BUCKET).getPublicUrl(upload.path).data.publicUrl;
}

/**
 * Replace one mutable, deterministic listing-media object.
 *
 * Meals keeps its historical one-object-per-slot model. Callers still perform
 * auth, ownership, slot validation, and server-side WebP normalization before
 * reaching this service-role boundary; the stable path bounds abandoned files
 * without racing destructive cleanup against a concurrent database save.
 */
export async function replaceTrustedListingMedia(
  upload: TrustedListingMediaUpload,
): Promise<string> {
  assertSafeObjectPath(upload.path);
  if (upload.contentType !== TRUSTED_IMAGE_CONTENT_TYPE) {
    throw new Error("Trusted listing-media uploads must be WebP images.");
  }
  if (upload.bytes.byteLength === 0 || upload.bytes.byteLength > UPLOAD_MAX_FILE_BYTES) {
    throw new Error("Trusted listing-media upload exceeds the allowed size.");
  }

  const client = adminClient();
  const { error } = await client.storage
    .from(LISTING_MEDIA_BUCKET)
    .upload(upload.path, upload.bytes, {
      upsert: true,
      cacheControl: "3600",
      contentType: upload.contentType,
    });
  if (error) {
    throw new Error(
      `replaceTrustedListingMedia(${LISTING_MEDIA_BUCKET}/${upload.path}): ${error.message}`,
    );
  }

  return client.storage.from(LISTING_MEDIA_BUCKET).getPublicUrl(upload.path).data.publicUrl;
}

/** Delete an unreferenced trusted listing-media object by its exact path. */
export async function deleteTrustedListingMedia(path: string): Promise<void> {
  assertSafeObjectPath(path);
  const { error } = await adminClient().storage.from(LISTING_MEDIA_BUCKET).remove([path]);
  if (error) {
    throw new Error(
      `deleteTrustedListingMedia(${LISTING_MEDIA_BUCKET}/${path}): ${error.message}`,
    );
  }
}

/**
 * List a bounded page below one trusted object prefix.
 *
 * This is intentionally server-only: upload actions use it to enforce a
 * durable per-slot object quota and to reclaim expired, unbound uploads before
 * spending CPU in the image decoder. Browser clients never receive bucket
 * inventory or service-role access.
 */
export async function listTrustedListingMedia(
  prefix: string,
  limit = 100,
): Promise<readonly TrustedListingMediaObject[]> {
  assertSafeObjectPath(prefix);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Trusted listing-media list limit must be between 1 and 100.");
  }

  const { data, error } = await adminClient().storage
    .from(LISTING_MEDIA_BUCKET)
    .list(prefix, {
      limit,
      offset: 0,
      sortBy: { column: "created_at", order: "asc" },
    });
  if (error) {
    throw new Error(
      `listTrustedListingMedia(${LISTING_MEDIA_BUCKET}/${prefix}): ${error.message}`,
    );
  }

  return (data ?? []).map((object) => {
    const path = `${prefix}/${object.name}`;
    assertSafeObjectPath(path);
    return {
      path,
      createdAt:
        typeof object.created_at === "string" && object.created_at.length > 0
          ? object.created_at
          : null,
    };
  });
}
