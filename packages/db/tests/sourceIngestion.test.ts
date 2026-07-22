/**
 * Unit tests for the pure ingestion engine (packages/db/src/lib/sourceIngestion.ts).
 *
 * These pin the charter's honesty laws:
 *  - only stated facts are extracted; a missing benefit is not_stated, never "no";
 *  - pay normalizes to cents ONLY when the source's numbers are clean/coherent;
 *  - classification lands in exactly one of the four categories or refuses
 *    (quarantine), never a silent guess;
 *  - dedup is layered + conservative: probable duplicates are review-flagged
 *    (never merged), verified inventory is never touched;
 *  - malformed payloads/records fail loudly with preserved reasons;
 *  - the plan is deterministic (same input → same plan).
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canonicalizeSourceUrl,
  classifyCategory,
  contentFingerprint,
  fuzzyIdentityKey,
  normalizeRecord,
  parseCsv,
  parseJsonRecords,
  parseStatedBenefit,
  payloadFingerprint,
  planImport,
  validateSourceConfig,
  type InventoryIndex,
  type SourceFieldMapping,
} from "../src/lib/sourceIngestion";
import {
  insertColumns,
  plannedToListingColumns,
} from "../src/queries/sourcedListings";

/* ------------------------------------------------------------------ helpers */

const MAPPING: SourceFieldMapping = {
  title: "job_title",
  description: "details",
  employerName: "company",
  externalId: "posting_id",
  url: "link",
  location: "place",
  housing: "housing",
  housingDetails: "housing_info",
  meals: "meals",
  payText: "pay",
  payMin: "pay_min",
  payMax: "pay_max",
  payUnit: "pay_unit",
  beginsAt: "start",
  endsAt: "end",
  category: "type",
  categoryMap: { "farm work": "farm", boats: "maritime" },
};

const baseRaw = {
  job_title: "Orchard harvest crew",
  details: "Pick apples on our family farm through the harvest season.",
  company: "Sunrise Orchards",
  posting_id: "SO-42",
  link: "https://jobs.example.com/postings/42?utm_source=feed",
  place: "Hood River, OR",
  housing: "yes",
  housing_info: "Shared bunkhouse",
  meals: "",
  pay: "$18/hr + harvest bonus",
  pay_min: "18",
  pay_max: "22",
  pay_unit: "hour",
  start: "2026-09-01",
  end: "2026-11-15",
  type: "farm work",
};

const emptyIndex: InventoryIndex = {
  byExternalId: new Map(),
  byCanonicalUrl: new Map(),
  byFingerprint: new Map(),
  byFuzzyKey: new Map(),
};

/* ------------------------------------------------------------------ parsing */

describe("parseCsv", () => {
  it("parses headers, quoted fields, embedded commas/quotes/newlines", () => {
    const csv =
      'title,notes\n"Deckhand, seasonal","She said ""aye""\nsecond line"\nCook,plain\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("Deckhand, seasonal");
    expect(rows[0].notes).toBe('She said "aye"\nsecond line');
    expect(rows[1].title).toBe("Cook");
  });

  it("throws on an unterminated quote (fail loudly, never half-ingest)", () => {
    expect(() => parseCsv('title\n"broken')).toThrow(/unterminated/);
  });

  it("returns [] for a header-only payload", () => {
    expect(parseCsv("title,notes\n")).toEqual([]);
  });
});

describe("parseJsonRecords", () => {
  it("accepts an array or {records:[...]}, stringifies scalars, skips nulls", () => {
    const rows = parseJsonRecords(
      JSON.stringify({ records: [{ title: "Cook", pay: 18, active: true, junk: null }] }),
    );
    expect(rows).toEqual([{ title: "Cook", pay: "18", active: "true" }]);
  });

  it("rejects non-record payloads", () => {
    expect(() => parseJsonRecords('{"nope": 1}')).toThrow(/expected an array/);
    expect(() => parseJsonRecords("[1,2]")).toThrow(/must be an object/);
  });
});

/* -------------------------------------------------------------- extraction */

