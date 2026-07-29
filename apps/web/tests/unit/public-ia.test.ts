import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { PUBLIC_IA_EVENTS } from "../../lib/analytics";
import { SITE_PHOTOS, findSitePhoto } from "../../lib/sitePhotos";
import { HOME_HERO_ROTATION, LANE_PHOTO } from "../../components/home/home-data";

/**
 * V2 D18 + §16 — the two-door public IA, the seeker gateway, and the
 * photography-led homepage.
 *
 * These are SOURCE PINS on facts that regress silently. None of them throws at
 * runtime when broken: a nav that quietly regrows a link, a hero that quietly
 * goes back to a gradient, and a marketing page that quietly acquires a
 * fabricated count all render perfectly.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

/** Source with comments removed — this repo explains its refusals in prose. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

// ─── Header ────────────────────────────────────────────────────────────────

describe("the signed-out header is two doors", () => {
  const header = read("components/global/GlobalHeader.tsx");
  const body = code(header);
  const messages = JSON.parse(read("messages/en.json")) as {
    Nav: Record<string, string>;
  };

  it("ships the labels D18 names", () => {
    expect(messages.Nav.forSeekers).toBe("For Seekers");
    expect(messages.Nav.forHosts).toBe("For Hosts");
    expect(messages.Nav.signIn).toBe("Sign in");
    expect(messages.Nav.getStarted).toBe("Get started");
  });

  it("renders both door menus and the two auth controls", () => {
    expect(body).toContain('items={SEEKER_MENU}');
    expect(body).toContain('items={HOST_MENU}');
    expect(body).toContain('t("forSeekers")');
    expect(body).toContain('t("forHosts")');
    expect(body).toContain('t("signIn")');
    expect(body).toContain('t("getStarted")');
  });

  /**
   * COMMUNITY LEAVES THE TOP LEVEL when signed out. It is an authenticated
   * seeker space now, so a top-level entry advertises a room this visitor
   * cannot walk into. It lives one level down, inside the seeker menu.
   */
  it("keeps Community out of the signed-out top level and inside the seeker menu", () => {
    const seekerMenu = body.slice(
      body.indexOf("const SEEKER_MENU"),
      body.indexOf("const HOST_MENU"),
    );
    expect(seekerMenu).toContain('href: "/community"');

    const navStart = body.indexOf("<NavMenu");
    expect(navStart, "the signed-out door menus are gone").toBeGreaterThan(-1);
    const signedOutNav = body.slice(navStart, body.indexOf("</nav>", navStart));
    expect(signedOutNav).toContain('items={SEEKER_MENU}');
    expect(signedOutNav).toContain('items={HOST_MENU}');
    // The doors are menus; nothing in the signed-out bar links Community
    // directly, because a top-level entry would advertise a room this visitor
    // cannot enter.
    expect(signedOutNav).not.toContain("/community");
  });

  it("keeps the AUTHENTICATED seeker nav as Explore + Community", () => {
    const start = body.indexOf(") : isAuthenticated ? (");
    const end = body.indexOf(") : (", start + 1);
    expect(start, "the authenticated nav branch is gone").toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const authedNav = body.slice(start, end);
    // A slice this small would pass every assertion below by accident if the
    // boundaries drifted; assert it is the branch we meant to read.
    expect(authedNav).toContain("styles.sectionNav");
    expect(authedNav).toContain('t("explore")');
    expect(authedNav).toContain('t("community")');
    expect(authedNav).toContain('href="/community"');
    // …and the signed-out branch, which follows it, does NOT.
    expect(body.slice(end)).not.toContain('t("community")');
  });

  it("gives the seeker menu the five destinations D18 lists", () => {
    const seekerMenu = body.slice(
      body.indexOf("const SEEKER_MENU"),
      body.indexOf("const HOST_MENU"),
    );
    for (const href of ["/seek", "/swipe", "/map", "/community", "/for-seekers#how-it-works"]) {
      expect(seekerMenu, `seeker menu is missing ${href}`).toContain(`href: "${href}"`);
    }
  });

  it("gives the host menu its five destinations, and none of them auth-walled", () => {
    const hostMenu = body.slice(
      body.indexOf("const HOST_MENU"),
      body.indexOf("export interface GlobalHeaderProps"),
    );
    for (const href of [
      "/for-hosts",
      "/for-hosts/demo",
      "/for-hosts#plans",
      "/for-hosts#profile-title",
      "/for-hosts#faq-title",
    ]) {
      expect(hostMenu, `host menu is missing ${href}`).toContain(`href: "${href}"`);
    }
    /**
     * /host/plans is a PRIVATE dashboard segment (lib/hostRoutes), so a
     * prospect clicking "Pricing" there meets a sign-in wall before seeing a
     * number — the pay-before-you-look funnel D6/D7 removed. The public page
     * publishes the same founder-locked prices.
     */
    expect(hostMenu).not.toContain('href: "/host/plans"');
  });
});

