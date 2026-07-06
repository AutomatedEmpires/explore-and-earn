import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@explore-and-earn/db";

/**
 * Best-effort assistant persistence (audit + continuity).
 *
 * Writes go through the service role (assistant_* tables are RLS-owner-read,
 * service-role-write — parity with events / match_scores). Every function is
 * best-effort and never throws into the stream: a failed audit write must not
 * break the user's chat.
 *
 * Threads are role-agnostic (migration 055): a thread belongs to EXACTLY ONE
 * owner — a seeker or a host — so the host listing-coach persists the same way
 * the seeker guide does.
 */

function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** Which owner a thread belongs to — a seeker or a host, never both. */
type ThreadOwner =
  | { readonly kind: "seeker"; readonly seekerProfileId: string }
  | { readonly kind: "host"; readonly hostProfileId: string };

/** The owner's discriminating column + value (the CHECK enforces exactly one). */
function ownerColumn(owner: ThreadOwner): { readonly column: string; readonly value: string } {
  return owner.kind === "seeker"
    ? { column: "seeker_profile_id", value: owner.seekerProfileId }
    : { column: "host_profile_id", value: owner.hostProfileId };
}

/** Reuse the owner's most recent thread, or create one. Returns its id or null. */
async function ensureThread(owner: ThreadOwner, clerkUserId: string): Promise<string | null> {
  const client = db();
  const now = new Date().toISOString();
  const { column, value } = ownerColumn(owner);

  const { data: existing } = await client
    .from("assistant_threads")
    .select("id")
    .eq(column, value)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && (existing as { id?: unknown }).id) {
    const id = String((existing as { id: unknown }).id);
    await client.from("assistant_threads").update({ updated_at: now }).eq("id", id);
    return id;
  }

  const { data: created, error } = await client
    .from("assistant_threads")
    .insert({ [column]: value, clerk_user_id: clerkUserId })
    .select("id")
    .single();
  if (error || !created) return null;
  return String((created as { id: unknown }).id);
}

/** Append one user turn + the assistant reply to the owner's thread. */
async function logTurn(
  owner: ThreadOwner,
  clerkUserId: string,
  userParts: unknown,
  assistantParts: unknown,
): Promise<void> {
  try {
    const threadId = await ensureThread(owner, clerkUserId);
    if (!threadId) return;
    await db()
      .from("assistant_messages")
      .insert([
        { thread_id: threadId, role: "user", parts: userParts ?? [] },
        { thread_id: threadId, role: "assistant", parts: assistantParts ?? [] },
      ]);
  } catch {
    // Best-effort audit: never break the stream on a persistence failure.
  }
}

/** One persisted transcript message, shaped for useChat's initial messages. */
export interface PersistedAssistantMessage {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly parts: unknown[];
}

/**
 * Read the owner's most recent thread transcript (oldest → newest, last 40)
 * so a chat mount RESUMES the conversation instead of starting blank —
 * migrations 053/055 built owner-scoped reads for exactly this.
 */
async function readThreadMessages(owner: ThreadOwner): Promise<PersistedAssistantMessage[]> {
  try {
    const client = db();
    const { column, value } = ownerColumn(owner);
    const { data: thread } = await client
      .from("assistant_threads")
      .select("id")
      .eq(column, value)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!thread) return [];

    const { data: rows } = await client
      .from("assistant_messages")
      .select("id, role, parts, created_at")
      .eq("thread_id", String((thread as { id: unknown }).id))
      .order("created_at", { ascending: false })
      .limit(40);

    return ((rows ?? []) as Array<Record<string, unknown>>)
      .reverse()
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        id: String(r.id),
        role: r.role as "user" | "assistant",
        parts: Array.isArray(r.parts) ? (r.parts as unknown[]) : [],
      }))
      .filter((m) => m.parts.length > 0);
  } catch {
    return []; // resume is an enhancement — a failed read starts a fresh chat
  }
}

export async function readSeekerThreadMessages(
  seekerProfileId: string,
): Promise<PersistedAssistantMessage[]> {
  return readThreadMessages({ kind: "seeker", seekerProfileId });
}

export async function readHostThreadMessages(
  hostProfileId: string,
): Promise<PersistedAssistantMessage[]> {
  return readThreadMessages({ kind: "host", hostProfileId });
}

/**
 * Persist one seeker turn (user message + assistant reply). Parts are the AI SDK
 * UIMessage parts (transcript) — no separate free-text explanation is stored.
 */
export async function logAssistantTurn(args: {
  seekerProfileId: string;
  clerkUserId: string;
  userParts: unknown;
  assistantParts: unknown;
}): Promise<void> {
  await logTurn(
    { kind: "seeker", seekerProfileId: args.seekerProfileId },
    args.clerkUserId,
    args.userParts,
    args.assistantParts,
  );
}

/** Persist one host listing-coach turn (user message + assistant reply). */
export async function logHostAssistantTurn(args: {
  hostProfileId: string;
  clerkUserId: string;
  userParts: unknown;
  assistantParts: unknown;
}): Promise<void> {
  await logTurn(
    { kind: "host", hostProfileId: args.hostProfileId },
    args.clerkUserId,
    args.userParts,
    args.assistantParts,
  );
}
