import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * D22 surface system: the type scale, the radius hierarchy, and the canvas
 * alias.
 *
 * These are BAND requirements, not exact values — the founder brief asks for
 * "page titles 32–40 desktop", not "36px". So the test evaluates each token's
 * clamp() at representative widths and asserts the band, which leaves room to
 * tune the curve without rewriting the test, while still failing loudly if a
 * later edit quietly drops a page title back to list-item size.
 *
 * Why this can regress silently: every one of these tokens is consumed through
 * var() by dozens of stylesheets, so a bad value produces a page that renders
 * perfectly and just looks flat. There is nothing to throw.
 */

const css = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");

/** The declared value of a token in the light `:root` block. */
function tokenValue(name: string): string {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css);
  expect(match, `${name} is not declared in tokens.css`).not.toBeNull();
  return match![1].trim();
}

/**
 * Resolve a `clamp(min, preferred, max)` (or a plain px value) at a viewport
 * width, mirroring how the browser computes it. Supports the `vw` unit, which
 * is the only relative unit this scale uses.
 */
function px(value: string, viewportWidth: number): number {
  const unit = (raw: string): number => {
    const text = raw.trim();
    if (text.endsWith("vw")) return (Number.parseFloat(text) / 100) * viewportWidth;
    return Number.parseFloat(text);
  };
  const clamp = /^clamp\(([^,]+),([^,]+),([^)]+)\)$/.exec(value);
  if (!clamp) return unit(value);
  const [min, preferred, max] = [unit(clamp[1]), unit(clamp[2]), unit(clamp[3])];
  return Math.min(Math.max(preferred, min), max);
}

const PHONE = 390;
const DESKTOP = 1440;

describe("type scale (D22)", () => {
  it.each([
    // token,                 desktop min, desktop max
    ["--type-page-size", 32, 40],
    ["--type-section-size", 24, 30],
    ["--type-card-size", 18, 22],
    ["--type-metric-size", 30, 48],
    ["--type-display-hero", 56, 72],
  ])("%s lands in its %s–%spx desktop band", (token, low, high) => {
    const size = px(tokenValue(token as string), DESKTOP);
    expect(size, `${token} computes to ${size}px at ${DESKTOP}px`).toBeGreaterThanOrEqual(
      low as number,
    );
    expect(size).toBeLessThanOrEqual(high as number);
  });

  /**
   * The scale grows with the viewport; it must not grow on a phone, where the
   * old values were already at the edge of the column. Every raised step keeps
   * its pre-V2 size (or smaller) at 390px.
   */
  it.each([
    ["--type-page-size", 26],
    ["--type-section-size", 22],
    ["--type-card-size", 20],
    ["--type-display-size", 30],
  ])("%s does not exceed its pre-V2 size on a phone", (token, before) => {
    expect(px(tokenValue(token as string), PHONE)).toBeLessThanOrEqual(before as number);
  });

  it("keeps the page title above the section title, and section above card", () => {
    const page = px(tokenValue("--type-page-size"), DESKTOP);
    const section = px(tokenValue("--type-section-size"), DESKTOP);
    const card = px(tokenValue("--type-card-size"), DESKTOP);
    expect(page).toBeGreaterThan(section);
    expect(section).toBeGreaterThan(card);
  });

  it("ships a tabular-numerals utility for metrics and prices", () => {
    const primitives = readFileSync(
      new URL("../../styles/primitives.css", import.meta.url),
      "utf8",
    );
    expect(primitives).toContain(".ui-tabular");
    expect(primitives).toContain("font-variant-numeric: tabular-nums");
  });
});

describe("radius hierarchy (D22)", () => {
  const radius = (name: string) => Number.parseFloat(tokenValue(name));

  it.each([
    ["--radius-control", 8, 12],
    ["--radius-input", 8, 12],
    ["--radius-button", 8, 12],
    ["--radius-cell", 8, 14],
    ["--radius-image", 14, 18],
    ["--radius-card", 14, 18],
    ["--radius-feature", 20, 24],
    ["--radius-modal", 20, 24],
  ])("%s sits in the %s–%spx tier", (token, low, high) => {
    const value = radius(token as string);
    expect(value, `${token} is ${value}px`).toBeGreaterThanOrEqual(low as number);
    expect(value).toBeLessThanOrEqual(high as number);
  });

  it("ranks controls below cards below feature surfaces", () => {
    expect(radius("--radius-button")).toBeLessThan(radius("--radius-card"));
    expect(radius("--radius-card")).toBeLessThan(radius("--radius-modal"));
  });
});

describe("surface aliases (D22)", () => {
  it("names the page canvas, and keeps --color-paper pointing at the same value", () => {
    expect(tokenValue("--color-canvas")).toBe("var(--palette-paper)");
    expect(tokenValue("--color-paper")).toBe("var(--palette-paper)");
  });

  /**
   * The whole point of the re-value is that the page stopped being pale blue.
   * A warm off-white has red >= green >= blue; the retired canvas was the
   * opposite (blue >= green >= red). Assert the direction rather than the exact
   * hex so the shade can be tuned without touching this test.
   */
  it("makes the canvas WARM, not the retired cool ice-white", () => {
    const canvas = tokenValue("--palette-paper");
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(canvas.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("keeps the action colour and the demoted info blue as different hues", () => {
    expect(tokenValue("--palette-sky")).not.toBe(tokenValue("--palette-info"));
    expect(tokenValue("--color-cta")).toBe("var(--palette-sky)");
  });
});
