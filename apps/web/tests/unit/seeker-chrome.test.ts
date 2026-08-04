import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SEEKER_COACHMARKS } from "../../components/seeker/SeekerCoachmarks";

/**
 * SEEKER CHROME (V2-G requirements 5 and 6).
 *
 * Three things that regress silently, because each one produces a page that
 * renders perfectly while being wrong:
 *
 *   1. THE BLOCKING TOUR. A modal that traps focus and hides the page from
 *      assistive tech looks fine in a screenshot. It is only wrong if you try
 *      to use the thing it is describing.
 *
 *   2. THE DASHBOARD SWALLOWING DISCOVERY. Rendering <SeekerDashboard> above
 *      the results on /seek is one import. It pushes the marketplace below the
 *      fold on the route whose entire job is the marketplace, and nothing
 *      fails.
 *
 *   3. A COACHMARK POINTING AT NOTHING. An anchor id that no surface renders
 *      leaves the tour describing a control the seeker cannot find, and the
 *      only symptom is a bubble parked in the corner.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

/**
 * Strip comments before any NEGATIVE scan. Several of the assertions below say
 * "this file must not contain X" — and the files explain, in comments, exactly
 * which X they removed and why. Scanning the raw text would fail on the
 * explanation, which is the one part that should never be deleted.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const shell = read("components/seeker/SeekerShell.tsx");
const shellCode = stripComments(shell);
const coachmarks = read("components/seeker/SeekerCoachmarks.tsx");
const coachmarkCss = read("components/seeker/SeekerCoachmarks.module.css");
const dashboard = read("components/seeker/SeekerDashboard.tsx");
const seekPage = read("app/[locale]/(seeker)/seek/page.tsx");
const homePage = read("app/[locale]/(seeker)/home/page.tsx");
const seekerLayout = read("app/[locale]/(seeker)/layout.tsx");
const assistantPage = read("app/[locale]/(seeker)/assistant/page.tsx");
const communityJoinGate = read(
  "app/[locale]/(seeker)/community/CommunityJoinGate.tsx",
);
// The dashboard's reads live behind one seam since redesign W1 (getSeasonBoard);
// the honesty invariants below follow the code to where it moved.
const seasonData = read("components/seeker/data.ts");

describe("the seeker shell landmark", () => {
  it("owns exactly one main landmark for every seeker route", () => {
    expect(shell).toContain('<main className="seekeros-contentwrap">');
    expect(assistantPage).not.toContain("<main");
    expect(communityJoinGate).not.toContain("<main");
  });
});

describe("the local seeker review state", () => {
  it("does not wait on configured local data services", () => {
    expect(homePage).toContain(
      "isDevBenchEnabled() && (await readDevRole())",
    );
    expect(homePage).toContain(
      "getSeasonBoard(undefined, undefined, devSeekerName())",
    );
    expect(seekerLayout).toContain("unreadCommunity: 0");
  });
});

// ── 1. The blocking modal is dead ─────────────────────────────────────────

describe("the seeker tour no longer blocks the product (D19)", () => {
  it("the shell renders no OnboardingWalkthrough", () => {
    expect(shellCode).not.toContain("OnboardingWalkthrough");
    expect(shellCode).not.toContain("SEEKER_TOUR_STEPS");
  });

  it("the shell renders the anchored coachmarks instead", () => {
    expect(shell).toContain("<SeekerCoachmarks");
  });

  /**
   * aria-modal="false" is the whole contract: the control the bubble points at
   * has to stay usable while the bubble explains it. Flipping this to true
   * would restore the exact defect, invisibly.
   */
  it("the coachmark is a NON-modal dialog", () => {
    expect(coachmarks).toContain('aria-modal="false"');
    expect(coachmarks).toContain('role="dialog"');
  });

  it("adds no scrim, no scroll lock, and hides nothing from assistive tech", () => {
    expect(coachmarks).not.toContain("overflow = \"hidden\"");
    expect(coachmarks).not.toMatch(/setAttribute\("aria-hidden"/);
    expect(coachmarkCss).not.toMatch(/^\.scrim/m);
  });

  it("is labelled, described, keyboard-dismissable, and restores focus", () => {
    expect(coachmarks).toContain("aria-labelledby");
    expect(coachmarks).toContain("aria-describedby");
    expect(coachmarks).toContain('aria-live="polite"');
    expect(coachmarks).toContain('event.key === "Escape"');
    expect(coachmarks).toContain("launcherRef.current?.focus()");
  });

  it("persists progress across visits", () => {
    expect(coachmarks).toContain("window.localStorage");
    expect(coachmarks).toContain("writeMemory");
  });

  /**
   * First run may offer the tour. A RETURN visit must not: a tour that reopens
   * itself is an obstruction with a friendly voice.
   */
  it("never reopens itself once the seeker has moved past the first mark", () => {
    expect(coachmarks).toMatch(/if \(!memory\.done && memory\.index === 0\)/);
  });

  /**
   * The highlight lives in the scope stylesheet, not the module: the attribute
   * lands on an arbitrary element, and a CSS module rejects a selector with no
   * local class. An OUTLINE, because forced-colours mode discards backgrounds.
   */
  it("highlights with an outline, so the mark survives forced-colours mode", () => {
    const scopeCss = read("styles/seeker-os.css");
    expect(scopeCss).toContain('[data-coachmark="active"]');
    expect(scopeCss).toMatch(/\[data-coachmark="active"\]\s*\{[^}]*outline:/);
    expect(coachmarks).toContain('setAttribute("data-coachmark", "active")');
  });
});

