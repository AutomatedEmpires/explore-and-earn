"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  createSavedSearch,
  deleteSavedSearch,
  type SavedSearchFilters,
} from "@explore-and-earn/db";

/**
 * Persist the seeker's current triad-first search so it can be re-run (and,
 * once the alert worker lands, notify them when a new match appears). Auth is
 * resolved server-side; the db layer scopes the write to the seeker via RLS.
 */
export async function saveSearchAction(
  filters: SavedSearchFilters,
  label: string,
): Promise<{ ok: boolean }> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false };
  const result = await createSavedSearch(token, userId, label, filters);
  if (result.ok) revalidatePath("/seek");
  return result;
}

export async function deleteSavedSearchAction(
  id: string,
): Promise<{ ok: boolean }> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false };
  const token = await getToken({ template: "supabase" });
  if (!token) return { ok: false };
  const result = await deleteSavedSearch(token, userId, id);
  if (result.ok) revalidatePath("/seek");
  return result;
}
