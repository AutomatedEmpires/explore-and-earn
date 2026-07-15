import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Messaging data access — scoped seeker <-> host conversations + transcripts.
 *
 * SECURITY: Row Level Security IS enabled on `conversations` / `messages`
 * (migration 048) and hardened in migration 050 — participant-scoped policies
 * plus column-level UPDATE grants (only `messages.read_at` and
 * `conversations.last_message_at` are writable by `authenticated`), and a
 * conversation INSERT policy that requires a real host<->seeker application
 * relationship. `authedClient()` talks to PostgREST with the anon key plus the
 * caller's Clerk JWT, which resolves to the `authenticated` role under those
 * policies. We ALSO scope every function in application code as defense in depth:
 * we resolve the caller's `seeker_profiles.id` / `host_profiles.id` from the
 * already-verified `clerkUserId` (from `auth().userId`, never decoded from the
 * token) and refuse any conversation the caller does not own. Keep both layers.
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
  /** Which side the SENDER is on (server-derived, never client input). */
  readonly senderRole?: ConversationRole;
}

const MAX_BODY_LENGTH = 4000;
const UNIQUE_VIOLATION = "23505";

const CONVERSATION_COLUMNS =
  "id, seeker_profile_id, host_profile_id, listing_id, application_id, last_message_at, created_at";
const MESSAGE_COLUMNS =
  "id, conversation_id, sender_type, sender_profile_id, body, read_at, created_at";

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function rowToConversation(row: Record<string, unknown>): Conversation {
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

function rowToMessage(row: Record<string, unknown>): Message {
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

async function resolveSeekerProfileId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`resolveSeekerProfileId: ${error.message}`);
  return data ? asString((data as Record<string, unknown>).id) : null;
}

async function resolveHostProfileId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`resolveHostProfileId: ${error.message}`);
  return data ? asString((data as Record<string, unknown>).id) : null;
}

interface OwnedConversation {
  readonly conversation: Conversation;
  readonly role: ConversationRole;
  readonly senderProfileId: string;
}

/**
 * Loads a conversation only if it belongs to the caller, returning which side
 * (seeker or host) the caller is on. Returns null when the conversation does not
 * exist or the caller is not a participant.
 */
async function loadOwnedConversation(
  db: SupabaseClient,
  clerkUserId: string,
  conversationId: string,
): Promise<OwnedConversation | null> {
  const { data, error } = await db
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`loadOwnedConversation: ${error.message}`);
  if (!data) return null;

  const conversation = rowToConversation(data as Record<string, unknown>);
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

async function findConversation(
  db: SupabaseClient,
  seekerProfileId: string,
  hostProfileId: string,
  applicationId: string | null,
): Promise<Conversation | null> {
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
  if (error) throw new Error(`findConversation: ${error.message}`);
  const row = (data ?? [])[0] as Record<string, unknown> | undefined;
  return row ? rowToConversation(row) : null;
}

/**
 * All conversations for the caller in the given role, newest activity first.
 * Returns [] when the caller has no matching profile.
 */
export async function getConversations(
  clerkToken: string,
  clerkUserId: string,
  role: ConversationRole,
): Promise<Conversation[]> {
  const db = untypedClient(clerkToken);
  const profileId =
    role === "seeker"
      ? await resolveSeekerProfileId(db, clerkUserId)
      : await resolveHostProfileId(db, clerkUserId);
  if (!profileId) return [];

  const column = role === "seeker" ? "seeker_profile_id" : "host_profile_id";
  const { data, error } = await db
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq(column, profileId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`getConversations: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToConversation);
}

/**
 * All messages in a conversation, oldest first. Returns [] when the conversation
 * does not exist or the caller is not a participant (ownership check).
 */
export async function getMessages(
  clerkToken: string,
  clerkUserId: string,
  conversationId: string,
): Promise<Message[]> {
  const db = untypedClient(clerkToken);
  const owned = await loadOwnedConversation(db, clerkUserId, conversationId);
  if (!owned) return [];

  const { data, error } = await db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getMessages: ${error.message}`);
  return ((data ?? []) as Record<string, unknown>[]).map(rowToMessage);
}

/**
 * Inserts a message into a conversation the caller owns and bumps
 * `last_message_at`. The sender side/profile is derived from the caller's
 * relationship to the conversation, never from the client. Best-effort: returns
 * `{ ok: false }` rather than throwing for the common failure modes.
 */
export async function sendMessage(
  clerkToken: string,
  clerkUserId: string,
  conversationId: string,
  body: string,
): Promise<SendMessageResult> {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: "empty" };
  if (trimmed.length > MAX_BODY_LENGTH) return { ok: false, error: "too_long" };

  try {
    const db = untypedClient(clerkToken);
    const owned = await loadOwnedConversation(db, clerkUserId, conversationId);
    if (!owned) return { ok: false, error: "not_found" };

    const { error: insertError } = await db.from("messages").insert({
      conversation_id: conversationId,
      sender_type: owned.role,
      sender_profile_id: owned.senderProfileId,
      body: trimmed,
    });
    if (insertError) return { ok: false, error: insertError.message };

    // The message is persisted; a failed timestamp bump should not surface as a
    // send failure to the user, so we swallow it here (ordering self-heals on
    // the next successful send).
    await db
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    return { ok: true, senderRole: owned.role };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown" };
  }
}

/**
 * Last message for each of the given conversation ids, keyed by conversation id.
 * Uses a single query rather than one-per-conversation so list pages avoid an
 * N+1 round-trip. Ownership is NOT re-checked here — callers must pass only ids
 * that have already been scoped to the requesting user.
 */
