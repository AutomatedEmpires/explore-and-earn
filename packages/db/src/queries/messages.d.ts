/**
 * Messaging data access — scoped seeker <-> host conversations + transcripts.
 *
 * SECURITY: Row Level Security is NOT yet enabled on `conversations` /
 * `messages`, and `authedClient()` talks to PostgREST with the anon key plus the
 * caller's Clerk JWT (the `anon` role performs no row-level enforcement). Every
 * function here is therefore scoped in application code: we resolve the caller's
 * `seeker_profiles.id` / `host_profiles.id` from the already-verified
 * `clerkUserId` (which comes from `auth().userId`, never decoded from the token)
 * and refuse any conversation the caller does not own. Keep these manual guards
 * even once RLS lands — they are defense in depth.
 *
 * TYPES: `conversations` and `messages` are now present in the generated
 * `packages/db/src/types.gen.ts`. However, the participant guards below resolve
 * the caller via `seeker_profiles.clerk_user_id`, and that column is NOT in the
 * generated types (the Clerk-sync columns from migration 009 are not reflected
 * on the live database). A typed client would reject the `.eq("clerk_user_id",
 * ...)` lookup in `resolveSeekerProfileId`, so we keep an untyped
 * `SupabaseClient` handle and narrow rows locally, mirroring savedListings.ts /
 * hostProfiles.ts.
 * // types not yet generated: seeker_profiles.clerk_user_id
 */
export type ConversationRole = "seeker" | "host";
export interface Conversation {
    readonly id: string;
    readonly seekerProfileId: string;
    readonly hostProfileId: string;
    readonly listingId: string | null;
    readonly applicationId: string | null;
    /** ISO-8601 timestamp of the most recent message, or null if none yet. */
    readonly lastMessageAt: string | null;
    readonly createdAt: string;
}
export interface Message {
    readonly id: string;
    readonly conversationId: string;
    readonly senderType: ConversationRole;
    readonly senderProfileId: string;
    readonly body: string;
    /** ISO-8601 timestamp the message was read, or null if unread. */
    readonly readAt: string | null;
    readonly createdAt: string;
}
export interface SendMessageResult {
    readonly ok: boolean;
    readonly error?: string;
}
/**
 * All conversations for the caller in the given role, newest activity first.
 * Returns [] when the caller has no matching profile.
 */
export declare function getConversations(clerkToken: string, clerkUserId: string, role: ConversationRole): Promise<Conversation[]>;
/**
 * All messages in a conversation, oldest first. Returns [] when the conversation
 * does not exist or the caller is not a participant (ownership check).
 */
export declare function getMessages(clerkToken: string, clerkUserId: string, conversationId: string): Promise<Message[]>;
/**
 * Inserts a message into a conversation the caller owns and bumps
 * `last_message_at`. The sender side/profile is derived from the caller's
 * relationship to the conversation, never from the client. Best-effort: returns
 * `{ ok: false }` rather than throwing for the common failure modes.
 */
export declare function sendMessage(clerkToken: string, clerkUserId: string, conversationId: string, body: string): Promise<SendMessageResult>;
/**
 * Returns the existing seeker<->host conversation (optionally scoped to an
 * application) or creates one. Used when a host saves/contacts an applicant.
 *
 * `callerClerkUserId` (from `auth().userId`) must match one of the two
 * participants. Callers who are neither the seeker nor the host receive null
 * — this prevents cross-user conversation creation without a service-role key.
 *
 * Returns null when caller verification fails or either profile cannot be resolved.
 */
export declare function getOrCreateConversation(clerkToken: string, callerClerkUserId: string, seekerClerkUserId: string, hostClerkUserId: string, applicationId?: string): Promise<Conversation | null>;
