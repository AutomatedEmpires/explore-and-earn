import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * TOKEN CONTRAST — the V2 palette re-value (D22) is checked, not eyeballed.
 *
 * tokens.css pairs backgrounds with foregrounds by naming convention
 * (`--palette-farm-bg` / `--palette-farm-fg`, `--status-error-bg` /
 * `--status-error-fg`, …). Re-valuing a primitive re-colors every surface at
 * once, which is exactly why a single careless value can make a whole class of
 * chips unreadable with nothing on screen to warn you — the chip still renders,
 * it just can't be read. This test enumerates every pair the system defines and
 * asserts WCAG 2.x AA for normal text (4.5:1) in BOTH themes.
 *
 * It parses the shipped stylesheet rather than a copy of the values, so it
 * cannot drift: change tokens.css and this test is already testing the change.
 *
 * KNOWN, PRE-EXISTING, NOT INTRODUCED HERE: `--color-cta` is overloaded — it is
 * both a button GROUND (paired with white `--color-cta-text`) and LINK TEXT on
 * the page. One value cannot satisfy both on a dark ground, so the dark theme
 * tunes it for text and the ground/white pairing is asserted in light only.
 * Splitting it into ground + ink is a design-system change owed to a later
 * phase; this note exists so the gap is recorded rather than rediscovered.
 */

const css = readFileSync(
  new URL("../../styles/tokens.css", import.meta.url),
  "utf8",
);

// Markers keep their opening brace: the stylesheet's own prose mentions both
// selectors, and matching the bare selector would slice a comment instead of a
// rule block (silently producing an EMPTY set of declarations that passes).
const DARK_SELECTOR = ':root[data-theme="dark"] {';
const DARK_END = "@media (prefers-color-scheme: dark) {";
const MEDIA_SELECTOR = ':root:not([data-theme="light"]) {';

function sliceBetween(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start, `marker not found: ${startMarker}`).toBeGreaterThan(-1);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

/** Collect `--name: value;` declarations from a region (last write wins). */
function declarations(region: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(--[a-z0-9_-]+)\s*:\s*([^;]+);/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(region)) !== null) {
    out.set(match[1], match[2].trim());
  }
  return out;
}

const lightRegion = sliceBetween(css, ":root {", DARK_SELECTOR);
const darkRegion = sliceBetween(css, DARK_SELECTOR, DARK_END);
const mediaRegion = sliceBetween(css, MEDIA_SELECTOR, "");

const light = declarations(lightRegion);
const darkOverrides = declarations(darkRegion);
const mediaOverrides = declarations(mediaRegion);
const dark = new Map([...light, ...darkOverrides]);

/** Resolve a token through `var(--x)` chains down to a literal. */
function resolve(name: string, table: Map<string, string>, depth = 0): string {
  const raw = table.get(name);
  expect(raw, `token ${name} is not defined`).toBeDefined();
  const value = (raw ?? "").trim();
  const varMatch = /^var\(\s*(--[a-z0-9-]+)\s*(?:,[^)]*)?\)$/i.exec(value);
  if (varMatch && depth < 10) return resolve(varMatch[1], table, depth + 1);
  return value;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  expect(m, `expected a 6-digit hex, got "${hex}"`).not.toBeNull();
  const int = Number.parseInt(m![1], 16);
  return (
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff)
  );
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function ratio(table: Map<string, string>, fgToken: string, bgToken: string) {
  return contrast(resolve(fgToken, table), resolve(bgToken, table));
}

/** Every bg/fg pair the token system defines, by semantic name. */
const CHIP_PAIRS = [
  "accent-farm",
  "accent-maritime",
  "accent-remote",
  "accent-seasonal",
  "accent-mix",
  "benefit-housing",
  "benefit-meals",
  "benefit-pay",
  "status-boosted",
  "status-match",
  "status-featured",
  "status-verified_host",
  "status-founding_host",
  "status-success",
  "status-warning",
  "status-error",
] as const;

const STATE_PAIRS = ["ready", "soon", "later", "urgent"] as const;

/** Text roles that must be readable on both page canvas and card surface. */
const TEXT_ON_SURFACE = [
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--color-cta",
] as const;

const AA = 4.5;

