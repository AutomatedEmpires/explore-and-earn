import "server-only";
import { authedClient } from "../client";
const MAX_BODY_LENGTH = 4000;
const UNIQUE_VIOLATION = "23505";
const CONVERSATION_COLUMNS = "id, seeker_profile_id, host_profile_id, listing_id, application_id, last_message_at, created_at";
const MESSAGE_COLUMNS = "id, conversation_id, sender_type, sender_profile_id, body, read_at, created_at";
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
}
function asString(value) {
    return typeof value === "string" ? value : value == null ? "" : String(value);
}
function nullableString(value) {
    return typeof value === "string" ? value : null;
}
function rowToConversation(row) {
    return {
        id: asString(row.id),
        seekerProfileId: asString(row.seeker_profile_id),
        hostProfileId: asString(row.host_profile_id),
        listingId: nullableString(row.listing_id),
        applicationId: nullableString(row.application_id),
        lastMessageAt: nullableString(row.last_message_at),
        createdAt: asString(row.created_at),
    };
}
function rowToMessage(row) {
    return {
        id: asString(row.id),
        conversationId: asString(row.conversation_id),
        senderType: row.sender_type === "host" ? "host" : "seeker",
        senderProfileId: asString(row.sender_profile_id),
        body: asString(row.body),
        readAt: nullableString(row.read_at),
        createdAt: asString(row.created_at),
    };
}
async function resolveSeekerProfileId(db, clerkUserId) {
    const { data, error } = await db
        .from("seeker_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error)
        throw new Error(`resolveSeekerProfileId: ${error.message}`);
    return data ? asString(data.id) : null;
}
async function resolveHostProfileId(db, clerkUserId) {
    const { data, error } = await db
        .from("host_profiles")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (error)
        throw new Error(`resolveHostProfileId: ${error.message}`);
    return data ? asString(data.id) : null;
}
/**
 * Loads a conversation only if it belongs to the caller, returning which side
 * (seeker or host) the caller is on. Returns null when the conversation does not
 * exist or the caller is not a participant.
 */
async function loadOwnedConversation(db, clerkUserId, conversationId) {
    const { data, error } = await db
        .from("conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("id", conversationId)
        .maybeSingle();
    if (error)
        throw new Error(`loadOwnedConversation: ${error.message}`);
    if (!data)
        return null;
    const conversation = rowToConversation(data);
    const [seekerProfileId, hostProfileId] = await Promise.all([
        resolveSeekerProfileId(db, clerkUserId),
        resolveHostProfileId(db, clerkUserId),
    ]);
    if (hostProfileId && conversation.hostProfileId === hostProfileId) {
        return { conversation, role: "host", senderProfileId: hostProfileId };
    }
    if (seekerProfileId && conversation.seekerProfileId === seekerProfileId) {
        return { conversation, role: "seeker", senderProfileId: seekerProfileId };
    }
    return null;
}
async function findConversation(db, seekerProfileId, hostProfileId, applicationId) {
    let query = db
        .from("conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("seeker_profile_id", seekerProfileId)
        .eq("host_profile_id", hostProfileId);
    query =
        applicationId === null
            ? query.is("application_id", null)
            : query.eq("application_id", applicationId);
    const { data, error } = await query
        .order("created_at", { ascending: true })
        .limit(1);
    if (error)
        throw new Error(`findConversation: ${error.message}`);
    const row = (data ?? [])[0];
    return row ? rowToConversation(row) : null;
}
/**
 * All conversations for the caller in the given role, newest activity first.
 * Returns [] when the caller has no matching profile.
 */
export async function getConversations(clerkToken, clerkUserId, role) {
    const db = untypedClient(clerkToken);
    const profileId = role === "seeker"
        ? await resolveSeekerProfileId(db, clerkUserId)
        : await resolveHostProfileId(db, clerkUserId);
    if (!profileId)
        return [];
    const column = role === "seeker" ? "seeker_profile_id" : "host_profile_id";
    const { data, error } = await db
        .from("conversations")
        .select(CONVERSATION_COLUMNS)
        .eq(column, profileId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
    if (error)
        throw new Error(`getConversations: ${error.message}`);
    return (data ?? []).map(rowToConversation);
}
/**
 * All messages in a conversation, oldest first. Returns [] when the conversation
 * does not exist or the caller is not a participant (ownership check).
 */
export async function getMessages(clerkToken, clerkUserId, conversationId) {
    const db = untypedClient(clerkToken);
    const owned = await loadOwnedConversation(db, clerkUserId, conversationId);
    if (!owned)
        return [];
    const { data, error } = await db
        .from("messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
    if (error)
        throw new Error(`getMessages: ${error.message}`);
    return (data ?? []).map(rowToMessage);
}
/**
 * Inserts a message into a conversation the caller owns and bumps
 * `last_message_at`. The sender side/profile is derived from the caller's
 * relationship to the conversation, never from the client. Best-effort: returns
 * `{ ok: false }` rather than throwing for the common failure modes.
 */
export async function sendMessage(clerkToken, clerkUserId, conversationId, body) {
    const trimmed = body.trim();
    if (trimmed.length === 0)
        return { ok: false, error: "empty" };
    if (trimmed.length > MAX_BODY_LENGTH)
        return { ok: false, error: "too_long" };
    try {
        const db = untypedClient(clerkToken);
        const owned = await loadOwnedConversation(db, clerkUserId, conversationId);
        if (!owned)
            return { ok: false, error: "not_found" };
        const { error: insertError } = await db.from("messages").insert({
            conversation_id: conversationId,
            sender_type: owned.role,
            sender_profile_id: owned.senderProfileId,
            body: trimmed,
        });
        if (insertError)
            return { ok: false, error: insertError.message };
        // The message is persisted; a failed timestamp bump should not surface as a
        // send failure to the user, so we swallow it here (ordering self-heals on
        // the next successful send).
        await db
            .from("conversations")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", conversationId);
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "unknown" };
    }
}
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
export async function getOrCreateConversation(clerkToken, callerClerkUserId, seekerClerkUserId, hostClerkUserId, applicationId) {
    if (callerClerkUserId !== seekerClerkUserId && callerClerkUserId !== hostClerkUserId) {
        return null;
    }
    const db = untypedClient(clerkToken);
    const [seekerProfileId, hostProfileId] = await Promise.all([
        resolveSeekerProfileId(db, seekerClerkUserId),
        resolveHostProfileId(db, hostClerkUserId),
    ]);
    if (!seekerProfileId || !hostProfileId)
        return null;
    const appId = applicationId ?? null;
    const existing = await findConversation(db, seekerProfileId, hostProfileId, appId);
    if (existing)
        return existing;
    const { data, error } = await db
        .from("conversations")
        .insert({
        seeker_profile_id: seekerProfileId,
        host_profile_id: hostProfileId,
        application_id: appId,
    })
        .select(CONVERSATION_COLUMNS)
        .single();
    if (error) {
        // Lost a race against a concurrent insert on the unique key — re-read.
        if (error.code === UNIQUE_VIOLATION) {
            return findConversation(db, seekerProfileId, hostProfileId, appId);
        }
        throw new Error(`getOrCreateConversation: ${error.message}`);
    }
    return data ? rowToConversation(data) : null;
}
