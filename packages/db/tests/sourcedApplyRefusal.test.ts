/**
 * applyToListing must REFUSE sourced listings (UX review 2026-07-23).
 *
 * A sourced listing is a real public posting we found, but no employer has
 * claimed it here. Migration 064 drops NOT NULL on listings.host_profile_id
 * for exactly this case ("Sourced listings have no host (yet)"), and the
 * host-side applications query inner-joins host_profiles — so an application
 * against a sourced listing is invisible to every host, forever, while the
 * seeker is shown "Application sent". That is a conversion that does not
 * exist, and it became the DOMINANT path once sourced ingestion was activated.
 *
 * The detail page now offers the original posting instead of Apply, but hidden
 * UI is never authorization: this is the server-side enforcement, and these
 * tests are what stop it from being quietly removed.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockClient = { from: mockFrom, rpc: mockRpc };
vi.mock("../src/client.js", () => ({
  authedClient: () => mockClient,
  anonClient: () => mockClient,
}));

// Hold the résumé gate open so every test reaches the provenance check.
vi.mock("../src/queries/seekerResume.js", () => ({
  getSeekerResume: vi.fn(async () => ({})),
}));
vi.mock("../src/lib/resumeCompleteness.js", () => ({
  isSeekerResumeComplete: () => true,
}));

import { applyToListing } from "../src/queries/applications.js";

function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  chain.select = self;
  chain.update = vi.fn(self);
  chain.insert = vi.fn(self);
  chain.eq = self;
  chain.maybeSingle = terminal;
  chain.single = terminal;
  (chain as { then?: unknown }).then = (resolve: (v: unknown) => void) =>
    terminal().then(resolve);
  return chain;
}

function queueFromResults(...chains: ReturnType<typeof makeChain>[]) {
  for (const chain of chains) mockFrom.mockReturnValueOnce(chain);
}

const SEEKER_PROFILE = { data: { id: "seeker-1" }, error: null };

beforeEach(() => {
  mockFrom.mockReset();
  mockRpc.mockReset();
});

describe("applyToListing — sourced listings are refused server-side", () => {
  it("refuses a sourced listing instead of creating an unreachable application", async () => {
    const listing = makeChain({
      data: {
        status: "live",
        expires_at: "2099-01-01T00:00:00.000Z",
        provenance: "sourced",
        host_profile_id: null,
        host_profiles: null,
      },
      error: null,
    });
    // Deliberately queued: if the guard ever stops short-circuiting, the apply
    // would consume this chain and the call-count assertion below fails loudly
    // rather than silently writing a row nobody can read.
    const applications = makeChain({ data: null, error: null });
    queueFromResults(makeChain(SEEKER_PROFILE), listing, applications);

    const result = await applyToListing("token", "user_1", "listing-sourced");

    expect(result).toEqual({
      ok: false,
      error: "listing_not_accepting_applications",
    });
  });

  it("never touches the applications table for a sourced listing", async () => {
    const applications = makeChain({ data: null, error: null });
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain({
        data: {
          status: "live",
          expires_at: "2099-01-01T00:00:00.000Z",
          provenance: "sourced",
          host_profile_id: null,
          host_profiles: null,
        },
        error: null,
      }),
      applications,
    );

    await applyToListing("token", "user_1", "listing-sourced");

    // seeker_profiles + listings only — the applications read/insert is never
    // reached, so no orphaned row and no application_submitted event.
    expect(mockFrom).toHaveBeenCalledTimes(2);
    expect(applications.insert).not.toHaveBeenCalled();
  });

  /**
   * Negative control: the guard must key on provenance alone and must not
   * become a blanket block. A verified listing still applies normally.
   */
  it("still allows a verified listing to be applied to", async () => {
    mockRpc.mockReturnValue(
      makeChain({
        data: {
          application_id: "app-9",
          seeker_profile_id: "seeker-1",
          listing_id: "listing-verified",
          disposition: "created",
        },
        error: null,
      }),
    );
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain({
        data: {
          status: "live",
          expires_at: "2099-01-01T00:00:00.000Z",
          provenance: "verified",
          host_profile_id: "host-1",
          host_profiles: { clerk_user_id: "host_1" },
        },
        error: null,
      }),
    );

    const result = await applyToListing("token", "user_1", "listing-verified");

    expect(result.ok).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("still blocks a host applying to their own verified listing", async () => {
    queueFromResults(
      makeChain(SEEKER_PROFILE),
      makeChain({
        data: {
          status: "live",
          expires_at: "2099-01-01T00:00:00.000Z",
          provenance: "verified",
          host_profile_id: "host-1",
          host_profiles: { clerk_user_id: "user_1" },
        },
        error: null,
      }),
    );

    const result = await applyToListing("token", "user_1", "listing-own");

    expect(result).toEqual({ ok: false, error: "cannot_apply_to_own_listing" });
  });
});