describe("the door menus are keyboard operable", () => {
  const menu = read("components/global/NavMenu.tsx");
  const body = code(menu);

  it("reports its state to assistive tech", () => {
    expect(body).toContain('aria-haspopup="menu"');
    expect(body).toContain("aria-expanded={open}");
    expect(body).toContain('role="menu"');
    expect(body).toContain('role="menuitem"');
    expect(body).toContain("aria-label={label}");
  });

  it("opens onto an item with the arrow keys", () => {
    expect(body).toContain('if (event.key === "ArrowDown")');
    expect(body).toContain('if (event.key === "ArrowUp")');
    expect(body).toContain("openAt(0)");
    expect(body).toContain("openAt(items.length - 1)");
  });

  it("moves, wraps, and jumps within the menu", () => {
    expect(body).toContain('case "ArrowDown":');
    expect(body).toContain('case "ArrowUp":');
    expect(body).toContain('case "Home":');
    expect(body).toContain('case "End":');
    expect(body).toContain("% focusable.length");
  });

  /**
   * ESCAPE RETURNS FOCUS. Without this a keyboard user who dismisses the menu
   * is dropped at the top of the document and has to traverse the page again —
   * the one failure in this component that cannot be recovered from.
   */
  it("returns focus to the trigger on Escape, and closes on Tab", () => {
    expect(body).toContain('if (event.key === "Escape")');
    expect(body).toContain("close(true)");
    expect(body).toContain('case "Tab":');
    expect(body).toContain("if (returnFocus) triggerRef.current?.focus()");
  });

  it("closes on an outside pointer and on navigation", () => {
    expect(body).toContain('document.addEventListener("pointerdown", onPointerDown)');
    expect(body).toContain("wrapRef.current?.contains(event.target as Node)");
    expect(body).toContain("}, [pathname]);");
  });

  it("keeps the trigger as the single tab stop", () => {
    expect(body).toContain("tabIndex={-1}");
  });
});

// ─── /for-seekers gateway ──────────────────────────────────────────────────

describe("the /for-seekers gateway", () => {
  const page = read("app/[locale]/for-seekers/page.tsx");
  const body = code(page);

  it("is wrapped in the shared public chrome", () => {
    expect(read("app/[locale]/for-seekers/layout.tsx")).toContain("<PublicShell>");
  });

  it("leads with a real catalogue photograph, priority-loaded", () => {
    expect(body).toMatch(/<SitePhoto\s+slug="paddle-01"[\s\S]*?priority/);
    expect(findSitePhoto("paddle-01")).toBeDefined();
    expect(findSitePhoto("paddle-01")?.category).toBe("paddle");
  });

  it("names only slugs that exist in the catalogue", () => {
    const slugs = [...body.matchAll(/slug="([\w-]+)"/g)].map((m) => m[1]);
    const fromData = [...body.matchAll(/photo:\s*"([\w-]+)"/g)].map((m) => m[1]);
    const all = [...slugs, ...fromData];
    expect(all.length).toBeGreaterThan(3);
    for (const slug of all) {
      expect(findSitePhoto(slug), `unknown site photo slug "${slug}"`).toBeDefined();
    }
  });

  it("offers both CTAs D18 requires", () => {
    expect(body).toContain('href="/sign-up?role=seeker"');
    expect(body).toContain('href="/seek"');
    expect(body).toContain("Create a free account");
    expect(body).toContain("Browse without an account");
  });

  it("carries the how-it-works anchor the header menu links", () => {
    expect(body).toContain('id="how-it-works"');
    expect(code(read("components/global/GlobalHeader.tsx"))).toContain(
      '/for-seekers#how-it-works',
    );
  });

  it("renders the real listing card component, not a drawing of one", () => {
    expect(body).toContain("<ListingCardGrid");
    expect(body).toContain('surface="discovery_feed"');
  });

  /**
   * LABEL OR NOTHING. When the page falls back to fixture inventory it must say
   * so on the surface, in the reading order, above the cards. The alternative —
   * unlabelled example roles on a marketing page — is a fabricated listing.
   */
  it("labels example inventory as examples", () => {
    expect(body).toContain('inventory.source === "example"');
    expect(body).toContain("showingExamples ? (");
    expect(body).toContain("Example listings");
    expect(body).toContain("Nothing here is a real opening.");
  });

  it("ships an honest empty state instead of inventing inventory", () => {
    expect(body).toContain("inventory.listings.length === 0");
    expect(body).toContain("No roles listed yet.");
  });

  /**
   * NO FABRICATED NUMBERS. The founder's honesty rule, and the one a marketing
   * page breaks first. Any bare integer followed by a countable noun is a claim
   * about the marketplace that nothing on this page can evidence.
   */
  it("states no count of listings, hosts, seekers or placements", () => {
    expect(body).not.toMatch(
      /\b\d[\d,]*\+?\s+(listings?|hosts?|seekers?|jobs?|employers?|members?|placements?|users?)\b/i,
    );
  });

  it("makes no team-seat claim (D13)", () => {
    expect(body.toLowerCase()).not.toContain("team seat");
  });

  it("fires the gateway funnel events", () => {
    expect(body).toContain("PUBLIC_IA_EVENTS.roleGatewayViewed");
    expect(body).toContain("PUBLIC_IA_EVENTS.forSeekersCtaSelected");
    expect(body).toContain('properties={{ role: "seeker" }}');
  });

  it("is in the sitemap, and Community is not", () => {
    const sitemap = code(read("app/sitemap.ts"));
    expect(sitemap).toContain("/for-seekers");
    expect(sitemap).not.toContain("/community");
  });
});

