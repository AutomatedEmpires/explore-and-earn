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

/**
 * The files this test guards: the four that re-typed a label as a raw literal
 * and now import the constant instead.
 *
 * NOT an exhaustive list of every consumer — ClaimConfirmationForm, for one,
 * already imported NOT_STATED_LABEL correctly and needs no guarding. New
 * render sites should be added here.
 */
const GUARDED_SITES = [
  "apps/web/components/listing/DealUpfront.tsx",
  "apps/web/components/listing/SourcedNotice.tsx",
  // The detail page itself renders benefit-state labels in the W5 deal rail —
  // same rule: reference the contracts constants, never re-type the copy.
  "apps/web/app/[locale]/listing/[id]/page.tsx",
  "apps/web/components/discovery/QuickPeekDrawer.tsx",
  "packages/ui/src/DiscoveryCard.tsx",
  // Host authoring surfaces: these promise the host that an unanswered field
  // shows as "Not stated". If that copy drifts from what the seeker actually
  // sees, the promise silently stops being true.
  "apps/web/components/host/ConnectivityFields.tsx",
  "apps/web/components/host/MaritimeDepthFields.tsx",
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

  for (const site of GUARDED_SITES) {
    it(`${site} re-types neither honesty label`, () => {
      const code = readSite(site);
      // Match the BARE copy, not a quoted form: "Not stated", 'Not stated',
      // `Not stated` and a bare JSX text node <span>Not stated</span> must all
      // fail. Quoting the needle would only catch the one form we happened to
      // write, which is exactly the drift this test exists to stop.
      expect(code).not.toContain(NOT_STATED_LABEL);
      // The disclosure's own ampersand differs by encoding across JSX/TS, so
      // assert on the stable prefix rather than the full constant.
      expect(code).not.toContain("Sourced · not yet confirmed");
      expect(code).not.toContain("Sourced &middot; not yet confirmed");
    });
  }

  it("every guarded site imports the constant it uses", () => {
    for (const site of GUARDED_SITES) {
      const code = readSite(site);
      const usesNotStated = code.includes("NOT_STATED_LABEL");
      const usesSourced = code.includes("SOURCED_DISCLOSURE_LABEL");
      // Each guarded site renders at least one of the two labels.
      expect(usesNotStated || usesSourced, `${site} renders neither label`).toBe(true);
      // Whatever it uses must come from the contracts package.
      expect(code, `${site} must import from @explore-and-earn/contracts`).toContain(
        "@explore-and-earn/contracts",
      );
    }
  });
});
