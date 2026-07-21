import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authedClientMock = vi.hoisted(() => vi.fn());
vi.mock("../src/client.js", () => ({
  anonClient: vi.fn(),
  authedClient: authedClientMock,
}));

import type { BenefitDetail } from "@explore-and-earn/contracts";
import { saveBenefitDetails } from "../src/queries/benefitDetails.js";

function queryReturning(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.update.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

const nextDetail = {
  fields: { format: "Family-style meals" },
  toggles: {},
} as BenefitDetail;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saveBenefitDetails atomic rollout", () => {
  it("uses the row-locking RPC and returns the exact displaced detail", async () => {
    const profileQuery = queryReturning({ data: { id: "host-1" }, error: null });
    const client = {
      from: vi.fn().mockReturnValue(profileQuery),
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            previous_detail: { fields: { format: "Buffet" }, toggles: {} },
            benefit_details: { meals: nextDetail },
          },
        ],
        error: null,
      }),
    };
    authedClientMock.mockReturnValue(client);

    await expect(
      saveBenefitDetails("token", "user-1", "listing-1", "meals", nextDetail),
    ).resolves.toEqual({
      ok: true,
      previous: { fields: { format: "Buffet" }, toggles: {} },
    });
    expect(client.rpc).toHaveBeenCalledWith("save_owned_benefit_detail", {
      p_listing_id: "listing-1",
      p_kind: "meals",
      p_detail: nextDetail,
    });
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("keeps the pre-migration Meals editor working when the RPC is absent", async () => {
    const previous = { fields: { format: "Buffet" }, toggles: {} };
    const profileQuery = queryReturning({ data: { id: "host-1" }, error: null });
    const readQuery = queryReturning({
      data: { benefit_details: { housing: { fields: {} }, meals: previous } },
      error: null,
    });
    const updateQuery = queryReturning({ data: { id: "listing-1" }, error: null });
    const listingQueries = [readQuery, updateQuery];
    const client = {
      from: vi.fn((table: string) =>
        table === "host_profiles" ? profileQuery : listingQueries.shift(),
      ),
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: {
          code: "PGRST202",
          message: "Could not find the function public.save_owned_benefit_detail",
        },
      }),
    };
    authedClientMock.mockReturnValue(client);

    await expect(
      saveBenefitDetails("token", "user-1", "listing-1", "meals", nextDetail),
    ).resolves.toEqual({ ok: true, previous });
    expect(updateQuery.update).toHaveBeenCalledWith({
      benefit_details: {
        housing: { fields: {} },
        meals: nextDetail,
      },
    });
  });
});
