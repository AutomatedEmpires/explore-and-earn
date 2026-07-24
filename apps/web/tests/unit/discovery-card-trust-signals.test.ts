import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  DiscoveryCard,
  type DiscoveryCardData,
  type DiscoveryCardProps,
} from "@explore-and-earn/ui";

/**
 * Card trust + benefit honesty (UX review 2026-07-23).
 *
 * Two defects this pins, both of which shipped green because the existing
 * tests asserted PROPS rather than RENDERED OUTPUT:
 *
 * 1. The Verified-Host check rendered on every non-sourced card. Its gate was
 *    `!isApplicantReview && !isSourced` — it never consulted `verified`, so a
 *    free host wore the same trust mark as a paying Verified Host on 9 of 10
 *    surfaces, and the paid tier's only on-card benefit was void. The badge
 *    asserts an active paid plan (contracts/card.ts hasVerifiedHostSubscription).
 *
 * 2. Housing/Meals "included" vs "not included" rendered the SAME text with no
 *    icon and no marker — distinguished only by green vs red. Colour must never
 *    be the sole carrier of meaning.
 *
 * Every assertion below is on the OUTPUT. Each negative case is the real test:
 * assert the refusal, not just the happy path.
 */

function base(overrides: Partial<DiscoveryCardData> = {}): DiscoveryCardData {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    hostName: "Sunrise Orchards",
    title: "Orchard Crew",
    category: "farm",
    location: "Wenatchee, WA",
    opportunityWindow: "Jun – Sep",
    triad: { housing: "Included", meals: "Included", pay: "$18/hr" },
    ...overrides,
  } as DiscoveryCardData;
}

function render(props: Partial<DiscoveryCardProps> & { data: DiscoveryCardData }): string {
  return renderToStaticMarkup(
    createElement(DiscoveryCard, { surface: "discovery_feed", ...props }),
  );
}

describe("Verified-Host badge is earned, never assumed", () => {
  it("does NOT render for a host without verification", () => {
    const html = render({ data: base({ verifiedHost: false }) });
    expect(html).not.toContain('aria-label="Verified Host"');
  });

  it("does NOT render when verification is simply absent", () => {
    const html = render({ data: base() });
    expect(html).not.toContain('aria-label="Verified Host"');
  });

  it("DOES render for a genuinely verified host", () => {
    const html = render({ data: base({ verifiedHost: true }) });
    expect(html).toContain('aria-label="Verified Host"');
  });

  it("never renders on a sourced listing, even if the flag is somehow true", () => {
    const html = render({
      data: base({ verifiedHost: true, provenance: "sourced" }),
    });
    expect(html).not.toContain('aria-label="Verified Host"');
  });

  it("the badge is an announced role=img, not a silent generic span", () => {
    const html = render({ data: base({ verifiedHost: true }) });
    expect(html).toMatch(/role="img"[^>]*aria-label="Verified Host"|aria-label="Verified Host"[^>]*role="img"/);
  });
});

describe("Housing/Meals never rely on colour alone", () => {
  it("'not included' says so in TEXT, not just in red", () => {
    const html = render({
      data: base({
        triad: { housing: "Not included", meals: "Not included", pay: "$18/hr" },
        benefitProvision: { housing: "not_provided", meals: "not_provided", pay: "provided" },
      } as Partial<DiscoveryCardData>),
    });
    expect(html).toContain("No housing");
    expect(html).toContain("No meals");
  });

  it("'included' keeps the plain label", () => {
    const html = render({
      data: base({
        benefitProvision: { housing: "provided", meals: "provided", pay: "provided" },
      } as Partial<DiscoveryCardData>),
    });
    expect(html).toContain(">Housing<");
    expect(html).toContain(">Meals<");
    expect(html).not.toContain("No housing");
  });

  it("included and not-included never render identical visible text", () => {
    const inc = render({
      data: base({
        benefitProvision: { housing: "provided", meals: "provided", pay: "provided" },
      } as Partial<DiscoveryCardData>),
    });
    const not = render({
      data: base({
        benefitProvision: { housing: "not_provided", meals: "not_provided", pay: "provided" },
      } as Partial<DiscoveryCardData>),
    });
    // The whole defect in one assertion: the two states must differ in markup
    // by more than a CSS class name.
    const strip = (h: string) => h.replace(/class="[^"]*"/g, "").replace(/aria-label="[^"]*"/g, "");
    expect(strip(inc)).not.toBe(strip(not));
  });

  it("aria still names the state for every benefit cell", () => {
    const html = render({
      data: base({
        benefitProvision: { housing: "not_provided", meals: "provided", pay: "provided" },
      } as Partial<DiscoveryCardData>),
    });
    expect(html).toContain('aria-label="Housing: not included"');
    expect(html).toContain('aria-label="Meals: included"');
  });
});
