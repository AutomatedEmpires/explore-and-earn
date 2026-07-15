import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authedFrom = vi.fn();
const adminFrom = vi.fn();

vi.mock("../src/client.js", () => ({
  authedClient: () => ({ from: authedFrom }),
  anonClient: () => ({ from: vi.fn() }),
}));
vi.mock("../src/adminClient.js", () => ({
  adminClient: () => ({ from: adminFrom }),
}));

import { getAdminListingDetail } from "../src/queries/admin.js";
import { getSeekerApplicationsWithListings } from "../src/queries/applications.js";
import { getSeekerInvites } from "../src/queries/invites.js";
import { getSeekerApplicationsRich } from "../src/queries/seekerApplicationsRich.js";

type QueryResult = {
  readonly data: unknown;
  readonly error: null;
};

function queryChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "not", "order"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.then = (
    resolve: (value: QueryResult) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    in: ReturnType<typeof vi.fn>;
    not: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
  };
}

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "listing-1",
    title: "Orchard crew",
    category: "farm",
    location_display: "Wenatchee, WA",
    status: "live",
    housing_included: false,
    meals_included: false,
    compensation_summary: null,
    compensation_min_cents: null,
    compensation_max_cents: null,
    compensation_unit: "hour",
    compensation_currency: "USD",
    timeline_summary: "Aug–Oct",
    cover_photo_url: null,
    begins_at: null,
    ends_at: null,
    host_profiles: {
      company_name: "Wenatchee Orchard Co.",
      subscription_tier: null,
    },
    ...overrides,
  };
}

function queueSeekerRows(rows: readonly Record<string, unknown>[]) {
  const profile = queryChain({ data: { id: "seeker-1" }, error: null });
  const query = queryChain({ data: rows, error: null });
  authedFrom.mockReturnValueOnce(profile).mockReturnValueOnce(query);
  return query;
}

beforeEach(() => {
  authedFrom.mockReset();
  adminFrom.mockReset();
});

describe("downstream listing pay adapters", () => {
  it("applications project blank pay as not provided and select currency", async () => {
    const query = queueSeekerRows([
      {
        id: "application-1",
        listing_id: "listing-1",
        status: "applied",
        withdrawn_reason: null,
        submitted_at: "2026-07-01T00:00:00Z",
        expires_at: null,
        listings: listingRow(),
      },
    ]);

    const result = await getSeekerApplicationsWithListings(
      "token",
      "user-1",
      ["applied"],
    );

    expect(result[0]?.listing?.benefits.pay).toEqual({
      provision: "not_provided",
      summary: "Not provided",
    });
    expect(String(query.select.mock.calls[0]?.[0])).toContain(
      "compensation_currency",
    );
  });

  it("rich seeker applications keep max-only pay visible", async () => {
    queueSeekerRows([
      {
        id: "application-2",
        listing_id: "listing-1",
        status: "offered",
        withdrawn_reason: null,
        cover_message: null,
        submitted_at: "2026-07-01T00:00:00Z",
        reviewed_at: null,
        decided_at: null,
        listings: listingRow({ compensation_max_cents: 2400 }),
      },
    ]);

    const result = await getSeekerApplicationsRich("token", "user-1");

    expect(result[0]?.listing?.benefits.pay).toEqual({
      provision: "provided",
      summary: "Up to $24/hr",
    });
  });

  it("invites project work exchange without stale cash claims", async () => {
    queueSeekerRows([
      {
        id: "invite-1",
        listing_id: "listing-1",
        host_profile_id: "host-1",
        status: "delivered",
        message: null,
        created_at: "2026-07-01T00:00:00Z",
        expires_at: null,
        listings: listingRow({
          compensation_min_cents: 1800,
          compensation_max_cents: 2400,
          compensation_unit: "exchange",
        }),
        host_profiles: {
          company_name: "Wenatchee Orchard Co.",
          subscription_tier: null,
        },
      },
    ]);

    const result = await getSeekerInvites("token", "user-1");

    expect(result[0]?.listing?.benefits.pay).toEqual({
      provision: "provided",
      summary: "Work exchange",
    });
  });

  it("admin detail projects a non-USD range with its stored currency", async () => {
    const query = queryChain({
      data: listingRow({
        compensation_min_cents: 1800,
        compensation_max_cents: 2400,
        compensation_currency: "CAD",
      }),
      error: null,
    });
    adminFrom.mockReturnValueOnce(query);

    const result = await getAdminListingDetail("service-token", "listing-1");

    expect(result?.benefits.pay).toEqual({
      provision: "provided",
      summary: "CA$18–CA$24/hr",
    });
    expect(String(query.select.mock.calls[0]?.[0])).toContain(
      "compensation_currency",
    );
  });
});
