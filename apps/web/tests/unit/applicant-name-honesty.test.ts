/**
 * A host surface must never present a failed name lookup as an anonymous
 * applicant.
 *
 * Migration 084 exists because a host's read of seeker_profiles was filtered to
 * zero rows with no error: every applicant rendered as the literal string
 * "Seeker" and a dead feature looked like an empty one. The repair moved the
 * read into an entitlement-checked RPC, which can now FAIL — and the tempting
 * way to handle that failure is `?? "Seeker"`, which rebuilds the original bug
 * on top of the fix.
 *
 * The decision lives in resolveSeekerName / singleSeekerName (asserted below
 * against the real module). This file additionally pins the CALL SITES, because
 * the contract only helps if the surfaces go through it: a page that reads the
 * map itself and supplies its own fallback is back where it started, and
 * nothing else in the suite would notice.
 *
 * apps/web is jsx:preserve and @explore-and-earn/db's index imports
 * "server-only", so the pure module is imported by path and the pages are read
 * as source.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  SEEKER_NAME_UNAVAILABLE,
  resolveSeekerName,
  singleSeekerName,
  type SeekerNameLookup,
} from "../../../../packages/db/src/lib/hostApplicantView";

const HOST_ROOT = new URL("../../app/[locale]/(host)/host/", import.meta.url);

function source(relative: string): string {
  return readFileSync(new URL(relative, HOST_ROOT), "utf8");
}

/**
 * Every file that touches a resolved name on its way to a host's screen.
 *
 * V2-F2 MOVED THE MESSAGE SURFACES. Both `/host/messages` and
 * `/host/messages/[id]` now render one workspace and load their thread list
 * from `messages/messages-data.ts`, so that module — not the two pages — is
 * where a name is resolved. Listing both pages here after the move would have
 * been a test that passes because the pages no longer mention names at all,
 * which is the failure mode this file exists to catch.
 */
const NAME_SURFACES = [
  "applicants/applicants-data.ts",
  "applicants/page.tsx",
  "applicants/[id]/page.tsx",
  "messages/messages-data.ts",
  "listings/[id]/page.tsx",
] as const;

/**
 * The files that actually produce the label. /host/applicants/page.tsx is not
 * one of them: it hands the whole lookup to toApplicantItem, which is asserted
 * separately below.
 */
const LABEL_PRODUCERS = [
  "applicants/applicants-data.ts",
  "applicants/[id]/page.tsx",
  "messages/messages-data.ts",
  "listings/[id]/page.tsx",
] as const;

/** The modules that perform a lookup, as opposed to consuming one. */
const LOOKUP_CALLERS = [
  "applicants/page.tsx",
  "applicants/[id]/page.tsx",
  "messages/messages-data.ts",
  "listings/[id]/page.tsx",
] as const;

describe("a failed name lookup is never rendered as an applicant", () => {
  const resolvedWithName: SeekerNameLookup = {
    status: "resolved",
    names: new Map([["seeker-1", "Dana Applicant"]]),
  };
  const resolvedWithoutName: SeekerNameLookup = { status: "resolved", names: new Map() };
  const unavailable: SeekerNameLookup = { status: "unavailable", reason: "rpc exploded" };

  it("returns the real name when the database answered", () => {
    expect(resolveSeekerName(resolvedWithName, "seeker-1", "Seeker")).toBe("Dana Applicant");
  });

  it("uses the surface's own placeholder only for an answer of 'no name'", () => {
    expect(resolveSeekerName(resolvedWithoutName, "seeker-1", "Seeker")).toBe("Seeker");
    expect(singleSeekerName(resolvedWithoutName, "seeker-1")).toBeNull();
  });

  it("says unavailable — not 'Seeker' — when the lookup itself failed", () => {
    const label = resolveSeekerName(unavailable, "seeker-1", "Seeker");
    expect(label).toBe(SEEKER_NAME_UNAVAILABLE);
    expect(label).not.toBe("Seeker");
    expect(singleSeekerName(unavailable, "seeker-1")).toBeNull();
  });
});

describe("the host surfaces go through the contract", () => {
  it("resolves names only through resolveSeekerName / singleSeekerName", () => {
    for (const file of LABEL_PRODUCERS) {
      const text = source(file);
      expect(
        /resolveSeekerName|singleSeekerName/.test(text),
        `${file} renders a seeker name without the lookup contract`,
      ).toBe(true);
    }
  });

  it("passes the whole lookup down instead of unwrapping it at the page", () => {
    // The pipeline page delegates the label to toApplicantItem. If it ever
    // pulled the map out and passed that instead, the "unavailable" case would
    // be lost in transit and the cards would silently show the handle again.
    const page = source("applicants/page.tsx");
    expect(page).toMatch(/toApplicantItem\(\s*application,\s*listingsById,\s*displayNames/);
    expect(page).not.toMatch(/displayNames\.names/);
  });

  it("never reads the name map directly and supplies its own fallback", () => {
    // The exact shape this replaced: `displayNames.get(id) ?? "Seeker"`.
    for (const file of NAME_SURFACES) {
      const text = source(file);
      expect(
        /(displayNames|seekerDisplayNames|names)\s*\.get\([^)]*\)\s*\?\?/.test(text),
        `${file} falls back on a raw name map instead of the contract`,
      ).toBe(false);
    }
  });

  it("logs the reason a lookup failed instead of discarding it", () => {
    for (const file of LOOKUP_CALLERS) {
      const text = source(file);
      expect(
        text.includes('=== "unavailable"'),
        `${file} does not notice an unavailable name lookup`,
      ).toBe(true);
      expect(
        /console\.error\([^)]*reason/s.test(text),
        `${file} swallows the reason the lookup failed`,
      ).toBe(true);
    }
  });

  it("keeps the applicant detail page's resume read loud", () => {
    // The asymmetry is deliberate: the resume IS that page, so a fault there
    // must fail the request rather than render a blank applicant. If this ever
    // grows a catch, the 084 defect is back on the surface that matters most.
    const detail = source("applicants/[id]/page.tsx");
    expect(detail).toContain("getSeekerResumeByProfileId(");
    expect(detail).not.toMatch(/getSeekerResumeByProfileId\([^)]*\)\s*\.catch\(/);
  });
});