describe("normalizeRecord — stated facts only", () => {
  it("extracts a fully-stated record faithfully", () => {
    const result = normalizeRecord(baseRaw, MAPPING);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const r = result.record;
    expect(r.title).toBe("Orchard harvest crew");
    expect(r.employerName).toBe("Sunrise Orchards");
    expect(r.externalId).toBe("SO-42");
    // Tracking params stripped from the canonical source URL.
    expect(r.sourceUrl).toBe("https://jobs.example.com/postings/42");
    expect(r.housing).toEqual({ status: "stated", value: true });
    expect(r.housingDetails).toBe("Shared bunkhouse");
    // Meals column was blank → NOT STATED (never false).
    expect(r.meals).toEqual({ status: "not_stated" });
    expect(r.payText).toBe("$18/hr + harvest bonus");
    expect(r.payMinCents).toBe(1800);
    expect(r.payMaxCents).toBe(2200);
    expect(r.payUnit).toBe("hour");
  });

  it("rejects records without a title or without any identity anchor", () => {
    expect(normalizeRecord({ ...baseRaw, job_title: " " }, MAPPING)).toEqual({
      ok: false,
      reason: "missing_title",
    });
    expect(
      normalizeRecord({ ...baseRaw, posting_id: "", link: "" }, MAPPING),
    ).toEqual({ ok: false, reason: "missing_identity" });
  });

  it("drops incoherent pay numbers but keeps the stated pay text", () => {
    const noisy = normalizeRecord(
      { ...baseRaw, pay_min: "competitive", pay_max: "", pay_unit: "hour" },
      MAPPING,
    );
    if (!noisy.ok) throw new Error("expected ok");
    expect(noisy.record.payMinCents).toBeNull();
    expect(noisy.record.payUnit).toBeNull();
    expect(noisy.record.payText).toBe("$18/hr + harvest bonus"); // verbatim, still stated
  });

  it("drops a pay range without a recognized unit (no unit invention)", () => {
    const result = normalizeRecord({ ...baseRaw, pay_unit: "per gig" }, MAPPING);
    if (!result.ok) throw new Error("expected ok");
    expect(result.record.payMinCents).toBeNull();
  });

  it("drops an end date earlier than the start date (source noise, not reordered)", () => {
    const result = normalizeRecord(
      { ...baseRaw, start: "2026-09-01", end: "2026-08-01" },
      MAPPING,
    );
    if (!result.ok) throw new Error("expected ok");
    expect(result.record.beginsAt).toContain("2026-09-01");
    expect(result.record.endsAt).toBeNull();
  });

	it("drops the whole point when either coordinate is invalid", () => {
		const withGeo: SourceFieldMapping = { ...MAPPING, latitude: "lat", longitude: "lng" };
		const result = normalizeRecord({ ...baseRaw, lat: "95.2", lng: "-121.5" }, withGeo);
		if (!result.ok) throw new Error("expected ok");
		expect(result.record.latitude).toBeNull();
		expect(result.record.longitude).toBeNull();
	});

	it("drops a bounded pair when no display location was stated", () => {
		const withGeo: SourceFieldMapping = { ...MAPPING, latitude: "lat", longitude: "lng" };
		const result = normalizeRecord(
			{ ...baseRaw, place: "", lat: "47.4", lng: "-121.5" },
			withGeo,
		);
		if (!result.ok) throw new Error("expected ok");
		expect(result.record.latitude).toBeNull();
		expect(result.record.longitude).toBeNull();
	});

	it("never converts blank source coordinates into a fabricated zero point", () => {
		const withGeo: SourceFieldMapping = { ...MAPPING, latitude: "lat", longitude: "lng" };
		const result = normalizeRecord(
			{ ...baseRaw, lat: "  ", lng: "\t" },
			withGeo,
		);
		if (!result.ok) throw new Error("expected ok");
		expect(result.record.latitude).toBeNull();
		expect(result.record.longitude).toBeNull();
	});

	it("keeps a genuinely stated zero point", () => {
		const withGeo: SourceFieldMapping = { ...MAPPING, latitude: "lat", longitude: "lng" };
		const result = normalizeRecord(
			{ ...baseRaw, lat: "0", lng: "0" },
			withGeo,
		);
		if (!result.ok) throw new Error("expected ok");
		expect(result.record.latitude).toBe(0);
		expect(result.record.longitude).toBe(0);
	});
});

