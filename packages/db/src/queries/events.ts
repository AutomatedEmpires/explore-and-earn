import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventType } from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";

/**
 * Analytics event recorder over the append-only `public.events` log
 * (migration 008_notifications_events.sql). Nothing writes this table today —
 * this module is the one and only entry point for it.
 *
 * Writes go through the SERVICE ROLE client (`adminClient`) because `events`
 * is RLS deny-by-default: there are no authenticated insert policies, by
 * design (the log must not be forgeable/editable from the client).
 *
 * BEST-EFFORT, ALWAYS: analytics must never break a product path. Every
 * exported function here swallows all failures (bad env, network, schema
 * drift, an event_type not yet seeded into event_types) and reports failure
 * via a boolean/count return instead of throwing.
 *
 * IDENTITY: `actor_user_id` is a uuid column but Clerk ids are not uuids —
 * this module never sets it (left null on every insert). Do not add a Clerk
 * id, email, or any other directly-identifying value to `properties`.
 *
 * PRIVACY: `properties` must never contain emails, names, auth tokens, or
 * other free-text user content. Keep it to small, bounded, non-identifying
 * values (counts, ids that are already columns elsewhere, enum-like strings).
 */

export interface RecordEventInput {
  readonly eventType: EventType;
  readonly actorScope?: "seeker" | "host" | "admin" | "platform";
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly listingId?: string;
  readonly hostProfileId?: string;
  readonly seekerProfileId?: string;
  readonly sourceSurface?: string;
  readonly properties?: Record<string, string | number | boolean | null>;
}

/** Untyped Supabase handle (events predates/exceeds generated types.gen). */
function admin(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** Map a {@link RecordEventInput} onto the `events` row shape. */
function toRow(input: RecordEventInput): Record<string, unknown> {
  return {
    event_type: input.eventType,
    actor_scope: input.actorScope ?? null,
    subject_type: input.subjectType ?? null,
    subject_id: input.subjectId ?? null,
    listing_id: input.listingId ?? null,
    host_profile_id: input.hostProfileId ?? null,
    seeker_profile_id: input.seekerProfileId ?? null,
    source_surface: input.sourceSurface ?? null,
    properties: input.properties ?? {},
  };
}

/**
 * Record one analytics event. Never throws — returns false on ANY failure
 * (missing env, insert error, or an unexpected exception).
 */
export async function recordEvent(input: RecordEventInput): Promise<boolean> {
  try {
    const { error } = await admin().from("events").insert(toRow(input));
    return !error;
  } catch {
    return false;
  }
}

/**
 * Record many analytics events in a single batched insert. Never throws —
 * returns the number of rows inserted, or 0 on any failure. `inputs` may be
 * empty (returns 0 without an I/O call).
 */
export async function recordEvents(
  inputs: readonly RecordEventInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  try {
    const rows = inputs.map(toRow);
    const { error } = await admin().from("events").insert(rows);
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}
