import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("../src/client.js", () => ({
  authedClient: () => ({ from: mockFrom }),
}));

vi.mock("../src/queries/idReaders.js", () => ({
  getActiveBoostedListingIds: vi.fn(async () => new Set<string>()),
}));

vi.mock("../src/queries/matchScores.js", () => ({
  getMatchScoresForSeeker: vi.fn(async () => new Map<string, number>()),
}));

import {
  getApplicationsForSeekerWithListings,
  seekerApplicationListingProvenanceInfo,
} from "../src/queries/applications.js";
import { getSeekerApplicationRichById } from "../src/queries/seekerApplicationsRich.js";

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const terminal = () => Promise.resolve(result);
  const self = () => chain;

  chain.select = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.in = vi.fn(self);
  chain.order = vi.fn(self);
  chain.maybeSingle = terminal;
  chain.then = (
    resolve: (value: { data: unknown; error: unknown }) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => terminal().then(resolve, reject);

  return chain;
}

const LISTING_ROW = {
  id: "listing-1",
  title: "Orchard harvest lead",
  category: "farm",
  location_display: "Hood River, Oregon",
  status: "live",
  housing_included: true,
  housing_description: "Private cabin beside the orchard",
  meals_included: true,
  meals_description: "Breakfast and dinner every shift day",
  compensation_summary: "$19/hour",
  compensation_min_cents: 1900,
  compensation_max_cents: 1900,
  compensation_unit: "hour",
  compensation_currency: null,
  timeline_summary: "August through October",
  cover_photo_url: null,
  begins_at: "2026-08-12T17:00:00.000Z",
  ends_at: "2026-10-28T17:00:00.000Z",
  provenance: "verified",
  source_name: "Seasonal Work Directory",
  source_url: "https://jobs.example/orchard-1",
  source_external_id: "orchard-1",
  source_employer_name: "Cascade Orchard Collective",
  source_published_at: "2026-07-20T17:00:00.000Z",
  source_last_seen_at: "2026-08-01T17:00:00.000Z",
  claim_summary: "not_applicable",
  housing_evidence: "confirmed",
  meals_evidence: "confirmed",
  pay_evidence: "confirmed",
  host_profiles: {
    company_name: "Cascade Orchard Collective",
    subscription_tier: "professional",
  },
};

const CONVERTED_NOT_STATED_LISTING = {
  ...LISTING_ROW,
  claim_summary: "converted",
  housing_evidence: "not_stated",
  meals_evidence: "not_stated",
  pay_evidence: "not_stated",
};

const CONFIRMED_WITHOUT_PAY_LISTING = {
  ...LISTING_ROW,
  compensation_summary: null,
  compensation_min_cents: null,
  compensation_max_cents: null,
  pay_evidence: "confirmed",
};

function applicationRow(listing: Record<string, unknown> = LISTING_ROW) {
  return {
    id: "application-1",
    listing_id: LISTING_ROW.id,
    status: "offered",
    cover_message: "I would love to join the harvest.",
    submitted_at: "2026-08-01T17:00:00.000Z",
    expires_at: "2026-08-10T17:00:00.000Z",
    reviewed_at: "2026-08-02T17:00:00.000Z",
    decided_at: "2026-08-03T17:00:00.000Z",
    listings: listing,
  };
}