describe("parseStatedBenefit — absence is never evidence", () => {
  it.each([
    ["yes", { status: "stated", value: true }],
    ["Included", { status: "stated", value: true }],
    ["no", { status: "stated", value: false }],
    ["Not provided", { status: "stated", value: false }],
    ["", { status: "not_stated" }],
    ["unknown", { status: "not_stated" }],
    ["ask us!", { status: "not_stated" }],
    [undefined, { status: "not_stated" }],
  ] as const)("%j → %j", (input, expected) => {
    expect(parseStatedBenefit(input as string | undefined)).toEqual(expected);
  });
});

/* ---------------------------------------------------------- classification */

describe("classifyCategory — four honest lanes or refusal", () => {
  const normalized = (over: Record<string, string> = {}) => {
    const result = normalizeRecord({ ...baseRaw, ...over }, MAPPING);
    if (!result.ok) throw new Error("normalize failed");
    return result.record;
  };

  it("source category mapping wins at high confidence", () => {
    const result = classifyCategory(normalized(), MAPPING.categoryMap);
    expect(result).toMatchObject({ category: "farm", confidence: "high", needsReview: false });
  });

  it("keyword lexicon classifies a single-signal record", () => {
    const record = normalized({
      type: "",
      job_title: "Deckhand for salmon season",
      details: "Join our fishing vessel crew in Sitka.",
    });
    const result = classifyCategory(record);
    expect(result.category).toBe("maritime");
    expect(result.needsReview).toBe(false);
  });

  it("ambiguous multi-category records are quarantined, never guessed", () => {
    // 3 farm terms (farm/orchard/harvest) vs 3 maritime terms
    // (deckhand/charter/boat) — no dominant lane.
    const record = normalized({
      type: "",
      job_title: "Farm deckhand",
      details: "Orchard harvest by day, charter boat by evening.",
    });
    const result = classifyCategory(record);
    expect(result.category).toBeNull();
    expect(result.needsReview).toBe(true);
    expect(result.rationale).toContain("ambiguous");
  });

  it("a clearly dominant lane wins at medium confidence (no false quarantine)", () => {
    const record = normalized({
      type: "",
      job_title: "Deckhand",
      details: "Crew our charter fishing vessel out of the marina; some farm produce deliveries.",
    });
    const result = classifyCategory(record);
    expect(result.category).toBe("maritime");
    expect(result.needsReview).toBe(false);
  });

  it("zero-signal records are quarantined", () => {
    const record = normalized({ type: "", job_title: "Team member", details: "Great vibes." });
    const result = classifyCategory(record);
    expect(result.category).toBeNull();
    expect(result.needsReview).toBe(true);
  });

  it("never emits a category outside the four public lanes", () => {
    const record = normalized({ type: "gig economy" }); // unmapped source value
    const result = classifyCategory(record, MAPPING.categoryMap);
    expect([null, "farm", "maritime", "remote", "seasonal"]).toContain(result.category);
    expect(result.category).toBe("farm"); // lexicon still sees the orchard text
  });
});

/* ------------------------------------------------------------ fingerprints */

describe("fingerprints + canonical urls", () => {
  it("payload fingerprint is byte-stable", () => {
    expect(payloadFingerprint("abc")).toBe(payloadFingerprint("abc"));
    expect(payloadFingerprint("abc")).not.toBe(payloadFingerprint("abd"));
  });

  it("content fingerprint ignores payload formatting but tracks fact changes", () => {
    const a = normalizeRecord(baseRaw, MAPPING);
    const b = normalizeRecord({ ...baseRaw, link: "https://JOBS.example.com/postings/42?utm_source=x" }, MAPPING);
    const c = normalizeRecord({ ...baseRaw, pay_min: "20" }, MAPPING);
    if (!a.ok || !b.ok || !c.ok) throw new Error("normalize failed");
    expect(contentFingerprint(a.record)).toBe(contentFingerprint(b.record));
    expect(contentFingerprint(a.record)).not.toBe(contentFingerprint(c.record));
  });

  it("canonicalizes urls (tracking params, host case, trailing slash) and rejects junk", () => {
    expect(
      canonicalizeSourceUrl("https://Example.com/j/1/?utm_campaign=x&fbclid=y"),
    ).toBe("https://example.com/j/1");
    expect(canonicalizeSourceUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeSourceUrl("not a url")).toBeNull();
  });

  it("fuzzy identity requires employer AND location (too weak otherwise)", () => {
    expect(fuzzyIdentityKey({ employerName: null, title: "T", location: "X" })).toBeNull();
    expect(
      fuzzyIdentityKey({ employerName: "Sunrise Orchards!", title: "Crew", location: "Hood River, OR" }),
    ).toBe("sunrise orchards|crew|hood river or");
  });
});