// ── 2. The coachmarks point at real controls ──────────────────────────────

describe("the three coachmarks", () => {
  it("are three, and are the ones the brief names", () => {
    expect(SEEKER_COACHMARKS).toHaveLength(3);
    expect(SEEKER_COACHMARKS.map((mark) => mark.id)).toEqual([
      "modes",
      "saved",
      "profile",
    ]);
  });

  it("each carry a target, a title, a body, and a fallback location", () => {
    for (const mark of SEEKER_COACHMARKS) {
      expect(mark.targetId, mark.id).toBeTruthy();
      expect(mark.title.length, mark.id).toBeGreaterThan(3);
      expect(mark.body.length, mark.id).toBeGreaterThan(40);
      expect(mark.whereItLives.length, mark.id).toBeGreaterThan(10);
    }
  });

  /**
   * The anchor has to exist in the source that renders it, or the tour points
   * at nothing and silently docks to the corner forever.
   */
  it.each(SEEKER_COACHMARKS.map((mark) => [mark.id, mark.targetId]))(
    "%s anchors to %s, which a real surface renders",
    (_id, targetId) => {
      const surfaces = [shell, dashboard].join("\n");
      expect(surfaces).toContain(`"${targetId}"`);
    },
  );
});

// ── 3. The dashboard is its own destination ───────────────────────────────

describe("the seeker dashboard", () => {
  it("lives at /home and is no longer a redirect", () => {
    expect(homePage).toContain("SeekerDashboard");
    expect(homePage).not.toContain('redirect("/profile")');
  });

  /**
   * The defect: /seek rendered the dashboard above its own results, so the
   * marketplace's search surface opened on a welcome banner.
   */
  it("is NOT rendered on /seek", () => {
    expect(seekPage).not.toContain("SeekerDashboard");
  });

  it("links to Seek, Swipe and Map rather than embedding any of them", () => {
    expect(dashboard).toContain("DISCOVERY_MODES");
    for (const href of ["/seek", "/swipe", "/map"]) {
      expect(dashboard).toContain(`href: "${href}"`);
    }
    // An embed is one refactor away from becoming the page; a link is not.
    for (const embed of ["<SeekBrowser", "<SwipeDeck", "<MapView", "MapViewLazy"]) {
      expect(dashboard).not.toContain(embed);
    }
  });

  it("shows counts from the seeker's own rows, not from fixtures", () => {
    expect(homePage).toContain("getSeasonBoard");
    expect(seasonData).toContain("getSeekerStatus");
    expect(seasonData).toContain("getConversations");
    expect(homePage).not.toMatch(/FIXTURE|SEEKER_STATUS\b/);
  });

  /**
   * getUnreadMessageCount resolves a HOST profile, so for a seeker it returns 0
   * every time — which reads as "you're all caught up". The dashboard counts
   * threads and says "Conversations" rather than claiming an unread state
   * nobody can currently compute.
   */
  it("does not present a host-scoped unread count as the seeker's", () => {
    expect(stripComments(homePage)).not.toContain("getUnreadMessageCount");
    expect(dashboard).toContain("Conversations");
  });

  it("degrades one failing read without blanking the others", () => {
    // The seam the page calls settles every axis independently.
    expect(homePage).toContain("getSeasonBoard");
    expect(seasonData).toContain("Promise.allSettled");
  });
});

// ── 4. The mobile dock (D17) ──────────────────────────────────────────────

