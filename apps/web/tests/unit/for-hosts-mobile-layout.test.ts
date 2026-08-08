import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * A padded, max-width section is one `box-sizing` away from being wider than a
 * phone: the gutter is added OUTSIDE the width, the section overflows, and the
 * whole page scrolls sideways. Every full-bleed container on /for-hosts and in
 * the demo workspace therefore declares it, and this test enumerates them so a
 * new section cannot be added without one.
 */

const forHosts = readFileSync(
  new URL("../../app/[locale]/for-hosts/page.module.css", import.meta.url),
  "utf8",
);

const demoChrome = readFileSync(
  new URL("../../components/demo/demoChrome.module.css", import.meta.url),
  "utf8",
);

const hostDemo = readFileSync(
  new URL(
    "../../components/demo/full-fidelity/host/HostDemo.module.css",
    import.meta.url,
  ),
  "utf8",
);

function ruleFor(stylesheet: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `${selector} rule is missing`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("for-hosts mobile layout", () => {
  it.each([
    ".hero",
    ".previewWrap",
    ".split",
    ".flows",
    ".band",
    ".analytics",
    ".pricing",
    ".compare",
    ".faq",
    ".finalCta",
    // P4 added two more full-bleed bands: the early-host programme and the
    // add-on table. Both are shared components, so the page supplies only the
    // gutter — which is exactly the shape that overflows without box-sizing.
    ".foundingWrap",
    ".addonsWrap",
  ])("keeps the padded %s container inside the viewport", (selector) => {
    expect(ruleFor(forHosts, selector)).toContain("box-sizing: border-box");
  });

  /**
   * The two shared components carry their own padding, so their own containers
   * need the same declaration — a band that is safe on /for-hosts and overflows
   * on the activation page is the same bug in a second place.
   */
  it.each([
    ["../../components/founding/founding.module.css", ".section"],
    ["../../components/founding/founding.module.css", ".rate"],
    ["../../components/pricing/addons.module.css", ".section"],
    ["../../components/pricing/addons.module.css", ".group"],
  ])("keeps the padded %s %s inside the viewport", (stylesheet, selector) => {
    const source = readFileSync(new URL(stylesheet, import.meta.url), "utf8");
    expect(ruleFor(source, selector)).toContain("box-sizing: border-box");
  });

  /** The one wide element on the page scrolls inside its own box, not the body. */
  it("scrolls the comparison table inside its own container", () => {
    const rule = ruleFor(forHosts, ".tableScroll");
    expect(rule).toContain("overflow-x: auto");
    expect(rule).toContain("box-sizing: border-box");
  });
});

describe("demo workspace mobile layout", () => {
  it.each([".banner", ".navWrap", ".nav", ".surface", ".panel"])(
    "keeps the padded %s container inside the viewport",
    (selector) => {
      expect(ruleFor(demoChrome, selector)).toContain("box-sizing: border-box");
    },
  );

  it("keeps every shared host-demo action inside the 44px tap contract", () => {
    const controls = hostDemo.match(
      /\.resetButton,\s*\.button,\s*\.buttonQuiet,\s*\.buttonDanger,\s*\.segmentedButton\s*\{([^}]*)\}/,
    );

    expect(controls, "the shared host-demo control rule is missing").not.toBeNull();
    expect(controls?.[1]).toContain("box-sizing: border-box");
    expect(controls?.[1]).toContain("min-height: var(--tap-min)");
    expect(hostDemo).not.toMatch(/\.resetButton\s*\{[^}]*min-height:\s*34px/);
  });

  it("contains the ten-day forecast in one horizontal snap strip", () => {
    const track = ruleFor(hostDemo, ".forecastGrid");
    const day = ruleFor(hostDemo, ".forecastDay");

    expect(track).toContain("display: flex");
    expect(track).toContain("overflow-x: auto");
    expect(track).toContain("overscroll-behavior-inline: contain");
    expect(track).toContain("scroll-snap-type: inline proximity");
    expect(track).toContain("contain: inline-size");
    expect(track).toContain("box-sizing: border-box");
    expect(track).not.toContain("grid-template-columns");
    expect(day).toContain("flex: 0 0 7.5rem");
    expect(day).toContain("gap: var(--space-8)");
    expect(day).toContain("padding: var(--space-12)");
    expect(day).toContain("border-radius: var(--radius-input)");
    expect(day).toContain("scroll-snap-align: start");
    expect(day).toContain("box-sizing: border-box");
  });
});
