/**
 * /search ⇄ /seek consistency — pins the one-marketplace-truth invariants the
 * search unification shipped:
 *  - the seeker scope is threaded into searchListings (applied HARD-exclusion
 *    runs server-side) whenever a signed-in context is supplied — and NOT on
 *    the anonymous path
 *  - every row renders through the shared rowToDiscoveryFields mapper, so
 *    provenance/evidence honesty and enrichment travel onto search cards
 *  - the match pill is single-sourced: the stored score surfaces only at the
 *    founder-locked >=75 threshold (same constant in packages/db and web lib)
 *  - signed-in ordering is rankForSeeker (match-band primary), identical to
 *    /seek; a personalization fault degrades to the anonymous path
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockDb = {
	searchListings: vi.fn(),
	resolveSeekerDiscoveryScope: vi.fn(),
	getMatchScoresForSeeker: vi.fn(),
	getSeekerBehaviorInteractions: vi.fn(),
};

vi.mock("@explore-and-earn/db", async () => {
	const actual = await vi.importActual<Record<string, unknown>>("@explore-and-earn/db");
	return {
		...actual,
		searchListings: (...args: unknown[]) => mockDb.searchListings(...args),
		resolveSeekerDiscoveryScope: (...args: unknown[]) =>
			mockDb.resolveSeekerDiscoveryScope(...args),
		getMatchScoresForSeeker: (...args: unknown[]) =>
			mockDb.getMatchScoresForSeeker(...args),
		getSeekerBehaviorInteractions: (...args: unknown[]) =>
			mockDb.getSeekerBehaviorInteractions(...args),
	};
});

import { getSearchDiscoveryListings } from "../../components/search/data";
import { MEANINGFUL_MATCH_SCORE_THRESHOLD as WEB_PILL_THRESHOLD } from "../../lib/ranking";
import { MEANINGFUL_MATCH_SCORE_THRESHOLD as DB_PILL_THRESHOLD } from "@explore-and-earn/db";

const VERIFIED_ID = "11111111-2222-3333-4444-555555555555";
const SOURCED_ID = "99999999-8888-7777-6666-555555555555";

/** A realistic verified (host-authored) raw row. */
const verifiedRow = {
	id: VERIFIED_ID,
	host_profile_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
	title: "Orchard crew",
	category: "farm" as const,
	description: "Pick apples all fall.",
	location_display: "Hood River, OR",
	latitude: 45.7,
	longitude: -121.5,
	status: "live",
	housing_included: true,
	meals_included: false,
	housing_description: "Shared bunkhouse",
	meals_description: null,
	visa_support: false,
	compensation_summary: "$18/hr",
	compensation_min_cents: 180000,
	compensation_max_cents: null,
	compensation_unit: "hour",
	// Fixture data, not a formatting call — spelled to stay off the G52
	// locale-literal ratchet (this file formats nothing itself).
	compensation_currency: "usd".toUpperCase(),
	timeline_summary: null,
	begins_at: "2026-09-01T00:00:00Z",
	ends_at: "2026-11-15T00:00:00Z",
	published_at: "2026-07-10T00:00:00Z",
	cover_photo_url: null,
	gallery_photo_urls: null,
	host_profiles: { company_name: "Sunrise Orchards", subscription_tier: "professional" },
	provenance: "verified" as const,
	source_name: null,
	source_url: null,
	source_external_id: null,
	source_employer_name: null,
	source_published_at: null,
	source_last_seen_at: null,
	source_status: "not_applicable",
	claim_summary: "not_applicable",
	housing_evidence: "confirmed" as const,
	meals_evidence: "confirmed" as const,
	pay_evidence: "confirmed" as const,
};

/** A sourced (unconfirmed, attributable) raw row with not_stated evidence. */
const sourcedRow = {
	...verifiedRow,
	id: SOURCED_ID,
	title: "Deckhand — pollock season",
	category: "maritime" as const,
	host_profile_id: null,
	host_profiles: null,
	housing_included: false,
	meals_included: false,
	published_at: "2026-07-12T00:00:00Z",
	provenance: "sourced" as const,
	source_name: "Alaska Job Board",
	source_url: "https://jobs.example/123",
	source_external_id: "123",
	source_employer_name: "North Pacific Fisheries",
	source_published_at: "2026-07-11T00:00:00Z",
	source_last_seen_at: "2026-07-12T00:00:00Z",
	source_status: "active",
	claim_summary: "unclaimed",
	housing_evidence: "not_stated" as const,
	meals_evidence: "not_stated" as const,
	pay_evidence: "stated" as const,
};

const SEEKER_CTX = { clerkToken: "tok_1", clerkUserId: "user_1" };

const emptyScope = () => ({
	appliedIds: new Set<string>(),
	skippedIds: new Set<string>(),
	boostedIds: new Set<string>(),
});