describe("the seeker mobile dock", () => {
  const dockBlock = shell.slice(
    shell.indexOf("const MOBILE_PRIMARY"),
    shell.indexOf("export interface SeekerShellProps"),
  );

  it("carries Explore · Swipe · Saved · Applications · Profile", () => {
    for (const label of ["Explore", "Swipe", "Saved", "Applications", "Profile"]) {
      expect(dockBlock).toContain(`"${label}"`);
    }
  });

  it("has exactly five tabs, and the stylesheet lays out five columns", () => {
    const hrefs = dockBlock.match(/href: "\/[a-z]+"/g) ?? [];
    expect(hrefs).toHaveLength(5);
    expect(read("styles/seeker-os.css")).toContain(
      "grid-template-columns: repeat(5, 1fr)",
    );
  });

  /**
   * Map left the dock. It must not have left the product: the rail/drawer
   * carries it (no hideInDrawer flag), and /seek offers an explicit map view.
   */
  it("keeps Map reachable from the menu and from Seek", () => {
    expect(dockBlock).not.toContain('href: "/map"');
    expect(shell).toContain('{ href: "/map", label: "Map", icon: "nav.map" }');
    expect(read("components/seeker/SeekBrowser.tsx")).toContain("Map view");
  });

  it("still renders the role pill (D17)", () => {
    expect(shell).toContain("<RolePill");
  });
});

// ── 5. The seeker discovery events ────────────────────────────────────────

describe("the seeker discovery events", () => {
  const analytics = read("lib/analytics.ts");

  it.each([
    "listing_card_opened",
    "listing_saved",
    "listing_skipped",
    "swipe_undo",
    "map_region_searched",
    "saved_search_created",
  ])("defines %s", (event) => {
    expect(analytics).toContain(`"${event}"`);
  });

  it.each([
    ["listingCardOpened", "components/discovery/useListingCardPopups.tsx"],
    ["listingSaved", "components/seeker/SwipeDeck.tsx"],
    ["listingSkipped", "components/seeker/SwipeDeck.tsx"],
    ["swipeUndo", "components/seeker/SwipeDeck.tsx"],
    ["mapRegionSearched", "components/map/MapView.tsx"],
    ["savedSearchCreated", "components/seeker/SavedSearches.tsx"],
  ])("fires %s from %s", (event, file) => {
    expect(read(file)).toContain(event);
  });

  /**
   * A signed-in seeker panning around where they live would otherwise emit
   * their home location to an analytics vendor one viewport at a time.
   */
  it("sends no map coordinates — zoom only", () => {
    const map = stripComments(read("components/map/MapView.tsx"));
    const start = map.indexOf("mapRegionSearched");
    // The event's property bag, and nothing after it.
    const call = map.slice(start, map.indexOf("});", start));
    expect(call).toContain("zoom");
    expect(call).not.toMatch(/lat|lng|lon|bounds|north|south|east|west/);
  });
});

// ── 6. The swipe deck is never gesture-only ───────────────────────────────

describe("the swipe deck", () => {
  const deck = read("components/seeker/SwipeDeck.tsx");
  const deckCss = read("components/seeker/SwipeDeck.module.css");

  it("binds arrows, Enter and Backspace", () => {
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "Backspace", "Enter"]) {
      expect(deck).toContain(`case "${key}"`);
    }
  });

  /**
   * Enter is the key a keyboard user presses to "look at this". Wiring it to
   * Apply would turn a reflex into an application.
   */
  it("makes Enter OPEN rather than apply", () => {
    const enterBlock = deck.slice(deck.indexOf('case "Enter"'), deck.indexOf('case "Enter"') + 160);
    expect(enterBlock).toContain("router.push");
    expect(enterBlock).not.toContain("triggerLeave");
  });

  /**
   * The flanking arrows only exist at (min-width: 768px) and (pointer: fine).
   * Everywhere else Skip and Save had no visible control at all.
   */
  it("gives touch users visible Skip and Save buttons", () => {
    expect(deck).toContain("touchOnly");
    expect(deckCss).toContain(".touchOnly");
    expect(deckCss).toMatch(
      /@media \(min-width: 768px\) and \(pointer: fine\) \{\s*\.touchOnly \{\s*display: none;/,
    );
  });

  it("keeps Undo, and reports it", () => {
    expect(deck).toContain("unpassListingAction");
    expect(deck).toContain("swipeUndo");
  });
});

// ── 7. The map's location-precision disclosure (074) ──────────────────────

describe("the map", () => {
  const map = read("components/map/MapView.tsx");

  it("says a pin is a host-chosen place, not a street address", () => {
    expect(map).toContain("precisionNote");
    // JSX wraps the sentence across lines; collapse whitespace before matching.
    const flat = map.replace(/\s+/g, " ");
    expect(flat).toContain("Pins show the place each host chose to publish");
    expect(flat).toContain("an area, not a street address");
    expect(flat).toContain("Confirm the exact address with the host");
  });

  it("groups co-located pins and syncs the result list to the viewport", () => {
    expect(map).toContain("groupMarkers");
    expect(map).toContain("inViewport");
    expect(map).toContain("trayListings");
  });

  it("keeps its honest failure and empty states", () => {
    expect(map).toContain("Map unavailable");
    expect(map).toContain("No mapped opportunities");
  });
});
