/**
 * Connected proof for migrations 083 and 086. Opt-in, because it creates and
 * removes rows in a real local Supabase database; a non-loopback URL hard-
 * disables it.
 *
 * Run against `supabase start` after a local reset:
 *   SUPABASE_RLS_INTEGRATION=1 NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   SUPABASE_JWT_SECRET=... pnpm --filter @explore-and-earn/db test \
 *   entitlementEnforcementIntegration
 *
 * WHY IT EXISTS. Every entitlement in this wave was previously "enforced" by a
 * server action, which is not enforcement at all: the anon key ships in the
 * client bundle, so a host holding their own Clerk JWT can speak to PostgREST
 * directly and never execute a line of application code. So each case below
 * performs the raw write a host could send by hand — a POST to
 * /host_announcements, a PATCH of listings.status, an INSERT into
 * host_subscriptions — and asserts the REFUSAL. Every refusal is paired with a
 * positive control that must still succeed, because a gate that refuses
 * everything is indistinguishable from a broken table.
 *
 * COMMERCIAL REDESIGN D6 MOVED ONE OF THOSE REFUSALS AND KEPT THE REST.
 * Migration 086 removed the paid-tier refusal from create_my_host_profile, so
 * creation now SUCCEEDS unpaid and the publication refusal is what carries the
 * paid line. Both are asserted below on the same host, in that order — the
 * "build first, pay to publish" block is the one that fails if the founder's
 * rule is ever weakened by accident.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { afterAll, describe, expect, it } from "vitest";

import {
  announceIntegrationGate,
  resolveIntegrationGate,
} from "./support/integrationGate.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

const GATE_LABEL = "entitlementEnforcementIntegration (migration 083)";
const gate = resolveIntegrationGate(
  { label: GATE_LABEL, requiresOptIn: true },
  process.env,
);
const enabled = gate.enabled;

// ALWAYS RUNS. Without it this whole file reported as a grey line inside a green
// total, so eighteen assertions about 083's refusals could be absent and the run
// still read as full coverage.
describe(`${GATE_LABEL} — coverage gate`, () => {
  it("either runs against a database or says out loud that it did not", () => {
    expect(announceIntegrationGate(GATE_LABEL, gate)).toBe(gate.enabled);
  });
});

const RUN = `it${Date.now()}`;
const clerkId = (suffix: string) => `user_ent_${RUN}_${suffix}`;

async function mintToken(sub: string): Promise<string> {
  return new SignJWT({ role: "authenticated", aud: "authenticated", sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(JWT_SECRET!));
}

function admin(): SupabaseClient {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

/** A client shaped exactly like a browser holding the public anon key. */
async function asHost(sub: string): Promise<SupabaseClient> {
  const token = await mintToken(sub);
  return createClient(SUPABASE_URL!, ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function grantSubscription(sub: string, tier: string): Promise<void> {
  const { error } = await admin()
    .from("host_subscriptions")
    .upsert({ clerk_user_id: sub, tier, billing_status: "active" }, {
      onConflict: "clerk_user_id",
    });
  expect(error).toBeNull();
}

/** Create a paid host and return its profile id. */
async function provisionHost(sub: string, tier: string): Promise<string> {
  await grantSubscription(sub, tier);
  const host = await asHost(sub);
  const created = await host.rpc("create_my_host_profile", {
    p_company_name: `Entitlement ${sub}`,
    p_category_scopes: ["farm"],
    p_primary_location_name: "Integration",
  });
  expect(created.error).toBeNull();
  return created.data as string;
}

const COMPLETE_DRAFT = {
  category: "farm",
  status: "draft",
  housing_included: false,
  meals_included: false,
  housing_evidence: "confirmed",
  meals_evidence: "confirmed",
  pay_evidence: "confirmed",
  compensation_min_cents: 22_000,
  location_display: "Integration",
} as const;

async function seedDraft(hostProfileId: string, title: string): Promise<string> {
  const { data, error } = await admin()
    .from("listings")
    .insert({ ...COMPLETE_DRAFT, host_profile_id: hostProfileId, title })
    .select("id")
    .single();
  expect(error).toBeNull();
  return (data as { id: string }).id;
}

afterAll(async () => {
  if (!enabled) return;
  const db = admin();
  const { data: hosts } = await db
    .from("host_profiles")
    .select("id")
    .like("clerk_user_id", `user_ent_${RUN}_%`);
  const ids = (hosts ?? []).map((h: { id: string }) => h.id);
  if (ids.length > 0) {
    await db.from("listings").delete().in("host_profile_id", ids);
    await db.from("host_announcements").delete().in("host_profile_id", ids);
    await db.from("host_profiles").delete().in("id", ids);
  }
  await db.from("host_subscriptions").delete().like("clerk_user_id", `user_ent_${RUN}_%`);
});

// ── Build first, pay to publish (migrations 083 + 086) ─────────────────────
//
// THE CONTRACT, AND WHY IT IS PROVED HERE RATHER THAN ANYWHERE ELSE. These
// requests go through raw PostgREST holding the anon key and a real Clerk-shaped
// JWT — the shape a host actually has, since the anon key ships in the client
// bundle. No application code runs. What refuses here is the database or nothing
// refuses at all.
//
// Creation is ALLOWED with no plan (086). Publication is REFUSED with no plan
// (083's trigger, untouched). Both halves are asserted, in that order, on ONE
// host — because "creation works" and "publication is refused" are only
// reassuring together. Either alone describes a different product.

describe.skipIf(!enabled)("pre-billing host mode (migrations 083 + 086)", () => {
  it("ALLOWS host profile creation for a user with no subscription", async () => {
    const sub = clerkId("prospect");
    const host = await asHost(sub);

    const created = await host.rpc("create_my_host_profile", {
      p_company_name: "Prospect Farm",
      p_category_scopes: ["farm"],
      p_primary_location_name: "Nowhere",
    });

    expect(created.error).toBeNull();
    expect(typeof created.data).toBe("string");

    const { data: rows } = await admin()
      .from("host_profiles")
      .select("id, subscription_tier")
      .eq("clerk_user_id", sub);
    expect(rows ?? []).toHaveLength(1);
    // Born honest: the denormalized copy says 'none', which is exactly what
    // makes the allowance trigger refuse the publication asserted below.
    expect((rows as { subscription_tier: string }[])[0].subscription_tier).toBe("none");
  });

  /**
   * THE REGRESSION PIN THE WHOLE CHANGE RESTS ON.
   *
   * A prospect may hold drafts without limit and may publish nothing. TWO
   * DIFFERENT FENCES enforce that, and naming them apart is the correction: an
   * earlier version of this test expected `listing_allowance_exceeded` on both
   * edges and was wrong about the second.
   *
   * Both are BEFORE triggers on `listings`, and BEFORE triggers fire in NAME
   * order — trg_listings_host_status_transition (082) before
   * trg_listings_plan_allowance (083), which is exactly what 083's header says
   * it arranged, so that a forbidden transition reports as forbidden rather
   * than as an allowance failure checked first.
   *
   *   draft -> under_review  legal edge, so the ALLOWANCE answers. This is the
   *                          real entitlement gate: the slot is charged at
   *                          submit time, so the refusal lands one step BEFORE
   *                          the publish button. Asserting only `live` would
   *                          pass while under_review was quietly exempted, and
   *                          a prospect could park listings in review forever.
   *   draft -> live          NOT a legal host edge under 082 at all, so the
   *                          TRANSITION trigger refuses it first and the
   *                          allowance is never consulted.
   */
  it("REFUSES publication for that same prospect, at both fences", async () => {
    const sub = clerkId("prospectpub");
    const host = await asHost(sub);
    const created = await host.rpc("create_my_host_profile", {
      p_company_name: "Prospect Publisher",
      p_category_scopes: ["farm"],
      p_primary_location_name: "Integration",
    });
    expect(created.error).toBeNull();
    const profileId = created.data as string;

    // Drafts are free on every tier, including 'none' — a draft is not a
    // counted status. Seeded under the service role because a host's own INSERT
    // path is not what is under test here; the transitions below are.
    const draftId = await seedDraft(profileId, "Prospect draft");
    const secondDraft = await seedDraft(profileId, "Prospect draft two");
    expect(typeof draftId).toBe("string");
    expect(typeof secondDraft).toBe("string");

    // The entitlement fence.
    const review = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", draftId);
    expect(review.error, "a prospect must not move a listing into review").not.toBeNull();
    expect(review.error?.message).toContain("listing_allowance_exceeded");

    // The transition fence. Pinned by its own name: accepting any error here
    // would let the allowance stop firing above while this still passed.
    const live = await host
      .from("listings")
      .update({ status: "live" })
      .eq("id", draftId);
    expect(live.error, "a prospect must not skip review to publish").not.toBeNull();
    expect(live.error?.message).toContain("listing_host_status_transition_forbidden");

    // Nothing became public as a side effect of trying.
    const { data: after } = await admin()
      .from("listings")
      .select("status")
      .eq("host_profile_id", profileId);
    for (const row of (after ?? []) as { status: string }[]) {
      expect(row.status).toBe("draft");
    }
  });

  /**
   * The positive control for the pair above: the SAME host, once paid, publishes.
   * Without this, "publication is refused" is satisfied by a database that
   * refuses everyone.
   */
  it("PUBLISHES once that prospect activates a plan (positive control)", async () => {
    const sub = clerkId("activates");
    const host = await asHost(sub);
    const created = await host.rpc("create_my_host_profile", {
      p_company_name: "Activating Farm",
      p_category_scopes: ["farm"],
      p_primary_location_name: "Integration",
    });
    expect(created.error).toBeNull();
    const profileId = created.data as string;
    const draftId = await seedDraft(profileId, "Draft that will go live");

    // Refused for the entitlement reason specifically, before the plan exists.
    const blocked = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", draftId);
    expect(blocked.error).not.toBeNull();
    expect(blocked.error?.message).toContain("listing_allowance_exceeded");

    await grantSubscription(sub, "starter");

    // THE LEGAL PATH, in full. Not a shortcut: draft -> live is refused for a
    // PAID host too (082 has no such edge), so publishing is always two steps.
    // The draft's preconditions are real, not faked — seedDraft states the
    // whole benefit triad with a pay figure (070) and leaves housing_included
    // false, so 072's photo gate does not apply.
    for (const target of ["under_review", "live"] as const) {
      const moved = await host
        .from("listings")
        .update({ status: target })
        .eq("id", draftId);
      expect(moved.error, `a paid host must reach ${target}`).toBeNull();
    }

    const { data: row } = await admin()
      .from("listings")
      .select("status")
      .eq("id", draftId)
      .single();
    expect((row as { status: string }).status).toBe("live");
  });

  it("ALLOWS creation with a paid tier recorded first (the other order)", async () => {
    const sub = clerkId("paid");
    const profileId = await provisionHost(sub, "starter");
    expect(typeof profileId).toBe("string");

    const { data } = await admin()
      .from("host_profiles")
      .select("subscription_tier")
      .eq("id", profileId)
      .single();
    // The denormalized copy is seeded from the authority, never left at 'none'.
    expect((data as { subscription_tier: string }).subscription_tier).toBe("starter");
  });

  it("REFUSES a direct insert of a subscription row — a host cannot buy a tier for free", async () => {
    const sub = clerkId("selfgrant");
    const host = await asHost(sub);

    const inserted = await host
      .from("host_subscriptions")
      .insert({ clerk_user_id: sub, tier: "enterprise", billing_status: "active" });
    expect(inserted.error).not.toBeNull();

    // The refusal is real, not an artefact of the table being unreachable: the
    // service role writes the same row and it lands. (Under 086 this is checked
    // by reading the row back rather than by whether profile creation succeeds —
    // creation now succeeds either way, so it proves nothing about entitlement.)
    await grantSubscription(sub, "starter");
    const { data: row } = await admin()
      .from("host_subscriptions")
      .select("tier")
      .eq("clerk_user_id", sub)
      .single();
    expect((row as { tier: string }).tier).toBe("starter");
  });

  it("REFUSES a direct update that would upgrade the caller's own tier", async () => {
    const sub = clerkId("upgrade");
    await provisionHost(sub, "starter");
    const host = await asHost(sub);

    const updated = await host
      .from("host_subscriptions")
      .update({ tier: "enterprise" })
      .eq("clerk_user_id", sub);
    expect(updated.error).not.toBeNull();

    const { data } = await admin()
      .from("host_subscriptions")
      .select("tier")
      .eq("clerk_user_id", sub)
      .single();
    expect((data as { tier: string }).tier).toBe("starter");
  });

  it("lets a host read their OWN subscription row and no one else's", async () => {
    const mine = clerkId("reader");
    const theirs = clerkId("stranger");
    await provisionHost(mine, "professional");
    await grantSubscription(theirs, "enterprise");

    const host = await asHost(mine);
    const { data, error } = await host.from("host_subscriptions").select("clerk_user_id, tier");

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
    expect((data as { clerk_user_id: string }[])[0].clerk_user_id).toBe(mine);
  });
});

// ── Announcement quota ─────────────────────────────────────────────────────

describe.skipIf(!enabled)("announcement quota (migration 083)", () => {
  it("REFUSES a direct PostgREST insert into host_announcements", async () => {
    const sub = clerkId("annsdirect");
    const profileId = await provisionHost(sub, "enterprise");
    const host = await asHost(sub);

    // This is the exact request the old ownership-only WITH CHECK allowed, in
    // unlimited quantity.
    const inserted = await host.from("host_announcements").insert({
      host_profile_id: profileId,
      title: "Direct",
      body: "Straight to PostgREST",
      kind: "general",
      status: "active",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(inserted.error).not.toBeNull();

    const { count } = await admin()
      .from("host_announcements")
      .select("id", { count: "exact", head: true })
      .eq("host_profile_id", profileId);
    expect(count ?? 0).toBe(0);
  });

  it("REFUSES a direct update — no rewriting an announcement after the fact", async () => {
    const sub = clerkId("annsupdate");
    const profileId = await provisionHost(sub, "professional");

    const { data: seeded, error: seedError } = await admin()
      .from("host_announcements")
      .insert({
        host_profile_id: profileId,
        title: "",
        body: "",
        kind: "general",
        status: "draft",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        stripe_payment_intent_id: `pi_${RUN}`,
      })
      .select("id, expires_at")
      .single();
    expect(seedError).toBeNull();
    const draft = seeded as { id: string; expires_at: string };

    const host = await asHost(sub);
    const updated = await host
      .from("host_announcements")
      .update({
        status: "active",
        expires_at: new Date(Date.now() + 10 * 365 * 86_400_000).toISOString(),
        purchase_amount_cents: 1,
      })
      .eq("id", draft.id);

    expect(updated.error).not.toBeNull();

    const { data: after } = await admin()
      .from("host_announcements")
      .select("status, expires_at")
      .eq("id", draft.id)
      .single();
    const row = after as { status: string; expires_at: string };
    expect(row.status).toBe("draft");
    expect(row.expires_at).toBe(draft.expires_at);
  });

  it("gives a professional host exactly one included announcement, then refuses", async () => {
    const sub = clerkId("annsquota");
    const profileId = await provisionHost(sub, "professional");
    const host = await asHost(sub);

    const first = await host.rpc("create_my_host_announcement", {
      p_title: "Harvest crew wanted",
      p_body: "We are hiring for the autumn pick.",
      p_kind: "hiring",
    });
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("string");

    const second = await host.rpc("create_my_host_announcement", {
      p_title: "And another",
      p_body: "Second one this month.",
      p_kind: "general",
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.message).toContain("announcement_quota_exceeded");

    const { count } = await admin()
      .from("host_announcements")
      .select("id", { count: "exact", head: true })
      .eq("host_profile_id", profileId);
    expect(count ?? 0).toBe(1);
  });

  it("gives a starter host none at all", async () => {
    const sub = clerkId("annsstarter");
    await provisionHost(sub, "starter");
    const host = await asHost(sub);

    const attempt = await host.rpc("create_my_host_announcement", {
      p_title: "Included?",
      p_body: "Starter includes no announcements.",
      p_kind: "general",
    });
    expect(attempt.error).not.toBeNull();
    expect(attempt.error?.message).toContain("announcement_quota_exceeded");
  });

  it("does not let a PURCHASED placement consume the included allowance", async () => {
    const sub = clerkId("annspaid");
    const profileId = await provisionHost(sub, "professional");

    // The Stripe webhook's paid draft, created under the service role.
    const { error: paidError } = await admin().from("host_announcements").insert({
      host_profile_id: profileId,
      title: "Paid",
      body: "Bought placement",
      kind: "general",
      status: "active",
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      stripe_payment_intent_id: `pi_paid_${RUN}`,
      stripe_checkout_session_id: `cs_paid_${RUN}`,
    });
    expect(paidError).toBeNull();

    const host = await asHost(sub);
    const included = await host.rpc("create_my_host_announcement", {
      p_title: "Included",
      p_body: "The one the plan pays for.",
      p_kind: "general",
    });
    expect(included.error).toBeNull();
  });
});

// ── Listing allowance ──────────────────────────────────────────────────────

describe.skipIf(!enabled)("listing allowance (migration 083)", () => {
  it("REFUSES a direct PATCH that would exceed the plan allowance", async () => {
    const sub = clerkId("capdirect");
    const profileId = await provisionHost(sub, "starter");
    const first = await seedDraft(profileId, "Cap first");
    const second = await seedDraft(profileId, "Cap second");

    const host = await asHost(sub);

    // Positive control: the first one fits.
    const ok = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", first)
      .select("id");
    expect(ok.error).toBeNull();
    expect(ok.data ?? []).toHaveLength(1);

    // The refusal. This is the raw request — no server action involved.
    const refused = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", second)
      .select("id");
    expect(refused.error).not.toBeNull();
    expect(refused.error?.message).toContain("listing_allowance_exceeded");

    const { data: after } = await admin()
      .from("listings")
      .select("status")
      .eq("id", second)
      .single();
    expect((after as { status: string }).status).toBe("draft");
  });

  it("counts a QUEUED under_review listing — queueing does not beat the allowance", async () => {
    // The old check counted live + paused only, so a starter host could push any
    // number of listings into review and have every one approved.
    const sub = clerkId("capqueue");
    const profileId = await provisionHost(sub, "starter");
    const queued = await seedDraft(profileId, "Queued");
    const next = await seedDraft(profileId, "Next");

    await admin().from("listings").update({ status: "under_review" }).eq("id", queued);

    const host = await asHost(sub);
    const refused = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", next)
      .select("id");

    expect(refused.error).not.toBeNull();
    expect(refused.error?.message).toContain("listing_allowance_exceeded");
  });

  it("REFUSES publishing for a host whose plan lapsed to 'none'", async () => {
    const sub = clerkId("caplapsed");
    const profileId = await provisionHost(sub, "starter");
    const listing = await seedDraft(profileId, "Lapsed");

    await admin()
      .from("host_subscriptions")
      .update({ tier: "none", billing_status: "cancelled" })
      .eq("clerk_user_id", sub);
    await admin()
      .from("host_profiles")
      .update({ subscription_tier: "none" })
      .eq("id", profileId);

    const host = await asHost(sub);
    const refused = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", listing)
      .select("id");

    expect(refused.error).not.toBeNull();
    expect(refused.error?.message).toContain("listing_allowance_exceeded");
  });

  it("does NOT refuse a move between two already-counted statuses", async () => {
    // A host sitting exactly at their allowance must still be able to pause and
    // resume the listing they are already paying for.
    const sub = clerkId("capresume");
    const profileId = await provisionHost(sub, "starter");
    const listing = await seedDraft(profileId, "Resume");
    await admin().from("listings").update({ status: "live" }).eq("id", listing);

    const host = await asHost(sub);
    const paused = await host
      .from("listings")
      .update({ status: "paused" })
      .eq("id", listing)
      .select("id");
    expect(paused.error).toBeNull();

    const resumed = await host
      .from("listings")
      .update({ status: "live" })
      .eq("id", listing)
      .select("id");
    expect(resumed.error).toBeNull();
    expect(resumed.data ?? []).toHaveLength(1);
  });

  it("frees the slot when a listing is archived", async () => {
    const sub = clerkId("caprelease");
    const profileId = await provisionHost(sub, "starter");
    const held = await seedDraft(profileId, "Held");
    const waiting = await seedDraft(profileId, "Waiting");
    await admin().from("listings").update({ status: "live" }).eq("id", held);

    const host = await asHost(sub);
    const blocked = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", waiting)
      .select("id");
    expect(blocked.error).not.toBeNull();

    await host.from("listings").update({ status: "archived" }).eq("id", held);

    const allowed = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", waiting)
      .select("id");
    expect(allowed.error).toBeNull();
    expect(allowed.data ?? []).toHaveLength(1);
  });

  it("leaves service-role moderation outside the allowance", async () => {
    // The same write the host was just refused must still succeed for the
    // service role, or admin approval and the expiry sweep break.
    const sub = clerkId("capadmin");
    const profileId = await provisionHost(sub, "starter");
    const held = await seedDraft(profileId, "Admin held");
    const extra = await seedDraft(profileId, "Admin extra");
    await admin().from("listings").update({ status: "live" }).eq("id", held);

    const host = await asHost(sub);
    const refused = await host
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", extra)
      .select("id");
    expect(refused.error).not.toBeNull();

    const moderated = await admin()
      .from("listings")
      .update({ status: "under_review" })
      .eq("id", extra)
      .select("id");
    expect(moderated.error).toBeNull();
    expect(moderated.data ?? []).toHaveLength(1);
  });

  it("reports the same allowance through the RPC the application reads", async () => {
    const sub = clerkId("capstate");
    const profileId = await provisionHost(sub, "professional");
    const listing = await seedDraft(profileId, "State");
    await admin().from("listings").update({ status: "live" }).eq("id", listing);

    const host = await asHost(sub);
    const state = await host.rpc("my_listing_allowance_state", {
      p_host_profile_id: profileId,
    });
    expect(state.error).toBeNull();
    expect(state.data).toMatchObject({ tier: "professional", used: 1 });
    expect((state.data as { allowance: number }).allowance).toBeGreaterThanOrEqual(1);
  });

  it("REFUSES the allowance RPC for a host profile the caller does not own", async () => {
    const mine = clerkId("statemine");
    const theirs = clerkId("statetheirs");
    await provisionHost(mine, "starter");
    const theirProfile = await provisionHost(theirs, "enterprise");

    const host = await asHost(mine);
    const state = await host.rpc("my_listing_allowance_state", {
      p_host_profile_id: theirProfile,
    });
    expect(state.error).not.toBeNull();
    expect(state.error?.message).toContain("host_profile_not_owned");
  });
});
