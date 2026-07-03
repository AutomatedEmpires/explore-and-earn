/**
 * Unit tests for buildSearchTermFilter (packages/db/src/queries/listings.ts) —
 * the fuzzy free-text search filter. Pins the exact PostgREST or() string so the
 * three signals (full-text, trigram title, trigram location) stay wired and the
 * format (which was validated as HTTP 200 against a live PostgREST) can't drift.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildSearchTermFilter } = await import("../src/queries/listings");

describe("buildSearchTermFilter", () => {
  it("combines full-text + trigram title + trigram location for a single word", () => {
    expect(buildSearchTermFilter("farm")).toBe(
      "search_vector.plfts(english).farm,title.ilike.*farm*,location_display.ilike.*farm*",
    );
  });

  it("catches partial words the tsvector would miss (trigram ilike)", () => {
    // "maritim" is a substring of "Maritime", so the ilike arms match even
    // though the tsvector lexeme would not.
    const filter = buildSearchTermFilter("maritim");
    expect(filter).toContain("title.ilike.*maritim*");
    expect(filter).toContain("location_display.ilike.*maritim*");
  });

  it("preserves multi-word terms in every arm", () => {
    const filter = buildSearchTermFilter("orchard work");
    expect(filter).toContain("search_vector.plfts(english).orchard work");
    expect(filter).toContain("title.ilike.*orchard work*");
  });

  it("produces exactly three comma-separated conditions", () => {
    // The term is pre-sanitized (no commas), so the only commas are separators.
    expect(buildSearchTermFilter("sonoma").split(",")).toHaveLength(3);
  });
});
