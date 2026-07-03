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
 */

function db(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** Reuse the seeker's most recent thread, or create one. Returns its id or null. */
async function ensureThread(
  seekerProfileId: string,
  clerkUserId: string,
): Promise<string | null> {
  const client = db();
  const now = new Date().toISOString();

  const { data: existing } = await client
    .from("assistant_threads")
    .select("id")
    .eq("seeker_profile_id", seekerProfileId)
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
    .insert({ seeker_profile_id: seekerProfileId, clerk_user_id: clerkUserId })
    .select("id")
    .single();
  if (error || !created) return null;
  return String((created as { id: unknown }).id);
}

/**
 * Append one user turn + the assistant reply to the seeker's thread. Parts are
 * the AI SDK UIMessage parts (transcript) — no separate free-text explanation is
 * stored beyond the messages themselves.
 */
export async function logAssistantTurn(args: {
  seekerProfileId: string;
  clerkUserId: string;
  userParts: unknown;
  assistantParts: unknown;
}): Promise<void> {
  try {
    const threadId = await ensureThread(args.seekerProfileId, args.clerkUserId);
    if (!threadId) return;
    await db()
      .from("assistant_messages")
      .insert([
        { thread_id: threadId, role: "user", parts: args.userParts ?? [] },
        { thread_id: threadId, role: "assistant", parts: args.assistantParts ?? [] },
      ]);
  } catch {
    // Best-effort audit: never break the stream on a persistence failure.
  }
}
