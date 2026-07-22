import { authedClient } from "./client";

/**
 * Supabase Storage helpers for the image upload stack (Wave 9).
 *
 * Buckets + RLS are defined in supabase/migrations/017_storage_buckets.sql.
 * Both buckets are public-read, so a successful upload yields a stable public
 * URL via getPublicUrl(); writes are gated by storage RLS keyed on the caller's
 * Clerk identity (auth.jwt() ->> 'sub').
 *
 * `token` is the ordinary Clerk session JWT minted by `getToken()` after the
 * Clerk instance's native Supabase integration has been enabled;
 * it is handed to authedClient() so every storage write runs as the caller.
 */

/** Public bucket for listing cover + gallery images. */
export const LISTING_MEDIA_BUCKET = "listing-media";
/** Public bucket for host + seeker profile photos. */
export const PROFILE_PHOTOS_BUCKET = "profile-photos";

async function uploadToBucket(
  token: string,
  bucket: string,
  path: string,
  file: File,
  upsert = true,
): Promise<string> {
  const client = authedClient(token);
  const { error } = await client.storage.from(bucket).upload(path, file, {
    upsert,
    cacheControl: "3600",
    contentType: file.type || undefined,
  });
  if (error) {
    throw new Error(`uploadToBucket(${bucket}/${path}): ${error.message}`);
  }
  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Upload a listing image to `listing-media/{hostProfileId}/{slot}` and return
 * its public URL. `slot` is "cover" for the hero image, or a numeric gallery
 * index. The first path segment must be the caller's own host_profile id (RLS).
 */
export async function uploadListingMedia(
  token: string,
  hostProfileId: string,
  file: File,
  slot: "cover" | number,
): Promise<string> {
  return uploadToBucket(token, LISTING_MEDIA_BUCKET, `${hostProfileId}/${slot}`, file);
}

/**
 * Upload a Housing/Meals benefit photo and return its public URL. Stored under
 * `listing-media/{hostProfileId}/benefit/{listingId}/{kind}/{slot}` — the first
 * path segment is the caller's own host_profile id, so the listing-media RLS
 * insert policy (017) authorizes the write. `slot` is the photo-slot id from the
 * benefit editor (e.g. "inside", "kitchen").
 */
export async function uploadBenefitPhoto(
  token: string,
  hostProfileId: string,
  listingId: string,
  kind: "housing" | "meals",
  slot: string,
  file: File,
): Promise<string> {
  const objectId = globalThis.crypto.randomUUID();
  const path = `${hostProfileId}/benefit/${listingId}/${kind}/${slot}/${objectId}`;
  return uploadToBucket(token, LISTING_MEDIA_BUCKET, path, file);
}

/**
 * Upload one reusable host-level Housing evidence role. Versioned object names
 * make replacement atomic: the profile JSON switches only after upload success,
 * while a still-referenced old object remains protected by migration 072.
 */
export async function uploadHousingLibraryPhoto(
  token: string,
  hostProfileId: string,
  role: string,
  file: File,
): Promise<string> {
  const objectId = globalThis.crypto.randomUUID();
  const path = `${hostProfileId}/library/housing/${role}/${objectId}`;
  return uploadToBucket(token, LISTING_MEDIA_BUCKET, path, file);
}

/**
 * Upload a profile photo to `profile-photos/{ownerType}/{ownerId}` and return
 * its public URL.
 */
export async function uploadProfilePhoto(
  token: string,
  ownerId: string,
  file: File,
  ownerType: "host" | "seeker",
): Promise<string> {
  return uploadToBucket(token, PROFILE_PHOTOS_BUCKET, `${ownerType}/${ownerId}`, file);
}

/**
 * Delete a gallery image uploaded under `listing-media/{hostProfileId}/{slot}`.
 */
export async function deleteListingMedia(
  token: string,
  hostProfileId: string,
  slot: "cover" | number,
): Promise<void> {
  return deleteStorageObject(token, LISTING_MEDIA_BUCKET, `${hostProfileId}/${slot}`);
}

/**
 * Upload a community photo to `community-photos/{seekerProfileId}/{filename}`
 * and return the storage path (not the full URL). The caller is responsible for
 * generating a unique filename to prevent collisions.
 */
export async function uploadCommunityPhotoStorage(
  token: string,
  seekerProfileId: string,
  filename: string,
  file: File,
): Promise<string> {
  const path = `${seekerProfileId}/${filename}`;
  // Community object names are UUIDs. INSERT-only uploads avoid requiring the
  // broad Storage SELECT/UPDATE policies that an overwrite-capable upsert needs.
  await uploadToBucket(token, "community-photos", path, file, false);
  return path;
}

/** Delete a single object from a bucket by path. */
export async function deleteStorageObject(
  token: string,
  bucket: string,
  path: string,
): Promise<void> {
  const client = authedClient(token);
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    throw new Error(`deleteStorageObject(${bucket}/${path}): ${error.message}`);
  }
}
