import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";
import type { ConversationRole } from "./messages";

/**
 * Read-only context resolvers for transactional email notifications.
 *
 * These live in the db layer so the Next server-action layer can ADDRESS
 * notification emails (the recipient's email is fetched from Clerk in the
 * action) WITHOUT pulling transport concerns into the core query modules. Each
 * resolver is best-effort: it returns null/empty rather than throwing, so a
 * notification can never break the mutation that triggered it.
 *
 * SECURITY / TYPES: same model as the sibling query modules — RLS is not yet
 * enabled, so reads go through an UNTYPED authed client (the clerk_user_id
 * columns predate the committed types.gen.ts) and the caller passes an
 * already-verified Clerk token. Each resolver runs AFTER the triggering
 * mutation has applied its own ownership guard (applyToListing /
 * updateApplicationStatus / sendMessage).
 * // types not yet generated: host_profiles.clerk_user_id, seeker_profiles.clerk_user_id
 */

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveProfileId(
  db: SupabaseClient,
  table: "seeker_profiles" | "host_profiles",
  clerkUserId: string,
): Promise<string | null> {
  if (!clerkUserId) return null;
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string | null };
  return typeof row.id === "string" ? row.id : null;
}

async function resolveClerkId(
  db: SupabaseClient,
  table: "seeker_profiles" | "host_profiles",
  profileId: string | null,
): Promise<string | null> {
  if (!profileId) return null;
  const { data, error } = await db
    .from(table)
    .select("clerk_user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { clerk_user_id: string | null };
  return typeof row.clerk_user_id === "string" ? row.clerk_user_id : null;
}

async function resolveListingTitle(
  db: SupabaseClient,
  listingId: string | null,
): Promise<string | null> {
  if (!listingId) return null;
  const { data, error } = await db
    .from("listings")
    .select("title")
    .eq("id", listingId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { title: string | null };
  return typeof row.title === "string" ? row.title : null;
}

/** Listing title + the listing owner's Clerk id, for the apply notification email. */
export interface ListingHostContact {
  readonly listingTitle: string;
  readonly hostClerkUserId: string | null;
}

/**
 * Resolve the listing title and the listing owner's Clerk user id from a listing
 * id (listings.host_profile_id -> host_profiles.clerk_user_id). Used by the
 * apply server action to address the "new application" email to the host.
 * Best-effort: returns null when the listing cannot be resolved.
 */
export async function getListingHostContact(
  clerkToken: string,
  listingId: string,
): Promise<ListingHostContact | null> {
  try {
    const db = untypedClient(clerkToken);
    const { data: listing, error } = await db
      .from("listings")
      .select("title, host_profile_id")
      .eq("id", listingId)
      .maybeSingle();
    if (error || !listing) return null;
    const row = listing as {
      title: string | null;
      host_profile_id: string | null;
    };
    const listingTitle = typeof row.title === "string" ? row.title : "";
    const hostClerkUserId = await resolveClerkId(
      db,
      "host_profiles",
      row.host_profile_id,
    );
    return { listingTitle, hostClerkUserId };
  } catch {
    return null;
  }
}

/** Seeker Clerk id + listing title for an application, for the status-change email. */
export interface ApplicationSeekerContact {
  readonly seekerClerkUserId: string | null;
  readonly listingTitle: string;
}

/**
 * Resolve the applicant's Clerk user id and listing title for an application id
 * (applications.seeker_profile_id -> seeker_profiles.clerk_user_id,
 * applications.listing_id -> listings.title). Used by the status-change server
 * action (which has already passed updateApplicationStatus's ownership guard).
 * Best-effort: returns null when the application cannot be resolved.
 */
export async function getApplicationSeekerContact(
  clerkToken: string,
  applicationId: string,
): Promise<ApplicationSeekerContact | null> {
  try {
    const db = untypedClient(clerkToken);
    const { data: appRow, error } = await db
      .from("applications")
      .select("seeker_profile_id, listing_id")
      .eq("id", applicationId)
      .maybeSingle();
    if (error || !appRow) return null;
    const row = appRow as {
      seeker_profile_id: string | null;
      listing_id: string | null;
    };
    const seekerClerkUserId = await resolveClerkId(
      db,
      "seeker_profiles",
      row.seeker_profile_id,
    );
    const listingTitle = (await resolveListingTitle(db, row.listing_id)) ?? "";
    return { seekerClerkUserId, listingTitle };
  } catch {
    return null;
  }
}

/**
 * The recipient (the participant who is NOT the caller) of a conversation, plus
 * the conversation's listing title — for the "new message" notification email.
 */
export interface MessageEmailContext {
  readonly recipientClerkUserId: string | null;
  /** Which side the recipient is on, so the action can pick the right URL. */
  readonly recipientRole: ConversationRole;
  readonly listingTitle: string | null;
}

/**
 * Resolve the email context for a freshly-sent message: who should be notified
 * (the OTHER participant), which side they are on, and the listing title. The
 * caller is verified to be a participant first (defense in depth, mirroring
 * sendMessage). Best-effort: returns null when the caller is not a participant
 * or resolution fails. `callerClerkUserId` must come from auth().userId.
 */
export async function getMessageEmailContext(
  clerkToken: string,
  callerClerkUserId: string,
  conversationId: string,
): Promise<MessageEmailContext | null> {
  try {
    const db = untypedClient(clerkToken);
    const { data: convo, error } = await db
      .from("conversations")
      .select("seeker_profile_id, host_profile_id, listing_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (error || !convo) return null;
    const c = convo as {
      seeker_profile_id: string | null;
      host_profile_id: string | null;
      listing_id: string | null;
    };

    const [seekerId, hostId] = await Promise.all([
      resolveProfileId(db, "seeker_profiles", callerClerkUserId),
      resolveProfileId(db, "host_profiles", callerClerkUserId),
    ]);

    let recipientRole: ConversationRole;
    if (hostId && c.host_profile_id === hostId) {
      recipientRole = "seeker";
    } else if (seekerId && c.seeker_profile_id === seekerId) {
      recipientRole = "host";
    } else {
      // Caller is not a participant — do not leak a recipient.
      return null;
    }

    const recipientTable =
      recipientRole === "seeker" ? "seeker_profiles" : "host_profiles";
    const recipientProfileId =
      recipientRole === "seeker" ? c.seeker_profile_id : c.host_profile_id;

    const recipientClerkUserId = await resolveClerkId(
      db,
      recipientTable,
      recipientProfileId,
    );
    const listingTitle = await resolveListingTitle(db, c.listing_id);

    return { recipientClerkUserId, recipientRole, listingTitle };
  } catch {
    return null;
  }
}

/**
 * Resolve a seeker's Clerk user id from their seeker_profiles.id.
 * Used by the invite-send server action to address the invite notification email.
 * Best-effort: returns null when the profile cannot be resolved.
 */
export async function getSeekerClerkIdByProfileId(
  clerkToken: string,
  seekerProfileId: string,
): Promise<string | null> {
  try {
    const db = untypedClient(clerkToken);
    return await resolveClerkId(db, "seeker_profiles", seekerProfileId);
  } catch {
    return null;
  }
}
