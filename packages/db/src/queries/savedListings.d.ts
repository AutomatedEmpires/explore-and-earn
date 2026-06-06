/**
 * Save (or re-save) a listing for the current seeker by upserting a
 * `saved_listings` row with `status='saved'`.
 *
 * Best-effort by design: returns `{ ok: false }` silently when the seeker has no
 * profile yet or the write fails, so the swipe UX is never blocked. Never throws.
 *
 * @param clerkToken - Verified Clerk JWT from `getToken()`.
 * @param clerkUserId - Verified Clerk user ID from `auth().userId` — do NOT
 *   decode this from the token; pass it from the already-verified `auth()` call.
 */
export declare function saveListing(clerkToken: string, clerkUserId: string, listingId: string): Promise<{
    ok: boolean;
}>;
/**
 * Mark a previously saved listing as removed (`status='removed'`) for the current
 * seeker. Best-effort: returns `{ ok: false }` silently on any failure and never
 * throws.
 */
export declare function unsaveListing(clerkToken: string, clerkUserId: string, listingId: string): Promise<{
    ok: boolean;
}>;
/**
 * Return the `listing_id`s the current seeker has actively saved
 * (`status='saved'`), newest first. Returns an empty array when the seeker has
 * no profile yet or has saved nothing.
 */
export declare function getSavedListingIds(clerkToken: string, clerkUserId: string): Promise<string[]>;
