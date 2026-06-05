"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "@explore-and-earn/db";
import {
  MARKETPLACE_CATEGORIES,
  type ListingStatus,
  type MarketplaceCategory,
} from "@explore-and-earn/contracts";

export type ListingActionResult =
  | { status: "success"; id: string }
  | { status: "error"; message: string };

interface ListingWriteModel {
  title: string;
  description: string | null;
  category: MarketplaceCategory;
  status: ListingStatus;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  housing_included: boolean;
  meals_included: boolean;
  compensation_summary: string | null;
}

/**
 * Resolve an authenticated, RLS-scoped Supabase client for the current Clerk
 * user. Listing mutations require Clerk auth \u2014 there are no anon writes.
 */
async function getAuthedDb(): Promise<{ db: SupabaseClient } | { error: string }> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return { error: "You must be signed in as a host to manage listings." };
  }

  const token = await getToken();
  if (!token) {
    return { error: "Your session has expired \u2014 sign in again to continue." };
  }

  // authedClient is typed against the placeholder GeneratedDatabase (see
  // packages/db/src/types.gen.ts). Until generated types land, cast to the
  // default untyped client so table access type-checks.
  return { db: authedClient(token) as unknown as SupabaseClient };
}

function resolveCategory(raw: FormDataEntryValue | null): MarketplaceCategory | null {
  const value = typeof raw === "string" ? raw : "";
  return (MARKETPLACE_CATEGORIES as readonly string[]).includes(value)
    ? (value as MarketplaceCategory)
    : null;
}

/**
 * The host form exposes a simple draft/active toggle. listings.status has no
 * "active" value (see contracts enums.ts LISTING_STATUS and
 * supabase/migrations/006_listings.sql) \u2014 "active" maps to the published
 * "live" state. No publish gating is applied yet.
 */
function resolveStatus(raw: FormDataEntryValue | null): ListingStatus {
  return raw === "active" ? "live" : "draft";
}

function parseNumeric(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readListingForm(
  formData: FormData,
): { model: ListingWriteModel } | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  if (title.length === 0) {
    return { error: "A listing title is required." };
  }

  const category = resolveCategory(formData.get("category"));
  if (!category) {
    return { error: "Choose a valid category for the listing." };
  }

  const housingProvision = String(formData.get("housingProvision") ?? "not_provided");
  const mealsProvision = String(formData.get("mealsProvision") ?? "not_provided");
  const payProvision = String(formData.get("payProvision") ?? "not_provided");
  const housingSummary = String(formData.get("housingSummary") ?? "").trim();
  const mealsSummary = String(formData.get("mealsSummary") ?? "").trim();
  const paySummary = String(formData.get("paySummary") ?? "").trim();

  const hasBenefit =
    housingProvision !== "not_provided" ||
    mealsProvision !== "not_provided" ||
    payProvision !== "not_provided" ||
    housingSummary.length > 0 ||
    mealsSummary.length > 0 ||
    paySummary.length > 0;
  if (!hasBenefit) {
    return { error: "Add at least one benefit \u2014 Housing, Meals, or Pay." };
  }

  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();

  return {
    model: {
      title,
      description: description.length > 0 ? description : null,
      category,
      status: resolveStatus(formData.get("status")),
      location_display: location.length > 0 ? location : null,
      latitude: parseNumeric(formData.get("latitude")),
      longitude: parseNumeric(formData.get("longitude")),
      // BenefitTriad -> columns in 006_listings.sql: housing/meals map to the
      // boolean inclusion flags, pay maps to compensation_summary. There is no
      // free-text housing/meals column yet, so only the inclusion flag persists.
      housing_included:
        housingProvision !== "not_provided" || housingSummary.length > 0,
      meals_included: mealsProvision !== "not_provided" || mealsSummary.length > 0,
      compensation_summary: paySummary.length > 0 ? paySummary : null,
    },
  };
}

/**
 * Resolve the caller's host profile id. host_profiles is owner-scoped, so under
 * the host's authed (RLS) client this returns their own profile without
 * inventing a Clerk-linkage column (identity wiring is founder-gated, #105).
 */
async function resolveHostProfileId(db: SupabaseClient): Promise<string | null> {
  const { data, error } = await db
    .from("host_profiles")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return (data as { id: string }).id;
}

export async function createListing(
  formData: FormData,
): Promise<ListingActionResult> {
  const authResult = await getAuthedDb();
  if ("error" in authResult) {
    return { status: "error", message: authResult.error };
  }
  const { db } = authResult;

  const parsed = readListingForm(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const hostProfileId = await resolveHostProfileId(db);
  if (!hostProfileId) {
    return {
      status: "error",
      message: "No host profile found for your account. Create a host profile first.",
    };
  }

  const { data, error } = await db
    .from("listings")
    .insert({ ...parsed.model, host_profile_id: hostProfileId })
    .select("id")
    .single();

  if (error || !data) {
    return {
      status: "error",
      message: error?.message ?? "Could not create the listing.",
    };
  }

  revalidatePath("/host/listings");
  return { status: "success", id: (data as { id: string }).id };
}

export async function updateListing(
  id: string,
  formData: FormData,
): Promise<ListingActionResult> {
  if (!id) {
    return { status: "error", message: "Missing listing id." };
  }

  const authResult = await getAuthedDb();
  if ("error" in authResult) {
    return { status: "error", message: authResult.error };
  }
  const { db } = authResult;

  const parsed = readListingForm(formData);
  if ("error" in parsed) {
    return { status: "error", message: parsed.error };
  }

  const { data, error } = await db
    .from("listings")
    .update(parsed.model)
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return {
      status: "error",
      message: error?.message ?? "Could not update the listing.",
    };
  }

  revalidatePath("/host/listings");
  revalidatePath(`/host/listings/${id}`);
  return { status: "success", id: (data as { id: string }).id };
}
