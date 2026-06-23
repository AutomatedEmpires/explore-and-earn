import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Saved-searches data access. A saved search is a re-runnable triad-first filter
 * set the seeker persisted from /seek. RLS (migration 041) scopes every row to
 * the requesting seeker via public.current_seeker_profile_ids(); we additionally
 * resolve + write seeker_profile_id in app code (the column is NOT NULL and the
 * insert WITH CHECK requires it). Mirrors savedListings.ts — untyped client,
 * since types.gen does not yet carry saved_searches.
 */

function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

async function resolveSeekerProfileId(
  db: SupabaseClient,
  clerkUserId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id, clerk_user_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data as { id: string }).id : null;
}

/** The filter set a saved search re-runs — the same params /seek reads from the URL. */
export interface SavedSearchFilters {
  readonly q?: string;
  readonly category?: string;
  readonly housing?: boolean;
  readonly meals?: boolean;
  readonly visa?: boolean;
  readonly startRangeMonths?: number;
  readonly payMin?: number;
  readonly payUnit?: string;
  readonly location?: string;
}

export interface SavedSearchRecord {
  readonly id: string;
  readonly label: string;
  readonly filters: SavedSearchFilters;
  readonly alertEnabled: boolean;
  readonly createdAt: string;
}

/** Rebuild the `?…` query string a saved search re-runs on /seek. */
export function savedSearchToQueryString(filters: SavedSearchFilters): string {
  const p = new URLSearchParams();
  if (filters.q) p.set("q", filters.q);
  if (filters.category) p.set("category", filters.category);
  if (filters.housing) p.set("housing", "1");
  if (filters.meals) p.set("meals", "1");
  if (filters.visa) p.set("visa", "1");
  if (filters.startRangeMonths) p.set("start_range", String(filters.startRangeMonths));
  if (filters.payMin) p.set("pay_min", String(filters.payMin));
  if (filters.payUnit) p.set("pay_unit", filters.payUnit);
  if (filters.location) p.set("location", filters.location);
  return p.toString();
}

export async function createSavedSearch(
  clerkToken: string,
  clerkUserId: string,
  label: string,
  filters: SavedSearchFilters,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false };
    }
    const { error } = await db.from("saved_searches").insert({
      seeker_profile_id: seekerProfileId,
      label: label.slice(0, 120),
      filters,
    });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}

export async function getSavedSearches(
  clerkToken: string,
  clerkUserId: string,
): Promise<SavedSearchRecord[]> {
  const db = untypedClient(clerkToken);
  const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }
  const { data, error } = await db
    .from("saved_searches")
    .select("id, label, filters, alert_enabled, created_at")
    .eq("seeker_profile_id", seekerProfileId)
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`getSavedSearches: ${error.message}`);
  }
  return ((data ?? []) as Array<{
    id: string;
    label: string;
    filters: SavedSearchFilters | null;
    alert_enabled: boolean;
    created_at: string;
  }>).map((row) => ({
    id: row.id,
    label: row.label,
    filters: row.filters ?? {},
    alertEnabled: row.alert_enabled,
    createdAt: row.created_at,
  }));
}

export async function deleteSavedSearch(
  clerkToken: string,
  clerkUserId: string,
  id: string,
): Promise<{ ok: boolean }> {
  try {
    const db = untypedClient(clerkToken);
    const seekerProfileId = await resolveSeekerProfileId(db, clerkUserId);
    if (!seekerProfileId) {
      return { ok: false };
    }
    const { error } = await db
      .from("saved_searches")
      .delete()
      .eq("id", id)
      .eq("seeker_profile_id", seekerProfileId);
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