/* ------------------------------------------------------------------- plans */

describe("planImport — layered conservative dedup", () => {
  const SOURCE_ID = "src-1";

  it("plans a clean insert and is deterministic", () => {
    const plan1 = planImport([baseRaw], MAPPING, SOURCE_ID, emptyIndex);
    const plan2 = planImport([baseRaw], MAPPING, SOURCE_ID, emptyIndex);
    expect(plan1.records[0].outcome).toBe("inserted");
    expect(plan1.stats).toEqual({ received: 1, inserted: 1 });
    expect(JSON.stringify(plan1)).toBe(JSON.stringify(plan2));
  });

  it("rejects and quarantines with preserved reasons", () => {
    const plan = planImport(
      [
        { ...baseRaw, job_title: "" },
        { ...baseRaw, posting_id: "SO-77", link: "https://jobs.example.com/77", type: "", job_title: "Team member", details: "vibes" },
      ],
      MAPPING,
      SOURCE_ID,
      emptyIndex,
    );
    expect(plan.records[0]).toMatchObject({ outcome: "rejected", rejectReason: "missing_title" });
    expect(plan.records[1].outcome).toBe("quarantined");
    expect(plan.stats).toMatchObject({ received: 2, rejected: 1, quarantined: 1 });
  });

  it("collapses in-batch duplicates", () => {
    const plan = planImport([baseRaw, { ...baseRaw }], MAPPING, SOURCE_ID, emptyIndex);
    expect(plan.records.map((r) => r.outcome)).toEqual(["inserted", "exact_duplicate"]);
  });

  it("same external id: unchanged when fingerprint matches, updated when the posting changed", () => {
    const normalizedBase = normalizeRecord(baseRaw, MAPPING);
    if (!normalizedBase.ok) throw new Error("normalize failed");
    const fp = contentFingerprint(normalizedBase.record);
    const index: InventoryIndex = {
      ...emptyIndex,
      byExternalId: new Map([
        [`${SOURCE_ID}␟SO-42`, { listingId: "l-1", provenance: "sourced", fingerprint: fp }],
      ]),
    };
    const unchanged = planImport([baseRaw], MAPPING, SOURCE_ID, index);
    expect(unchanged.records[0]).toMatchObject({ outcome: "unchanged", matchedListingId: "l-1" });

    const changed = planImport([{ ...baseRaw, pay_min: "20" }], MAPPING, SOURCE_ID, index);
    expect(changed.records[0]).toMatchObject({ outcome: "updated", matchedListingId: "l-1" });
  });

  it("NEVER touches verified inventory — identity match on a claimed listing", () => {
    const index: InventoryIndex = {
      ...emptyIndex,
      byExternalId: new Map([
        [`${SOURCE_ID}␟SO-42`, { listingId: "l-verified", provenance: "verified", fingerprint: null }],
      ]),
    };
    const plan = planImport([{ ...baseRaw, pay_min: "99" }], MAPPING, SOURCE_ID, index);
    expect(plan.records[0]).toMatchObject({
      outcome: "verified_match",
      matchedListingId: "l-verified",
    });
  });

  it("fuzzy employer+title+location hit → probable_duplicate for review, never merged", () => {
    const key = fuzzyIdentityKey({
      employerName: "Sunrise Orchards",
      title: "Orchard harvest crew",
      location: "Hood River, OR",
    })!;
    const index: InventoryIndex = {
      ...emptyIndex,
      byFuzzyKey: new Map([[key, [{ listingId: "l-2", provenance: "sourced", fingerprint: "other" }]]]),
    };
    // Different posting id + url + pay → not an identity/content match.
    const plan = planImport(
      [{ ...baseRaw, posting_id: "SO-99", link: "https://elsewhere.example.com/99", pay_min: "25" }],
      MAPPING,
      SOURCE_ID,
      index,
    );
    expect(plan.records[0]).toMatchObject({
      outcome: "probable_duplicate",
      matchedListingId: "l-2",
    });
  });

  it("fuzzy hit on VERIFIED inventory → verified_match (protects claimed listings)", () => {
    const key = fuzzyIdentityKey({
      employerName: "Sunrise Orchards",
      title: "Orchard harvest crew",
      location: "Hood River, OR",
    })!;
    const index: InventoryIndex = {
      ...emptyIndex,
      byFuzzyKey: new Map([[key, [{ listingId: "l-v", provenance: "verified", fingerprint: null }]]]),
    };
    const plan = planImport(
      [{ ...baseRaw, posting_id: "SO-100", link: "https://elsewhere.example.com/100" }],
      MAPPING,
      SOURCE_ID,
      index,
    );
    expect(plan.records[0].outcome).toBe("verified_match");
  });
});

