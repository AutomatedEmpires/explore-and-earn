/**
 * Connected proof for migration 077. Opt-in because it creates and removes
 * rows in a real local/staging Supabase database; production is hard-disabled.
 *
 * Run against `supabase start` after a local reset:
 *   SUPABASE_RLS_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SUPABASE_JWT_SECRET=... pnpm --filter @explore-and-earn/db test \
 *   listingHostStatusIntegration
 */
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const isLoopback = (() => {
  try {
    const hostname = new URL(SUPABASE_URL ?? "").hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
})();

const enabled =
  process.env.SUPABASE_RLS_INTEGRATION === "1" &&
  Boolean(SUPABASE_URL && ANON_KEY && SERVICE_ROLE_KEY && JWT_SECRET) &&
  isLoopback;

async function mintToken(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated", aud: "authenticated", sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET));
}

describe.skipIf(!enabled)("listing host status transitions (connected RLS)", () => {
  it("blocks moderation bypasses while preserving host and service-role transitions", async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const clerkUserId = `user_listing_lifecycle_${Date.now()}`;
    const token = await mintToken(clerkUserId);
    const host = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const profile = await host.rpc("create_my_host_profile", {
      p_company_name: "Lifecycle Integration Host",
      p_category_scopes: ["farm"],
      p_primary_location_name: "Local integration test",
    });
    expect(profile.error).toBeNull();
    const hostProfileId = profile.data as string;

    const completeDraft = {
      host_profile_id: hostProfileId,
      title: "Lifecycle integration listing",
      category: "farm",
      status: "draft",
      housing_included: false,
      meals_included: false,
      housing_evidence: "confirmed",
      meals_evidence: "confirmed",
      pay_evidence: "confirmed",
      compensation_min_cents: 100,
    };

    try {
      const directLive = await host.from("listings").insert({
        ...completeDraft,
        title: "Must never publish directly",
        status: "live",
      });
      expect(directLive.error?.code).toBe("23514");
      expect(directLive.error?.message).toContain("listing_initial_status_must_be_draft");

      const inserted = await host
        .from("listings")
        .insert([
          { ...completeDraft, title: "Approve path" },
          { ...completeDraft, title: "Hold path" },
          { ...completeDraft, title: "Reject path" },
        ])
        .select("id,status");
      expect(inserted.error).toBeNull();
      expect(inserted.data).toHaveLength(3);
      const [approveId, holdId, rejectId] = (inserted.data ?? []).map(
        (row) => (row as { id: string }).id,
      );

      const submitted = await host
        .from("listings")
        .update({ status: "under_review" })
        .in("id", [approveId, holdId, rejectId])
        .select("id,status");
      expect(submitted.error).toBeNull();
      expect(submitted.data).toHaveLength(3);

      const bypassApproval = await host
        .from("listings")
        .update({ status: "live" })
        .eq("id", approveId);
      expect(bypassApproval.error?.code).toBe("23514");
      expect(bypassApproval.error?.message).toContain(
        "listing_host_status_transition_forbidden",
      );

      const approved = await admin
        .from("listings")
        .update({ status: "live" })
        .eq("id", approveId)
        .select("status")
        .single();
      expect(approved.error).toBeNull();
      expect(approved.data?.status).toBe("live");

      const held = await admin
        .from("listings")
        .update({ status: "draft" })
        .eq("id", holdId)
        .select("status")
        .single();
      expect(held.error).toBeNull();
      expect(held.data?.status).toBe("draft");

      const rejected = await admin
        .from("listings")
        .update({ status: "closed" })
        .eq("id", rejectId)
        .select("status")
        .single();
      expect(rejected.error).toBeNull();
      expect(rejected.data?.status).toBe("closed");

      for (const status of ["paused", "live", "archived"] as const) {
        const transition = await host
          .from("listings")
          .update({ status })
          .eq("id", approveId)
          .select("status")
          .single();
        expect(transition.error).toBeNull();
        expect(transition.data?.status).toBe(status);
      }

      const archivedToLive = await host
        .from("listings")
        .update({ status: "live" })
        .eq("id", approveId);
      expect(archivedToLive.error?.code).toBe("23514");

      const closedToLive = await host
        .from("listings")
        .update({ status: "live" })
        .eq("id", rejectId);
      expect(closedToLive.error?.code).toBe("23514");
    } finally {
      const cleanup = await admin.from("host_profiles").delete().eq("id", hostProfileId);
      expect(cleanup.error).toBeNull();
    }
  });
});