export async function getLastMessagesForConversations(
  clerkToken: string,
  conversationIds: readonly string[],
): Promise<Map<string, Message>> {
  const result = new Map<string, Message>();
  if (conversationIds.length === 0) return result;

  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .in("conversation_id", conversationIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(conversationIds.length * 20, 1000));
  if (error) throw new Error(`getLastMessagesForConversations: ${error.message}`);

  // Keep only the first (newest) row per conversation id.
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const msg = rowToMessage(row);
    if (!result.has(msg.conversationId)) {
      result.set(msg.conversationId, msg);
    }
  }
  return result;
}

/**
 * Marks all messages in a conversation that were sent by the OTHER side as read
 * (i.e. not sent by the caller). Safe to call on every thread open; it is a
 * no-op when there is nothing unread. Ownership is verified — returns silently
 * when the caller is not a participant.
 */
export async function markMessagesRead(
  clerkToken: string,
  clerkUserId: string,
  conversationId: string,
): Promise<void> {
  const db = untypedClient(clerkToken);
  const owned = await loadOwnedConversation(db, clerkUserId, conversationId);
  if (!owned) return;

  // The "other side" is the sender_type that is not the caller's role.
  const otherSide: ConversationRole = owned.role === "host" ? "seeker" : "host";
  await db
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("sender_type", otherSide)
    .is("read_at", null);
}

/**
 * Count of unread messages for the caller acting as a host — i.e. messages in
 * conversations the caller hosts that were sent by the seeker and not yet read.
 * Resilient by design: returns 0 on any failure so a transient error never breaks
 * the host shell header badge.
 */
export async function getUnreadMessageCount(
  clerkToken: string,
  clerkUserId: string,
): Promise<number> {
  try {
    if (!clerkUserId) return 0;
    const db = untypedClient(clerkToken);
    const hostProfileId = await resolveHostProfileId(db, clerkUserId);
    if (!hostProfileId) return 0;

    const { data: convData } = await db
      .from("conversations")
      .select("id")
      .eq("host_profile_id", hostProfileId);
    const convIds = ((convData ?? []) as Record<string, unknown>[]).map((r) =>
      asString(r.id),
    );
    if (convIds.length === 0) return 0;

    const { count, error } = await db
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", convIds)
      .eq("sender_type", "seeker")
      .is("read_at", null);
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
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
export async function getOrCreateConversation(
  clerkToken: string,
  callerClerkUserId: string,
  seekerClerkUserId: string,
  hostClerkUserId: string,
  applicationId?: string,
): Promise<Conversation | null> {
  if (callerClerkUserId !== seekerClerkUserId && callerClerkUserId !== hostClerkUserId) {
    return null;
  }
  const db = untypedClient(clerkToken);
  const [seekerProfileId, hostProfileId] = await Promise.all([
    resolveSeekerProfileId(db, seekerClerkUserId),
    resolveHostProfileId(db, hostClerkUserId),
  ]);
  if (!seekerProfileId || !hostProfileId) return null;

  const appId = applicationId ?? null;

  const existing = await findConversation(db, seekerProfileId, hostProfileId, appId);
  if (existing) return existing;

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
  return data ? rowToConversation(data as Record<string, unknown>) : null;
}

/**
 * Host-initiated find-or-create. The caller is the HOST (verified by `auth()`),
 * so we resolve the host side from their Clerk id and take the seeker's PROFILE
 * id directly — which is all the host UI has from an applicant row. The RLS
 * INSERT policy (migration 048) permits this because the host owns the host
 * side of the thread.
 *
 * This is the entry point the host applicant UI uses to OPEN a conversation:
 * before this, `conversations` had no creator and messaging was unreachable.
 *
 * AUTHORIZATION: the host UI passes `seekerProfileId` from a query string, which
 * a host could forge to target an arbitrary seeker. So we do NOT trust it as
 * authorization evidence — we verify, under the host's own RLS-scoped token,
 * that the seeker has actually applied to one of THIS host's listings before
 * creating any thread. (Invite-only relationships, if a message entry point is
 * ever added there, would need this check extended to the `invites` table.)
 *
 * Returns null when the host profile cannot be resolved, or when no
 * host↔seeker application relationship exists.
 */
export async function getOrCreateConversationForHost(
  clerkToken: string,
  hostClerkUserId: string,
  seekerProfileId: string,
  applicationId?: string,
): Promise<Conversation | null> {
  const db = untypedClient(clerkToken);
  const hostProfileId = await resolveHostProfileId(db, hostClerkUserId);
  if (!hostProfileId) return null;

  // Relationship gate: require an application from this seeker to a listing this
  // host owns. Mirrors the getHostApplications embed (listings!listing_id!inner
  // + filter on the embedded host_profile_id) and runs under the host's token.
  const { data: relation, error: relationError } = await db
    .from("applications")
    .select("id, listings!listing_id!inner(host_profile_id)")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("listings.host_profile_id", hostProfileId)
    .limit(1);
  if (relationError) {
    throw new Error(`getOrCreateConversationForHost (relation): ${relationError.message}`);
  }
  if (!relation || relation.length === 0) return null;

  const appId = applicationId ?? null;

  const existing = await findConversation(db, seekerProfileId, hostProfileId, appId);
  if (existing) return existing;

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
    if (error.code === UNIQUE_VIOLATION) {
      return findConversation(db, seekerProfileId, hostProfileId, appId);
    }
    throw new Error(`getOrCreateConversationForHost: ${error.message}`);
  }
  return data ? rowToConversation(data as Record<string, unknown>) : null;
}
