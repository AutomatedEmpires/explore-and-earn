/**
 * Client-safe exports from @explore-and-earn/db.
 *
 * Import via `@explore-and-earn/db/client` from "use client" components.
 * This entry point deliberately excludes all server-only query modules so the
 * Next.js client bundle can tree-shake safely.
 *
 * Server components / Server Actions should continue using the default
 * `@explore-and-earn/db` entry which carries the server-only guard.
 */

// Supabase clients — neither uses a server secret; both are safe browser-side.
export { anonClient, authedClient } from "./client";

// Storage helpers — use the caller's Supabase JWT, no service-role key.
export {
  LISTING_MEDIA_BUCKET,
  PROFILE_PHOTOS_BUCKET,
  uploadListingMedia,
  uploadProfilePhoto,
  deleteStorageObject,
  deleteListingMedia,
} from "./storage";

// Type-only re-exports needed by client components.
export type { Message } from "./queries/messages";
export type { InviteResponse, HostInvite } from "./queries/invites";
export type { ListingRow } from "./queries/listings";
export type { SeekerSearchResult } from "./queries/invites";
export type { SavedListingDetail } from "./queries/savedListings";
export type { NotificationPrefs, NotificationPrefsPatch } from "./queries/notificationPrefs";
export type { HostSettableStatus } from "./queries/applications";
export type { RichSeekerApplication } from "./queries/seekerApplicationsRich";