describe("seeker application benefit summaries", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("degrades unrecognized source evidence to not stated", () => {
    const provenance = seekerApplicationListingProvenanceInfo({
      provenance: "sourced",
      source_name: "Seasonal Work Directory",
      claim_summary: "unknown-state",
      housing_evidence: "probably",
      meals_evidence: null,
      pay_evidence: 1,
    });

    expect(provenance).toMatchObject({
      provenance: "sourced",
      claimStatus: "unclaimed",
      benefitEvidence: {
        housing: "not_stated",
        meals: "not_stated",
        pay: "not_stated",
      },
    });
  });

  it("applies lifecycle status filters at the database boundary", async () => {
    const applicationChain = makeChain({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    await getApplicationsForSeekerWithListings(
      "token",
      "clerk-user-1",
      ["offered"],
    );

    expect(applicationChain.in).toHaveBeenCalledWith("status", ["offered"]);
    expect(applicationChain.order).toHaveBeenCalledWith("submitted_at", {
      ascending: false,
    });
  });

  it("returns immediately when the requested status set is empty", async () => {
    const applications = await getApplicationsForSeekerWithListings(
      "token",
      "clerk-user-1",
      [],
    );

    expect(applications).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("carries persisted housing and meal descriptions through the application card query", async () => {
    const applicationChain = makeChain({
      data: [applicationRow()],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const [application] = await getApplicationsForSeekerWithListings(
      "token",
      "clerk-user-1",
    );

    expect(applicationChain.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "housing_included, housing_description, meals_included, meals_description",
      ),
    );
    expect(applicationChain.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "provenance, source_name, source_url, source_external_id, source_employer_name",
      ),
    );
    expect(application?.listing?.benefits).toMatchObject({
      housing: {
        provision: "provided",
        summary: "Private cabin beside the orchard",
      },
      meals: {
        provision: "provided",
        summary: "Breakfast and dinner every shift day",
      },
      pay: { provision: "provided", summary: "$19/hour" },
    });
    expect(application?.listing).toMatchObject({
      beginsAt: "2026-08-12T17:00:00.000Z",
      endsAt: "2026-10-28T17:00:00.000Z",
      host: { name: "Cascade Orchard Collective", verified: true },
      provenanceInfo: {
        provenance: "verified",
        claimStatus: "not_applicable",
        benefitEvidence: {
          housing: "confirmed",
          meals: "confirmed",
          pay: "confirmed",
        },
      },
    });
  });

  it("carries persisted housing and meal descriptions through the rich detail query", async () => {
    const applicationChain = makeChain({
      data: applicationRow(),
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const application = await getSeekerApplicationRichById(
      "token",
      "clerk-user-1",
      "application-1",
    );

    expect(applicationChain.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "housing_included, housing_description, meals_included, meals_description",
      ),
    );
    expect(applicationChain.select).toHaveBeenCalledWith(
      expect.stringContaining("begins_at, ends_at"),
    );
    expect(applicationChain.select).toHaveBeenCalledWith(
      expect.stringContaining(
        "claim_summary, housing_evidence, meals_evidence, pay_evidence",
      ),
    );
    expect(application?.listing?.benefits).toMatchObject({
      housing: {
        provision: "provided",
        summary: "Private cabin beside the orchard",
      },
      meals: {
        provision: "provided",
        summary: "Breakfast and dinner every shift day",
      },
      pay: { provision: "provided", summary: "$19/hour" },
    });
    expect(application?.listing).toMatchObject({
      beginsAt: "2026-08-12T17:00:00.000Z",
      endsAt: "2026-10-28T17:00:00.000Z",
      host: { name: "Cascade Orchard Collective", verified: true },
      provenanceInfo: {
        provenance: "verified",
        claimStatus: "not_applicable",
        benefitEvidence: {
          housing: "confirmed",
          meals: "confirmed",
          pay: "confirmed",
        },
      },
    });
  });

  it("hides every stale benefit value on a converted list row with not-stated evidence", async () => {
    const applicationChain = makeChain({
      data: [applicationRow(CONVERTED_NOT_STATED_LISTING)],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const [application] = await getApplicationsForSeekerWithListings(
      "token",
      "clerk-user-1",
    );

    expect(application?.listing?.benefits).toEqual({
      housing: { provision: "not_stated" },
      meals: { provision: "not_stated" },
      pay: { provision: "not_stated" },
    });
    expect(application?.listing?.provenanceInfo).toMatchObject({
      provenance: "verified",
      claimStatus: "converted",
      benefitEvidence: {
        housing: "not_stated",
        meals: "not_stated",
        pay: "not_stated",
      },
    });
  });

  it("does not claim pay is provided on a list row without compensation", async () => {
    const applicationChain = makeChain({
      data: [applicationRow(CONFIRMED_WITHOUT_PAY_LISTING)],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const [application] = await getApplicationsForSeekerWithListings(
      "token",
      "clerk-user-1",
    );

    expect(application?.listing?.benefits.pay).toEqual({
      provision: "not_stated",
    });
  });

  it("hides every stale benefit value on a converted rich row with not-stated evidence", async () => {
    const applicationChain = makeChain({
      data: applicationRow(CONVERTED_NOT_STATED_LISTING),
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const application = await getSeekerApplicationRichById(
      "token",
      "clerk-user-1",
      "application-1",
    );

    expect(application?.listing?.benefits).toEqual({
      housing: { provision: "not_stated" },
      meals: { provision: "not_stated" },
      pay: { provision: "not_stated" },
    });
    expect(application?.listing?.provenanceInfo).toMatchObject({
      provenance: "verified",
      claimStatus: "converted",
      benefitEvidence: {
        housing: "not_stated",
        meals: "not_stated",
        pay: "not_stated",
      },
    });
  });

  it("does not claim pay is provided on a rich row without compensation", async () => {
    const applicationChain = makeChain({
      data: applicationRow(CONFIRMED_WITHOUT_PAY_LISTING),
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const application = await getSeekerApplicationRichById(
      "token",
      "clerk-user-1",
      "application-1",
    );

    expect(application?.listing?.benefits.pay).toEqual({
      provision: "not_stated",
    });
  });

  it("uses sourced attribution as the unverified host identity", async () => {
    const sourcedListing = {
      ...LISTING_ROW,
      provenance: "sourced",
      source_name: "Seasonal Work Directory",
      source_employer_name: "Riverbend Farms",
      claim_summary: "unclaimed",
      housing_evidence: "stated",
      meals_evidence: "not_stated",
      pay_evidence: "stated",
      host_profiles: {
        company_name: "Must not display",
        subscription_tier: "enterprise",
      },
    };
    const applicationChain = makeChain({
      data: [applicationRow(sourcedListing)],
      error: null,
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "seeker_profiles") {
        return makeChain({ data: { id: "seeker-1" }, error: null });
      }
      if (table === "applications") return applicationChain;
      throw new Error(`Unexpected table: ${table}`);
    });

    const [application] = await getApplicationsForSeekerWithListings(
      "token",
      "clerk-user-1",
    );

    expect(application?.listing).toMatchObject({
      host: { name: "Riverbend Farms", verified: false },
      benefits: {
        housing: {
          provision: "provided",
          summary: "Private cabin beside the orchard",
        },
        meals: { provision: "not_stated" },
        pay: { provision: "provided", summary: "$19/hour" },
      },
      provenanceInfo: {
        provenance: "sourced",
        claimStatus: "unclaimed",
        source: {
          sourceName: "Seasonal Work Directory",
          employerName: "Riverbend Farms",
        },
        benefitEvidence: {
          housing: "stated",
          meals: "not_stated",
          pay: "stated",
        },
      },
    });
  });
});
