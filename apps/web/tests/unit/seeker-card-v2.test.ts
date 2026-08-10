import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  cardRecordCompleteness,
  formatSeasonLength,
  missingFactsSentence,
} from "@explore-and-earn/contracts";
import {
  DiscoveryCard,
  type DiscoveryCardData,
  type DiscoveryCardProps,
} from "@explore-and-earn/ui";
import {
  DISCOVERY_FIXTURE_IDS,
  isKnownDevDiscoveryFixtureId,
} from "../../components/discovery/fixtureIds";

/**
 * DISCOVERY CARD V2 (V2-G Part VI).
 *
 * Everything below asserts RENDERED OUTPUT or a pure contract, never a prop.
 * That distinction is not pedantry here: the two worst card defects this repo
 * has shipped — a verified badge on unverified hosts, and "included" and "not
 * included" rendering identical text — both passed a prop-level test suite,
 * because a prop being set says nothing about what a seeker sees.
 *
 * The negative cases are the real tests. Detail-only values can still travel
 * through older fixture objects, but the shared card must refuse to grow the
 * removed metadata footer back on any surface.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

function base(overrides: Partial<DiscoveryCardData> = {}): DiscoveryCardData {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    hostName: "Sunrise Orchards",
    title: "Orchard Crew",
    category: "farm",
    location: "Wenatchee, WA",
    opportunityWindow: "Jun – Sep",
    triad: { housing: "Included", meals: "Included", pay: "$18/hr" },
    benefitProvision: {
      housing: "provided",
      meals: "provided",
      pay: "provided",
    },
    ...overrides,
  } as DiscoveryCardData;
}

function render(
  props: Partial<DiscoveryCardProps> & { data: DiscoveryCardData },
): string {
  return renderToStaticMarkup(
    createElement(DiscoveryCard, { surface: "discovery_feed", ...props }),
  );
}

// ── 1. The state matrix ────────────────────────────────────────────────────

/**
 * Every state a seeker card can be in, and the words that state puts on the
 * screen. The table is the test: adding a state without deciding what it SAYS
 * is how "Closed" and "Expired" ended up as the same badge in the first place.
 */
const STATE_MATRIX: readonly [
  NonNullable<DiscoveryCardProps["cardState"]>,
  string,
][] = [
  ["saved", "Saved"],
  ["applied", "Applied"],
  ["offered", "Offered"],
  ["scheduled", "Schedule"],
  ["interview", "Interview"],
  ["accepted", "Accepted"],
  ["not_selected", "Passed"],
  ["withdrawn", "Withdrawn"],
  ["invited", "Invited"],
  ["paused", "Paused"],
  ["expired", "Expired"],
  ["closed", "Closed"],
  ["filled", "Filled"],
  ["skipped", "Skipped"],
  ["unavailable", "No longer available"],
];

