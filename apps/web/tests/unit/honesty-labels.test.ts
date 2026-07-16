/**
 * Evidence-honesty copy must be SINGLE-SOURCED.
 *
 * "Not stated" and the sourced disclosure are product law (contracts
 * provenance.ts: absence is never presented as a "no", and a sourced listing
 * always discloses that Explore & Earn has not confirmed it). Both strings
 * were duplicated as raw literals across four render sites — the detail page
 * (DealUpfront, SourcedNotice), the discovery drawer (QuickPeekDrawer), and
 * the shared card (packages/ui DiscoveryCard) — so a wording change could
 * silently land on some surfaces and not others, and a seeker could see two
 * different disclosures for the same listing.
 *
 * No guardrail enforces this (verified: no check-*.mjs greps for these
 * strings), so this test is the ratchet: every render site must import the
 * exported constant rather than re-type the copy.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NOT_STATED_LABEL,
  SOURCED_DISCLOSURE_LABEL,
} from "@explore-and-earn/contracts";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** Every file that RENDERS either honesty label to a user. */
const RENDER_SITES = [
  "apps/web/components/listing/DealUpfront.tsx",
  "apps/web/components/listing/SourcedNotice.tsx",
  "apps/web/components/discovery/QuickPeekDrawer.tsx",
  "packages/ui/src/DiscoveryCard.tsx",
] as const;

/** Strip block/line comments — docstrings legitimately quote the copy. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function readSite(relPath: string): string {
  return stripComments(readFileSync(join(REPO_ROOT, relPath), "utf8"));
}

describe("evidence-honesty copy is single-sourced", () => {
  it("the constants are the exact product-law strings", () => {
    // Pin the copy itself: a silent reword here would slip past every site.
    expect(NOT_STATED_LABEL).toBe("Not stated");
    expect(SOURCED_DISCLOSURE_LABEL).toBe(
      "Sourced · not yet confirmed by Explore & Earn",
    );
  });

  for (const site of RENDER_SITES) {
    it(`${site} re-types neither honesty label`, () => {
      const code = readSite(site);
      // The literal copy must not appear outside comments…
      expect(code).not.toContain(`"${NOT_STATED_LABEL}"`);
      expect(code).not.toContain("Sourced · not yet confirmed");
      // …including the JSX-escaped ampersand form that reads identically.
      expect(code).not.toContain("Sourced &middot; not yet confirmed");
    });
  }

  it("every render site imports the constant it uses", () => {
    for (const site of RENDER_SITES) {
      const code = readSite(site);
      const usesNotStated = code.includes("NOT_STATED_LABEL");
      const usesSourced = code.includes("SOURCED_DISCLOSURE_LABEL");
      // Each site renders at least one of the two labels.
      expect(usesNotStated || usesSourced, `${site} renders neither label`).toBe(true);
      // Whatever it uses must come from the contracts package.
      expect(code, `${site} must import from @explore-and-earn/contracts`).toContain(
        "@explore-and-earn/contracts",
      );
    }
  });
});
