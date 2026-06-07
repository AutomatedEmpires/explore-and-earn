import "server-only";
import type { ConversationRole } from "./messages";
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
export declare function getListingHostContact(clerkToken: string, listingId: string): Promise<ListingHostContact | null>;
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
export declare function getApplicationSeekerContact(clerkToken: string, applicationId: string): Promise<ApplicationSeekerContact | null>;
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
export declare function getMessageEmailContext(clerkToken: string, callerClerkUserId: string, conversationId: string): Promise<MessageEmailContext | null>;
/**
 * Resolve a seeker's Clerk user id from their seeker_profiles.id.
 * Used by the invite-send server action to address the invite notification email.
 * Best-effort: returns null when the profile cannot be resolved.
 */
export declare function getSeekerClerkIdByProfileId(clerkToken: string, seekerProfileId: string): Promise<string | null>;
