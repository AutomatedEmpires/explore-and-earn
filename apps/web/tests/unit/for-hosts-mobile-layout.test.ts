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
  ])("keeps the padded %s container inside the viewport", (selector) => {
    expect(ruleFor(forHosts, selector)).toContain("box-sizing: border-box");
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
});