describe("card state matrix", () => {
  it.each(STATE_MATRIX)("%s renders its own label (%s)", (state, label) => {
    const html = render({ data: base(), cardState: state });
    expect(html).toContain(label);
  });

  it("gives every state a DISTINCT label — no two states read the same", () => {
    const labels = STATE_MATRIX.map(([, label]) => label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  /**
   * A host closing a role and a listing expiring are facts about different
   * actors. Collapsing them tells the seeker somebody acted when nobody did.
   */
  it("does not confuse a host-closed role with an expired listing", () => {
    expect(render({ data: base(), cardState: "closed" })).not.toContain("Expired");
    expect(render({ data: base(), cardState: "expired" })).not.toContain("Closed");
  });

  it.each(["closed", "expired", "filled"] as const)(
    "%s offers no Apply button — the role is not open",
    (state) => {
      const html = render({
        data: base(),
        cardState: state,
        onApply: () => {},
        onOpen: () => {},
        onSave: () => {},
        onSkip: () => {},
      });
      expect(html).not.toContain(">Apply");
    },
  );

  it("a closed listing's CTA is disabled, not merely styled as passive", () => {
    const html = render({
      data: base(),
      cardState: "closed",
      onOpen: () => {},
    });
    expect(html).toContain("disabled");
  });
});

// ── 2. Fields the card renders, and the ones it refuses to invent ──────────

describe("stated facts come from stored columns only", () => {
  it("omits the detail metadata footer while preserving the compact card signals", () => {
    // These properties model a stale caller compiled against the retired card
    // footer contract. Runtime input must still be harmless: one shared card
    // powers demo, search, map, saved, lifecycle, and preview surfaces.
    const data = {
      ...base({ matchScore: 86 }),
      seasonLength: "about 2 months",
      closesOn: "Aug 22",
      housingSummary: "Optional shared staff cabin",
      mealsSummary: "One staff meal per shift; two on double shifts",
      matchReasons: [{ label: "availability" }],
      matchConfidence: 42,
    } as DiscoveryCardData;
    const html = render({ data });

    expect(html).not.toContain('aria-label="Opportunity at a glance"');
    expect(html).not.toContain("about 2 months");
    expect(html).not.toContain("Optional shared staff cabin");
    expect(html).not.toContain("One staff meal per shift; two on double shifts");
    expect(html).not.toContain("Listing closes Aug 22");
    expect(html).not.toContain("Strong on availability");

    // The request removes the pictured lower metadata block, not the concise
    // match pill or the locked Housing / Meals / Pay decision strip above it.
    expect(html).toContain('aria-label="Match 86 percent"');
    expect(html).toContain('aria-label="Housing: included"');
    expect(html).toContain('aria-label="Meals: included"');
    expect(html).toContain('aria-label="Pay — $18/hr"');
  });

  it("renders experience level and physical demand only when stored", () => {
    const withBoth = render({
      data: base({ experienceLevel: "some experience", physicalDemand: 2 }),
    });
    expect(withBoth).toContain("some experience");
    expect(withBoth).toContain("Demanding");

    const without = render({ data: base() });
    expect(without).not.toContain("Physical demand");
    expect(without).not.toContain("Experience</dt>");
  });

  /**
   * physical_demand is 0..3 and 0 is a real answer ("Light"). The absence of
   * the column is NOT 0, so an absent value must render nothing at all — the
   * bug this pins is `demand ?? 0`, which would tell every seeker that every
   * unanswered listing is light work.
   */
  it("treats an absent physical demand as unstated, never as 'Light'", () => {
    expect(render({ data: base() })).not.toContain("Light");
    expect(render({ data: base({ physicalDemand: 0 }) })).toContain("Light");
  });

  it("lets explicit not-provided pay override a stale rate everywhere", () => {
    const html = render({
      data: base({
        triad: { housing: "Included", meals: "Included", pay: "$99/hr stale" },
        benefitProvision: {
          housing: "provided",
          meals: "provided",
          pay: "not_provided",
        },
      }),
    });
    expect(html).toContain(">Not provided<");
    expect(html).toContain('aria-label="Pay: not provided"');
    expect(html).not.toContain("$99/hr stale");
  });

  it("shows at most three perks even when the host listed more", () => {
    const html = render({
      data: base({ perks: ["Gear", "Ski pass", "Laundry", "Gym", "Shuttle"] }),
    });
    expect(html).toContain("Gear");
    expect(html).toContain("Laundry");
    expect(html).not.toContain("Gym");
    expect(html).not.toContain("Shuttle");
  });

  it("renders the employer mark when a host profile carries one", () => {
    const html = render({
      data: base({ employerLogoUrl: "https://example.test/logo.png" }),
    });
    expect(html).toContain("https://example.test/logo.png");
  });

  /**
   * A sourced listing has no host profile, so it has no employer mark. Dressing
   * a scraped posting in a logo would present unconfirmed inventory as claimed.
   */
  it("never renders an employer mark on a sourced listing", () => {
    const html = render({
      data: base({
        provenance: "sourced",
        employerLogoUrl: "https://example.test/logo.png",
      }),
    });
    expect(html).not.toContain("https://example.test/logo.png");
  });
});

// ── 3. Honest incomplete records ───────────────────────────────────────────

describe("what's missing, said out loud", () => {
  it("says nothing at all when the listing answers everything", () => {
    const complete = cardRecordCompleteness({
      location: "Wenatchee, WA",
      begins: "2026-06-01",
      ends: "2026-09-01",
      housingProvision: "provided",
      mealsProvision: "provided",
      payValue: "$18/hr",
    });
    expect(complete.missing).toEqual([]);
    expect(complete.completeness).toBe(100);
    expect(missingFactsSentence(complete.missing)).toBeNull();
  });

  it("counts an unanswered benefit as missing even though the column says false", () => {
    // The trap: housing_included=false with housing_evidence='not_stated' is
    // "nobody answered", not "no housing". A card that reads the boolean alone
    // reports a definite NO the host never gave.
    const result = cardRecordCompleteness({
      location: "Wenatchee, WA",
      begins: "2026-06-01",
      housingProvision: "not_provided",
      mealsProvision: "provided",
      payValue: "$18/hr",
      benefitEvidence: { housing: "not_stated" },
    });
    expect(result.missing).toContain("housing");
  });

  it("treats the 'Location not specified' sentinel as an absence", () => {
    const result = cardRecordCompleteness({
      location: "Location not specified",
      begins: "2026-06-01",
      housingProvision: "provided",
      mealsProvision: "provided",
      payValue: "$18/hr",
    });
    expect(result.missing).toContain("location");
  });

  it("treats the 'Open' window sentinel as an absence of dates", () => {
    const result = cardRecordCompleteness({
      location: "Wenatchee, WA",
      opportunityWindow: "Open",
      housingProvision: "provided",
      mealsProvision: "provided",
      payValue: "$18/hr",
    });
    expect(result.missing).toContain("dates");
  });

  it("reduces confidence at two or more gaps, not at one", () => {
    const one = cardRecordCompleteness({
      location: "Wenatchee, WA",
      begins: "2026-06-01",
      housingProvision: "provided",
      mealsProvision: "provided",
      payValue: "",
    });
    expect(one.missing).toHaveLength(1);
    expect(one.reducedConfidence).toBe(false);

    const two = cardRecordCompleteness({
      location: "",
      begins: "2026-06-01",
      housingProvision: "provided",
      mealsProvision: "provided",
      payValue: "",
    });
    expect(two.reducedConfidence).toBe(true);
  });

  it("renders the gap sentence on the card, with the answered percentage", () => {
    const html = render({
      data: base({
        location: "Location not specified",
        triad: { housing: "Not stated", meals: "Not stated", pay: "" },
        benefitProvision: {
          housing: "not_stated",
          meals: "not_stated",
          pay: "not_stated",
        },
      }),
    });
    expect(html).toContain("This host hasn&#x27;t stated");
    expect(html).toContain("% of this listing is answered");
    expect(html).toContain('data-reduced="true"');
  });

  it("invents no value for a gap — the sentence names it instead", () => {
    const html = render({
      data: base({
        triad: { housing: "Not stated", meals: "Not stated", pay: "$18/hr" },
        benefitProvision: {
          housing: "not_stated",
          meals: "not_stated",
          pay: "provided",
        },
      }),
    });
    expect(html).toContain("housing");
    // The one thing it must never do is fill the gap with a cheerful default.
    expect(html).not.toContain("Included</span></div><div");
  });
});

// ── 4. Season length is arithmetic, not a guess ───────────────────────────

describe("formatSeasonLength", () => {
  it("returns null when either date is missing", () => {
    expect(formatSeasonLength("2026-06-01", undefined)).toBeNull();
    expect(formatSeasonLength(undefined, "2026-09-01")).toBeNull();
    expect(formatSeasonLength(undefined, undefined)).toBeNull();
  });

  it("returns null for an unparseable or inverted range", () => {
    expect(formatSeasonLength("not a date", "2026-09-01")).toBeNull();
    expect(formatSeasonLength("2026-09-01", "2026-06-01")).toBeNull();
  });

  it("hedges: weeks below two months, months above", () => {
    expect(formatSeasonLength("2026-06-01", "2026-07-27")).toMatch(/about \d+ weeks/);
    expect(formatSeasonLength("2026-06-01", "2026-10-01")).toMatch(/about \d+ months/);
  });
});

// ── 5. Popovers: keyboard + touch + SR operable, never hover-only ──────────

describe("the card's explainers are real dialogs", () => {
  it("makes the dates strip a BUTTON when a handler is supplied", () => {
    const html = render({
      data: base({ begins: "Jun 1", ends: "Sep 1" }),
      onDatesClick: () => {},
    });
    expect(html).toMatch(/<button[^>]*aria-label="Dates:[^"]*season details"/);
  });

  it("leaves the dates strip as plain text when there is nothing to open", () => {
    const html = render({ data: base({ begins: "Jun 1", ends: "Sep 1" }) });
    expect(html).not.toContain("season details");
  });

  it("makes the verified badge a BUTTON that can explain itself", () => {
    const html = render({
      data: base({ verifiedHost: true }),
      onVerificationClick: () => {},
    });
    expect(html).toContain('aria-label="Verified Host — what this means"');
  });

  it("makes the match pill a BUTTON when a detail handler exists", () => {
    const html = render({
      data: base({ matchScore: 88 }),
      onMatchClick: () => {},
    });
    expect(html).toContain("why this matched");
  });

  it("still announces the match score when no explainer is wired", () => {
    const html = render({ data: base({ matchScore: 88 }) });
    expect(html).toContain('aria-label="Match 88 percent"');
  });

  /**
   * The three new explainers render through PopupShell, which is what gives
   * them focus movement, a focus trap, Escape-to-close, focus restoration and
   * sibling aria-hidden. Pinned at the source because a later edit that swapped
   * PopupShell for a bare div would render identically and be silently
   * unreachable by keyboard.
   */
  it("routes every new explainer through the accessible PopupShell", () => {
    const popover = read("components/discovery/CardDetailPopover.tsx");
    expect(popover).toContain("PopupShell");
    expect(popover).not.toMatch(/onMouseOver|onMouseEnter/);
  });

  it("PopupShell still owns focus, Escape, and the sibling aria-hidden", () => {
    const shell = read("components/overlay/PopupShell.tsx");
    expect(shell).toContain('event.key === "Escape"');
    expect(shell).toContain('event.key !== "Tab"');
    expect(shell).toContain("(focusables()[0] ?? panel).focus()");
    expect(shell).toMatch(
      /if \(items\.length === 0\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?panel\.focus\(\)/,
    );
    expect(shell).toContain("tabIndex={-1}");
    expect(shell).toContain("restoreFocusRef.current?.focus()");
    expect(shell).toContain('setAttribute("aria-hidden", "true")');
    expect(shell).toContain("inert={closing}");
  });

  it("wires all three explainers into the ONE shared popup host", () => {
    const hook = read("components/discovery/useListingCardPopups.tsx");
    for (const handler of ["onDatesClick", "onVerificationClick", "onMatchClick"]) {
      expect(hook).toContain(handler);
    }
    expect(hook).toContain("<CardDetailPopover");
  });
});

// ── 6. Match explanation stays in the detail experience ───────────────────

describe("match reasons", () => {
  it("keeps match reasons and confidence in the accessible detail explainer", () => {
    const popover = read("components/discovery/CardDetailPopover.tsx");
    expect(popover).toContain("listing.matchReasons");
    expect(popover).toContain("listing.matchConfidence");
    expect(popover).toContain("Why this matched you");
  });

  it("derives reason text at map time and stores none of it", () => {
    const mapper = readFileSync(
      new URL("../../../../packages/db/src/queries/listings.ts", import.meta.url),
      "utf8",
    );
    expect(mapper).toContain("topMatchReasons");
    // The engine persists numbers; the sentence is composed on the way out.
    expect(mapper).not.toMatch(/reason_text|matchReasonText/);
  });
});

// ── 7. Image-zone actions ─────────────────────────────────────────────────

describe("the image zone", () => {
  it("offers share and report as labelled buttons", () => {
    const html = render({
      data: base(),
      onShare: () => {},
      onReport: () => {},
    });
    expect(html).toContain('aria-label="Share this opportunity"');
    expect(html).toContain('aria-label="Report listing"');
  });

  /**
   * Two Save controls on one card is two places to wonder whether the first one
   * worked. The hero Save exists only where the decision bar does not.
   */
  it("does not double up Save when the decision bar is showing", () => {
    const html = render({
      data: base(),
      surface: "discovery_feed",
      onApply: () => {},
      onSave: () => {},
      onSkip: () => {},
    });
    const saves = html.match(/Save this opportunity/g) ?? [];
    expect(saves).toHaveLength(1);
  });

  it("offers a hero Save on surfaces with no decision bar", () => {
    const html = render({
      data: base(),
      surface: "saved",
      cardState: "saved",
      onSave: () => {},
      onOpen: () => {},
    });
    expect(html).toContain('aria-label="Saved"');
  });

  it("renders labelled Skip / Apply / Save actions in the locked 20 / 60 / 20 split", () => {
    const html = render({
      data: base(),
      onApply: () => {},
      onSave: () => {},
      onSkip: () => {},
    });
    expect(html).toMatch(/>Skip<\/button>/);
    expect(html).toMatch(/>Apply[\s\S]*<\/button>/);
    expect(html).toMatch(/>Save<\/button>/);

    const css = readFileSync(
      new URL("../../../../packages/ui/src/DiscoveryCard.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, 3fr) minmax(0, 1fr)",
    );

    const swipeHtml = render({
      data: base(),
      surface: "swipe",
      onApply: () => {},
      onSave: () => {},
      onSkip: () => {},
    });
    expect(swipeHtml).toMatch(/>Skip<\/button>/);
    expect(swipeHtml).toMatch(/>Apply[\s\S]*<\/button>/);
    expect(swipeHtml).toMatch(/>Save<\/button>/);
  });

  it.each([
    ["Skip", { onApply: () => {}, onSave: () => {} }],
    ["Apply", { onOpen: () => {}, onSkip: () => {}, onSave: () => {} }],
    ["Save", { onApply: () => {}, onSkip: () => {} }],
  ] as const)("does not render the three-action bar when %s has no real handler", (_missing, handlers) => {
    const html = render({ data: base(), ...handlers });
    expect(html).not.toMatch(/>Skip<\/button>/);
    expect(html).not.toMatch(/>Apply[\s\S]*<\/button>/);
    expect(html).not.toMatch(/>Save<\/button>/);
  });

  it("wires all three Swipe actions into the canonical card controls", () => {
    const source = read("components/seeker/SwipeDeck.tsx");
    for (const action of ["pass", "apply", "save"]) {
      expect(source).toContain(`void triggerLeave("${action}")`);
    }
  });

  it("uses the server-authoritative exclusive transition for Seek save/skip", () => {
    const source = read("components/seeker/SeekBrowser.tsx");
    const actionStart = source.indexOf("const setCardDecision");
    const actionEnd = source.indexOf("const getCardState", actionStart);
    const actions = source.slice(actionStart, actionEnd);

    expect(actionStart).toBeGreaterThan(-1);
    expect(actionEnd).toBeGreaterThan(actionStart);
    expect(actions).toContain("decisionInFlight.current.has(id)");
    expect(actions).toContain("setSavedIds(");
    expect(actions).toContain("setSkippedIds(");
    expect(actions).toContain(
      "setMapListingDecisionAction(id, decision)",
    );
    expect(actions).toContain(
      "result.decision === undefined ? previous : result.decision",
    );
    expect(actions).toContain(".catch(() => {");
    expect(actions).toContain("setCardDecision(id, previous);");
    expect(actions).toContain(
      'setDecisionError("We couldn’t reach the server. Try again.")',
    );
    expect(actions).not.toContain("unsaveListingAction(id)");
    expect(actions).not.toContain("unpassListingAction(id)");
  });
});

describe("Housing and Meals evidence popups", () => {
  it("treats only known non-production fixtures as confirmed empty evidence", () => {
    for (const listingId of Object.values(DISCOVERY_FIXTURE_IDS)) {
      expect(isKnownDevDiscoveryFixtureId(listingId, "development")).toBe(true);
      expect(isKnownDevDiscoveryFixtureId(listingId, "test")).toBe(true);
      expect(isKnownDevDiscoveryFixtureId(listingId, "production")).toBe(false);
    }
    expect(isKnownDevDiscoveryFixtureId("lst_unknown_fixture", "development")).toBe(false);
    expect(isKnownDevDiscoveryFixtureId(undefined, "development")).toBe(false);
  });

  it("attests fixture evidence only in an explicitly enabled Vercel Preview", () => {
    const data = read("components/discovery/data.ts");
    const mapPage = read("app/[locale]/(seeker)/map/page.tsx");
    const map = read("components/map/MapView.tsx");
    const provider = read("components/discovery/useListingCardPopups.tsx");
    expect(data).toContain('process.env.NODE_ENV === "production"');
    expect(data).toContain('process.env.VERCEL_ENV === "preview"');
    expect(data).toContain('process.env.PREVIEW_MAP_FIXTURES === "1"');
    expect(data).toContain("knownEmptyBenefitDetailsListingIds");
    expect(data).toContain("isKnownDiscoveryFixtureId");
    expect(mapPage).toContain("mapData.knownEmptyBenefitDetailsListingIds");
    expect(map).toContain(
      "knownEmptyBenefitDetailsListingIds={knownEmptyBenefitDetailsListingIds}",
    );
    expect(provider).toContain('publicReadEvidence={');
    expect(provider).toContain('? "known_empty"');
  });

  it("keeps all four defined photo categories visible in seeker view", () => {
    const source = read("components/discovery/BenefitTrustModal.tsx");
    const action = read("app/actions/benefitDetails.ts");

    expect(source).toContain("const slotsToShow = configuredSlots;");
    expect(source).toContain("housingPhotoSlots(category)");
    for (const mealSlot of ['id: "kitchen"', 'id: "prepared"', 'id: "dining"', 'id: "misc"']) {
      expect(source).toContain(mealSlot);
    }
    expect(source).toContain("no photo added");
    expect(source).toContain("photo categories added");
    expect(source).toContain("<PopupShell");

    expect(action).toContain("{ ok: true, details: await getPublicBenefitDetails(listingId) }");
    expect(action).toContain('ok: false,');
    expect(source).toContain('if (!res.ok) throw new Error(res.error);');
    expect(source).toContain('status: "loading"');
    expect(source).toContain('status: "ready"');
    expect(source).toContain('status: "unavailable"');
    expect(source).toContain("Loading host photo evidence…");
    expect(source).toContain("Host photo evidence is unavailable right now.");
    expect(source).toContain("checking photo availability");
    expect(source).toContain("photo availability unknown");
    expect(source).toContain("Availability unknown");
    expect(source).toMatch(
      /className=\{styles\.photoEmpty\}[\s\S]*?role="img"[\s\S]*?aria-label=/,
    );
    expect(source).toContain('!isEdit && publicReadStatus === "ready"');

    const fixtureBranchStart = source.indexOf("if (knownEmptyFixtureEvidence)");
    const publicLoadStart = source.indexOf("const load =", fixtureBranchStart);
    const fixtureBranch = source.slice(fixtureBranchStart, publicLoadStart);
    expect(fixtureBranchStart).toBeGreaterThan(-1);
    expect(publicLoadStart).toBeGreaterThan(fixtureBranchStart);
    expect(fixtureBranch).toContain('status: "ready"');
    expect(fixtureBranch).toContain("return;");
    expect(source).toMatch(
      /knownEmptyFixtureEvidence[\s\S]*?\? "ready"[\s\S]*?: !listingId/,
    );
  });
});