/* ------------------------------------------------------------------ config */

describe("validateSourceConfig", () => {
  it("accepts a valid mapping (nested or flat) and requires identity anchors", () => {
    expect(validateSourceConfig({ mapping: MAPPING }).ok).toBe(true);
    expect(validateSourceConfig(MAPPING).ok).toBe(true);
    const missing = validateSourceConfig({ title: "t" });
    expect(missing.ok).toBe(false);
    expect(missing.errors.join(" ")).toContain("externalId or url");
  });

  it("rejects bad category map targets", () => {
    const result = validateSourceConfig({
      title: "t",
      url: "u",
      categoryMap: { farmwork: "agriculture" },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("categoryMap");
  });
});

/* --------------------------------------------------- update-column safety */

describe("import column sets — updates never touch ownership/claim state", () => {
  it("update columns exclude provenance/host/claim; insert columns include them", () => {
    const normalizedResult = normalizeRecord(baseRaw, MAPPING);
    if (!normalizedResult.ok) throw new Error("normalize failed");
    const entry = {
      raw: baseRaw,
      record: normalizedResult.record,
      classification: classifyCategory(normalizedResult.record, MAPPING.categoryMap),
      fingerprint: contentFingerprint(normalizedResult.record),
      outcome: "updated" as const,
      rejectReason: null,
      matchedListingId: "l-1",
    };
    const source = {
      id: "src-1",
      name: "CoolWorks",
      kind: "csv" as const,
      complianceStatus: "approved" as const,
      allowRawSnapshot: true,
      fullSnapshot: false,
      config: {},
    };

    const updateCols = plannedToListingColumns(entry, source, "2026-07-14T00:00:00.000Z");
    // A re-import UPDATE must never reset an in-flight claim, detach/attach a
    // host, or rewrite provenance (adversarial-review finding, fixed).
    expect(updateCols).not.toHaveProperty("claim_summary");
    expect(updateCols).not.toHaveProperty("host_profile_id");
    expect(updateCols).not.toHaveProperty("provenance");

    const insertCols = insertColumns(entry, source, "2026-07-14T00:00:00.000Z");
    expect(insertCols.provenance).toBe("sourced");
    expect(insertCols.host_profile_id).toBeNull();
    expect(insertCols.claim_summary).toBe("unclaimed");
  });
});

/* ------------------------------------------------ review-fleet regressions */

describe("adversarial-review regressions", () => {
  it("fuzzy verified-match is review-flagged (a hypothesis, never a silent skip)", async () => {
    const { recordNeedsReview } = await import("../src/lib/sourceIngestion");
    const key = fuzzyIdentityKey({
      employerName: "Sunrise Orchards",
      title: "Orchard harvest crew",
      location: "Hood River, OR",
    })!;
    const index: InventoryIndex = {
      ...emptyIndex,
      byFuzzyKey: new Map([[key, [{ listingId: "l-v", provenance: "verified", fingerprint: null }]]]),
    };
    const plan = planImport(
      [{ ...baseRaw, posting_id: "SO-200", link: "https://elsewhere.example.com/200" }],
      MAPPING,
      "src-1",
      index,
    );
    expect(plan.records[0].outcome).toBe("verified_match");
    expect(recordNeedsReview(plan.records[0])).toBe(true);
  });

  it("IDENTITY verified-match is conclusive — no review queue noise", async () => {
    const { recordNeedsReview } = await import("../src/lib/sourceIngestion");
    const index: InventoryIndex = {
      ...emptyIndex,
      byExternalId: new Map([
        ["src-1␟SO-42", { listingId: "l-v", provenance: "verified", fingerprint: null }],
      ]),
    };
    const plan = planImport([baseRaw], MAPPING, "src-1", index);
    expect(plan.records[0].outcome).toBe("verified_match");
    expect(recordNeedsReview(plan.records[0])).toBe(false);
  });
});