// ─── Homepage v2 ───────────────────────────────────────────────────────────

describe("the homepage hero is a photograph", () => {
  const home = read("components/home/MarketplaceHome.tsx");
  const body = code(home);
  const css = read("components/home/MarketplaceHome.module.css");

  it("renders the rotation's photograph with priority and catalogue alt", () => {
    const tag = /<SitePhoto\s+slug=\{hero\.photoSlug\}[\s\S]*?\/>/.exec(body)?.[0] ?? "";
    expect(tag, "the hero photo is gone").not.toBe("");
    expect(tag).toContain("priority");
    expect(tag).toContain('size="hero"');
    // NOT decorative: the alt describes a real place, and the page is about
    // places to work in. The small lane tiles below ARE decorative, because
    // their label already carries the meaning.
    expect(tag).not.toContain("decorative");
    expect(body).toContain("decorative"); // …the tiles still are.
  });

  it("names a real catalogue slug for every rotation entry", () => {
    expect(HOME_HERO_ROTATION.length).toBeGreaterThan(1);
    for (const scene of HOME_HERO_ROTATION) {
      const photo = findSitePhoto(scene.photoSlug);
      expect(photo, `hero rotation names unknown slug "${scene.photoSlug}"`).toBeDefined();
      // The hero rendition is the one the band requests; assert it is the wide
      // one, so a card-sized asset never gets stretched across a 52rem band.
      expect(photo?.sizes.hero.width).toBeGreaterThanOrEqual(1200);
    }
  });

  it("names a real catalogue slug for every lane tile", () => {
    for (const [lane, slug] of Object.entries(LANE_PHOTO)) {
      expect(findSitePhoto(slug), `lane "${lane}" names unknown slug "${slug}"`).toBeDefined();
    }
  });

  it("keeps the lane gradient only as the pre-decode ground beneath the photo", () => {
    expect(css).toContain(".heroMedia");
    expect(css).toContain(".heroPhoto");
    // The scrim is now token-derived; the raw cool-grey rgba() is gone.
    const scrim = css.slice(css.indexOf(".heroScrim"), css.indexOf(".heroInner"));
    expect(scrim).not.toMatch(/rgba?\(/);
    expect(scrim).toContain("var(--palette-ink)");
  });

  it("shows ONE dominant message — the anthem lost its competing third line", () => {
    expect(body).toContain('t("anthemLine1")');
    expect(body).toContain('t("promise")');
    expect(body).not.toContain('t("sub")');
  });

  it("keeps the search form above the fold, inside the hero", () => {
    const hero = body.slice(body.indexOf("function HomeHero"), body.indexOf("function ThreeQuestions"));
    expect(hero).toContain('role="search"');
    expect(hero).toContain("styles.searchBar");
  });

  it("drops the floating peek card that competed with the anthem", () => {
    expect(body).not.toContain("styles.heroPeek");
    expect(body).not.toContain("peek?: DiscoveryListing");
  });
});

describe("the homepage sections", () => {
  const home = read("components/home/MarketplaceHome.tsx");
  const body = code(home);

  it("renders the V2 §16 running order", () => {
    const order = [
      "<HomeHero",
      "<ThreeQuestions",
      "<FeaturedJobs",
      "<DiscoverModes",
      "<HowItWorksSeeker",
      "<EmployerProfilePreview",
      "<CommunityValue",
      "<TrustSafety",
      "<HostCtaBand",
      "<FinalCta",
    ];
    let cursor = -1;
    for (const marker of order) {
      const index = body.indexOf(marker, cursor + 1);
      expect(index, `${marker} is missing or out of order`).toBeGreaterThan(cursor);
      cursor = index;
    }
  });

  it("shows two-to-three real opportunity cards, not six", () => {
    expect(body).toContain("listings.slice(0, 3)");
  });

  it("keeps the honest empty fallback on the opportunity row", () => {
    expect(body).toContain("No roles listed yet.");
    expect(body).toContain("shown.length === 0");
  });

  /**
   * NO FAKE MAP. The decorative .mapCanvas with terrain shapes and ink pins was
   * the only fabricated UI on this page; D5 replaced it with rows built from
   * the listings the section already receives. This holds that line.
   */
  it("keeps the Map card honest — real rows, no drawn map", () => {
    expect(body).not.toContain("mapCanvas");
    expect(body).toContain("styles.mapPreviewRow");
    expect(body).toContain("l.coordinates");
    expect(body).toContain("Locations will appear here as hosts publish.");
  });

  it("links the employer-profile preview into the host demo", () => {
    expect(body).toContain('href="/for-hosts/demo/profile"');
  });

  /**
   * THE PLAN GRID LEFT THE HOMEPAGE (D6/D7/D21). Billing was the third thing a
   * prospective host saw, and it was a second pricing surface to keep in step
   * with /for-hosts and /host/plans.
   */
  it("carries build-first host copy and no plan grid", () => {
    expect(body).toContain("Build it first. Pay when you publish.");
    expect(body).not.toContain("HOME_PLANS");
    expect(body).not.toContain("formatUsd");
    expect(body).not.toContain("styles.planCard");
  });

  it("says Community needs a sign-in rather than implying it is open", () => {
    expect(body).toContain("Sign in to open Community");
  });

  it("states no fabricated marketplace counts", () => {
    expect(body).not.toMatch(
      /\b\d[\d,]*\+?\s+(hosts?|seekers?|employers?|members?|placements?|users?)\b/i,
    );
  });
});

// ─── Analytics ─────────────────────────────────────────────────────────────

describe("the public-IA funnel events", () => {
  it("names the three events D18 asks for, in snake_case", () => {
    expect(PUBLIC_IA_EVENTS.roleGatewayViewed).toBe("role_gateway_viewed");
    expect(PUBLIC_IA_EVENTS.forSeekersCtaSelected).toBe("for_seekers_cta_selected");
    expect(PUBLIC_IA_EVENTS.communityAuthRedirected).toBe("community_auth_redirected");
    for (const name of Object.values(PUBLIC_IA_EVENTS)) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("fires community_auth_redirected only when the return path IS Community", () => {
    const signIn = code(read("app/[locale]/(auth)/sign-in/[[...sign-in]]/page.tsx"));
    expect(signIn).toContain("isCommunityPath(");
    expect(signIn).toContain("PUBLIC_IA_EVENTS.communityAuthRedirected");
    expect(signIn).toContain("cameFromCommunity ? (");
  });

  it("validates the return path on the sign-in page itself, not only in middleware", () => {
    const signIn = code(read("app/[locale]/(auth)/sign-in/[[...sign-in]]/page.tsx"));
    expect(signIn).toContain("resolveReturnPath({ returnTo, redirect_url })");
    expect(signIn).toContain("if (suppliedReturn !== undefined && !safeRedirectUrl)");
  });
});

// ─── Photography catalogue sanity ──────────────────────────────────────────

describe("the photography this phase consumes", () => {
  it("is present in the shipped catalogue", () => {
    expect(SITE_PHOTOS.length).toBeGreaterThan(0);
  });

  it("gives every photo the human-written alt text the hero and tiles rely on", () => {
    for (const photo of SITE_PHOTOS) {
      expect(photo.alt.length, `${photo.slug} has no alt text`).toBeGreaterThan(20);
    }
  });
});
