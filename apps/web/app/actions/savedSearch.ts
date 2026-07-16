"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import {
  createSavedSearch,
  deleteSavedSearch,
  type SavedSearchFilters,
} from "@explore-and-earn/db";

import { checkRateLimit } from "../../lib/rateLimit";

// Action-boundary input caps. The db layer truncates the label at 120 chars, so
// 200 rejects nothing a legitimate client sends; the filters object is a small
// fixed set of scalar search params — 4 KB serialized is orders of magnitude
// above any real /seek filter set and blocks bulk-junk row creation.
const MAX_LABEL_CHARS = 200;
const MAX_FILTERS_JSON_BYTES = 4096;

/**
 * Persist the seeker's current triad-first search so it can be re-run (and,
 * once the alert worker lands, notify them when a new match appears). Auth is
 * resolved server-side; the db layer scopes the write to the seeker via RLS.
 */
export async function saveSearchAction(
  filters: SavedSearchFilters,
  label: string,
): Promise<{ ok: boolean; error?: string }> {
  const { userId, getToken } = await auth();
  if (!userId) return { ok: false };

  // Rate limit: 10 saved searches per hour per seeker. Checked after auth,
  // before any DB work (each row also becomes saved-search-alert cron work).
  const { allowed } = checkRateLimit(`saved-search:${userId}`, 10, 60 * 60 * 1000);
  if (!allowed) return { ok: false, error: "rate_limit_exceeded" };

  if (typeof label !== "string" || label.length > MAX_LABEL_CHARS) {
    return { ok: false, error: "invalid_input" };
  }
  if (!filters || typeof filters !== "object") {
    return { ok: false, error: "invalid_input" };
  }
  // ACTUAL bytes (UTF-8), not UTF-16 code units — and a filters object that
  // cannot serialize at all (cycles, BigInt) is invalid input, never a 500.
  try {
    if (new TextEncoder().encode(JSON.stringify(filters)).length > MAX_FILTERS_JSON_BYTES) {
      return { ok: false, error: "invalid_input" };
    }
  } catch {
    return { ok: false, error: "invalid_input" };
  }

  const token = await getToken();
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
  const token = await getToken();
  if (!token) return { ok: false };
  const result = await deleteSavedSearch(token, userId, id);
  if (result.ok) revalidatePath("/seek");
  return result;
}
