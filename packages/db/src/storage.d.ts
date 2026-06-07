/**
 * Supabase Storage helpers for the image upload stack (Wave 9).
 *
 * Buckets + RLS are defined in supabase/migrations/017_storage_buckets.sql.
 * Both buckets are public-read, so a successful upload yields a stable public
 * URL via getPublicUrl(); writes are gated by storage RLS keyed on the caller's
 * Clerk identity (auth.jwt() ->> 'sub').
 *
 * `token` is the Supabase-templated Clerk JWT (getToken({ template: "supabase" }));
 * it is handed to authedClient() so every storage write runs as the caller.
 */
/** Public bucket for listing cover + gallery images. */
export declare const LISTING_MEDIA_BUCKET = "listing-media";
/** Public bucket for host + seeker profile photos. */
export declare const PROFILE_PHOTOS_BUCKET = "profile-photos";
/**
 * Upload a listing image to `listing-media/{hostProfileId}/{slot}` and return
 * its public URL. `slot` is "cover" for the hero image, or a numeric gallery
 * index. The first path segment must be the caller's own host_profile id (RLS).
 */
export declare function uploadListingMedia(token: string, hostProfileId: string, file: File, slot: "cover" | number): Promise<string>;
/**
 * Upload a profile photo to `profile-photos/{ownerType}/{ownerId}` and return
 * its public URL.
 */
export declare function uploadProfilePhoto(token: string, ownerId: string, file: File, ownerType: "host" | "seeker"): Promise<string>;
/** Delete a single object from a bucket by path. */
export declare function deleteStorageObject(token: string, bucket: string, path: string): Promise<void>;
