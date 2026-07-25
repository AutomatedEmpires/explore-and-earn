import { afterEach, describe, expect, it, vi } from "vitest";

import type { FeaturedEmployer } from "../../components/home/home-data";

/**
 * A house card must never wear a paid label (readiness audit 2026-07-24).
 *
 * The defect this pins: the empty-marketplace fallback shipped as
 * `label: "Featured Host"` — the same label real featured-employer campaigns
 * get, rendered with the paid featured tone. Production has zero listings and
 * zero paying hosts, so the live homepage advertised a "Featured Host" that did
 * not exist, under a "Hiring now" kicker. Verified against production before
 * the fix: "Featured Host" appeared twice on exploreandearn.com beside the
 * onboarding copy. Same class as an unearned Verified badge — a paid trust
 * signal on something nobody bought.
 *
 * The source comment claimed the fallback was "a neutral host invitation" while
 * doing the opposite, which is why these assert the emitted LABEL rather than
 * trusting the description.
 *
 * NOTE ON ENV: home-data computes `IS_PREVIEW` at module load from NODE_ENV,
 * and under vitest that is "test" — so a naive import exercises the PREVIEW
 * branch (interleaved demo cards) and never reaches the production fallback at
 * all. Each production assertion therefore stubs NODE_ENV and re-imports.
 */

async function loadIn(nodeEnv: "production" | "test") {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", nodeEnv);
  return import("../../components/home/home-data");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Fully typed — no `as` cast. The cast previously hid two missing required
 * fields (listingCount, verified), which meant a future buildAnnouncements that
 * started reading them would compile fine here and only fail in production.
 * (Raised by Copilot on PR 277.)
 */
function employer(overrides: Partial<FeaturedEmployer> = {}): FeaturedEmployer {
  return {
    listingId: "l1",
    hostId: "h1",
    hostName: "Cascade Bloom Orchards",
    location: "Wenatchee, WA",
    listingCount: 1,
    verified: false,
    category: "farm",
    ...overrides,
  };
}

// Each test re-imports the module graph after resetModules(); the first cold
// transform comfortably exceeds vitest's 5s default, so give the suite headroom.
describe("announcement rail labels (production behaviour)", { timeout: 30_000 }, () => {
  it("labels the empty-marketplace fallback as the house, not a paid placement", async () => {
    const m = await loadIn("production");
    const items = m.buildAnnouncements([]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe(m.HOUSE_ANNOUNCEMENT_LABEL);
  });

  it("NEVER gives the fallback a paid label", async () => {
    const m = await loadIn("production");
    const [fallback] = m.buildAnnouncements([]);
    for (const paid of m.PAID_ANNOUNCEMENT_LABELS) {
      expect(fallback.label).not.toBe(paid);
    }
  });

  it("stops claiming activity it cannot evidence", async () => {
    const m = await loadIn("production");
    const [fallback] = m.buildAnnouncements([]);
    // "Hosts are onboarding now" asserted movement on an empty marketplace.
    expect(fallback.text).not.toMatch(/onboarding now/i);
  });

  it("a REAL featured employer still gets the paid label", async () => {
    const m = await loadIn("production");
    const items = m.buildAnnouncements([employer()]);
    expect(items[0].label).toBe("Featured Host");
    expect(items[0].text).toContain("Cascade Bloom Orchards");
  });

  /**
   * The negative control: the house label may only appear when there is no real
   * inventory. It must never pad a thin rail and make it look fuller.
   */
  it("house label NEVER appears alongside real featured employers", async () => {
    const m = await loadIn("production");
    for (const count of [1, 2, 3, 4, 5]) {
      const employers = Array.from({ length: count }, (_, i) =>
        employer({ listingId: `l${i}`, hostName: `Host ${i}` }),
      );
      const items = m.buildAnnouncements(employers);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.label).not.toBe(m.HOUSE_ANNOUNCEMENT_LABEL);
      }
    }
  });
});

describe("preview keeps the demo taxonomy", { timeout: 30_000 }, () => {
  it("still interleaves demo cards outside production", async () => {
    const m = await loadIn("test");
    const items = m.buildAnnouncements([]);
    // Demo data is prod-gated; losing it would quietly gut the preview surface.
    expect(items.length).toBeGreaterThan(1);
    expect(items.some((a) => a.label === "Boosted")).toBe(true);
  });
});