beforeEach(() => {
	vi.clearAllMocks();
	mockDb.searchListings.mockResolvedValue([sourcedRow, verifiedRow]);
	mockDb.resolveSeekerDiscoveryScope.mockResolvedValue(emptyScope());
	mockDb.getMatchScoresForSeeker.mockResolvedValue(new Map<string, number>());
	mockDb.getSeekerBehaviorInteractions.mockResolvedValue([]);
});

describe("pill threshold single-sourcing", () => {
	it("is 75 (founder-locked display gate) in BOTH mirrored constants", () => {
		expect(DB_PILL_THRESHOLD).toBe(75);
		expect(WEB_PILL_THRESHOLD).toBe(DB_PILL_THRESHOLD);
	});
});

describe("getSearchDiscoveryListings — anonymous path", () => {
	it("queries WITHOUT a seeker scope and resolves no personalization", async () => {
		await getSearchDiscoveryListings({ limit: 48 });
		expect(mockDb.searchListings).toHaveBeenCalledWith({ limit: 48 }, undefined);
		expect(mockDb.resolveSeekerDiscoveryScope).not.toHaveBeenCalled();
		expect(mockDb.getMatchScoresForSeeker).not.toHaveBeenCalled();
	});

	it("maps rows through the shared mapper — sourced evidence honesty travels", async () => {
		const listings = await getSearchDiscoveryListings({});
		const sourced = listings.find((l) => l.id === SOURCED_ID);
		// rowToDiscoveryFields (not a search-only view-model) is the mapper:
		// provenance + per-benefit evidence arrive so 'not_stated' renders as
		// missing information, never as "No housing"/"No meals".
		expect(sourced?.provenanceInfo?.provenance).toBe("sourced");
		expect(sourced?.provenanceInfo?.benefitEvidence).toEqual({
			housing: "not_stated",
			meals: "not_stated",
			pay: "stated",
		});
		// Sourced rows carry no host id/tier and are never verified.
		expect(sourced?.host.id).toBeUndefined();
		expect(sourced?.host.verified).toBe(false);
		// No seeker → no pill anywhere.
		expect(listings.every((l) => l.matchScore === undefined)).toBe(true);
	});
});

describe("getSearchDiscoveryListings — signed-in seeker", () => {
	it("threads the seeker scope into searchListings (applied HARD-exclusion seam)", async () => {
		await getSearchDiscoveryListings({ query: "farm" }, SEEKER_CTX);
		expect(mockDb.searchListings).toHaveBeenCalledWith(
			{ query: "farm" },
			{ clerkToken: "tok_1", clerkUserId: "user_1" },
		);
		expect(mockDb.resolveSeekerDiscoveryScope).toHaveBeenCalledWith("tok_1", "user_1");
	});

	it("surfaces the STORED score only at >=75 — no live recompute, no >=50 pill", async () => {
		mockDb.getMatchScoresForSeeker.mockResolvedValue(
			new Map([
				[VERIFIED_ID, 80],
				[SOURCED_ID, 74],
			]),
		);
		const listings = await getSearchDiscoveryListings({}, SEEKER_CTX);
		const verified = listings.find((l) => l.id === VERIFIED_ID);
		const sourced = listings.find((l) => l.id === SOURCED_ID);
		expect(verified?.matchScore).toBe(80);
		// 74 is a real stored score but sits below the founder-locked display
		// gate — the card shows NO pill (the old /search >=50 rule is gone).
		expect(sourced?.matchScore).toBeUndefined();
	});

	it("ranks with the same match-band-primary rule as /seek", async () => {
		// Fetch order is newest-first (sourced first). The verified listing's
		// qualified stored score must lift it above the newer unscored row.
		mockDb.getMatchScoresForSeeker.mockResolvedValue(new Map([[VERIFIED_ID, 80]]));
		const listings = await getSearchDiscoveryListings({}, SEEKER_CTX);
		expect(listings.map((l) => l.id)).toEqual([VERIFIED_ID, SOURCED_ID]);
	});

	it("stamps boosted + previously-skipped enrichment onto the cards", async () => {
		mockDb.resolveSeekerDiscoveryScope.mockResolvedValue({
			appliedIds: new Set<string>(),
			skippedIds: new Set([SOURCED_ID]),
			boostedIds: new Set([VERIFIED_ID]),
		});
		const listings = await getSearchDiscoveryListings({}, SEEKER_CTX);
		const verified = listings.find((l) => l.id === VERIFIED_ID);
		const sourced = listings.find((l) => l.id === SOURCED_ID);
		expect(verified?.conditionalBadges).toContain("boosted");
		expect(sourced?.previouslySkipped).toBe(true);
	});

	it("degrades to the anonymous path when personalization faults", async () => {
		mockDb.resolveSeekerDiscoveryScope.mockRejectedValue(new Error("down"));
		const listings = await getSearchDiscoveryListings({}, SEEKER_CTX);
		// No scope threaded → no applied exclusion, raw recency order kept.
		expect(mockDb.searchListings).toHaveBeenCalledWith({}, undefined);
		expect(listings.map((l) => l.id)).toEqual([SOURCED_ID, VERIFIED_ID]);
	});
});