describe.each([
  ["light", light],
  ["dark", dark],
])("%s theme contrast", (themeName, table) => {
  it.each(CHIP_PAIRS)("%s chip reads at AA", (pair) => {
    const value = ratio(table, `--${pair}-fg`, `--${pair}-bg`);
    expect(
      value,
      `${themeName}: --${pair}-fg on --${pair}-bg is ${value.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it.each(STATE_PAIRS)("lifecycle state %s reads at AA", (state) => {
    const value = ratio(table, `--state-${state}-fg`, `--state-${state}-bg`);
    expect(
      value,
      `${themeName}: --state-${state}-fg on its bg is ${value.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it.each(TEXT_ON_SURFACE)("%s reads at AA on the page canvas", (token) => {
    const value = ratio(table, token, "--color-canvas");
    expect(
      value,
      `${themeName}: ${token} on --color-canvas is ${value.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it.each(TEXT_ON_SURFACE)("%s reads at AA on a card surface", (token) => {
    const value = ratio(table, token, "--color-surface");
    expect(
      value,
      `${themeName}: ${token} on --color-surface is ${value.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it("keeps the raised surface distinguishable from the card surface", () => {
    expect(resolve("--color-surface-raised", table)).not.toBe(
      resolve("--color-surface", table),
    );
  });

  it("keeps three distinct surface levels (canvas · surface · raised)", () => {
    const levels = new Set([
      resolve("--color-canvas", table),
      resolve("--color-surface", table),
      resolve("--color-surface-raised", table),
    ]);
    expect(levels.size).toBe(3);
  });
});

describe("light theme — action colour", () => {
  it("carries white button text at AA on the CTA ground", () => {
    const value = ratio(light, "--color-cta-text", "--color-cta");
    expect(value, `white on --color-cta is ${value.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA);
  });
});

describe.each([
  ["light", light],
  ["explicit dark", dark],
  ["OS dark", new Map([...light, ...mediaOverrides])],
])("%s theme — action controls", (themeName, table) => {
  it.each(["--color-action-ground", "--color-action-ground-hover"])(
    "carries action text at AA on %s",
    (ground) => {
      const value = ratio(table, "--color-action-text", ground);
      expect(
        value,
        `${themeName}: action text on ${ground} is ${value.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(AA);
    },
  );
});

/**
 * The four opt-in accent palettes (palettes.css) reskin the action colour by
 * overriding the same TIER-1 seeds this file re-valued. Their seed VALUES were
 * chosen against the old cool surfaces and were left untouched by the re-value —
 * so "they still clear AA" is a claim that has to be checked, not assumed. The
 * surfaces moved; the seeds did not.
 */
describe("accent palettes on the re-valued surfaces", () => {
  const palettesCss = readFileSync(
    new URL("../../styles/palettes.css", import.meta.url),
    "utf8",
  );

  const lightSeeds = [
    ...palettesCss.matchAll(
      /:root\[data-palette="([a-z]+)"\]\s*\{[^}]*?--palette-sky:\s*(#[0-9a-f]{6})/gi,
    ),
  ].map(([, name, hex]) => ({ name, hex }));

  const darkCtas = [
    ...palettesCss.matchAll(
      /:root\[data-theme="dark"\]\[data-palette="([a-z]+)"\]\s*\{\s*--color-cta:\s*(#[0-9a-f]{6})/gi,
    ),
  ].map(([, name, hex]) => ({ name, hex }));

  const hoverSeeds = [
    ...palettesCss.matchAll(
      /:root\[data-palette="([a-z]+)"\]\s*\{[^}]*?--palette-sky-hover:\s*(#[0-9a-f]{6})/gi,
    ),
  ].map(([, name, hex]) => ({ name, hex }));

  it("finds all four palettes to check", () => {
    expect(lightSeeds).toHaveLength(4);
    expect(hoverSeeds).toHaveLength(4);
    expect(darkCtas).toHaveLength(4);
  });

  it.each(lightSeeds)(
    "$name reads at AA as link text on the warm canvas and surface",
    ({ hex }) => {
      expect(contrast(hex, resolve("--color-canvas", light))).toBeGreaterThanOrEqual(AA);
      expect(contrast(hex, resolve("--color-surface", light))).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each(lightSeeds)("$name carries white button text at AA", ({ hex }) => {
    expect(contrast(resolve("--color-cta-text", light), hex)).toBeGreaterThanOrEqual(AA);
  });

  it.each(hoverSeeds)("$name hover carries white button text at AA", ({ hex }) => {
    expect(contrast(resolve("--color-action-text", light), hex)).toBeGreaterThanOrEqual(AA);
  });

  it.each(darkCtas)("$name reads at AA on the warm-dark surfaces", ({ hex }) => {
    expect(contrast(hex, resolve("--color-canvas", dark))).toBeGreaterThanOrEqual(AA);
    expect(contrast(hex, resolve("--color-surface", dark))).toBeGreaterThanOrEqual(AA);
  });
});

describe("theme block parity", () => {
  /**
   * The dark values are declared TWICE on purpose (explicit toggle + OS
   * preference with no JS). Nothing enforced that the two copies agree, so a
   * one-line edit to the toggle block could silently leave OS-dark users on the
   * old palette. Compare them declaration by declaration.
   */
  it("declares identical values in the toggle block and the media block", () => {
    for (const [name, value] of darkOverrides) {
      expect(mediaOverrides.get(name), `--${name} differs between the two dark blocks`).toBe(value);
    }
    expect([...mediaOverrides.keys()].sort()).toEqual([...darkOverrides.keys()].sort());
  });
});
