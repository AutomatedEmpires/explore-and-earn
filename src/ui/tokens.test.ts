import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import {
  categories,
  colorTokenNames,
  colors,
  radii,
  shadowNames,
  themes,
  tokenPairs,
  tokenVar,
  typeScale,
} from './tokens';

const css = readFileSync(path.join(import.meta.dirname, 'tokens.css'), 'utf8');

/** The body of the first `{ ... }` block that follows `selector`, without nested blocks. */
function block(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start === -1) throw new Error(`selector not found in tokens.css: ${selector}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') depth--;
    if (depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`unclosed block: ${selector}`);
}

/** `--ee-<name>: #hex;` declarations in a block, upper-cased hex. */
function hexVars(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [, name, hex] of body.matchAll(/--ee-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (name && hex) out[name] = hex.toUpperCase();
  }
  return out;
}

function requiredHex(vars: Record<string, string>, name: string): string {
  const value = vars[name];
  if (!value) throw new Error(`missing --ee-${name} in tokens.css`);
  return value;
}

/** Linear sRGB channels, the input to OKLab. */
function linearSrgb(hex: string): [number, number, number] {
  const digits = /^#([0-9A-F]{6})$/.exec(hex)?.[1];
  if (!digits) throw new Error(`expected #RRGGBB, got ${hex}`);
  return [0, 2, 4].map((offset) => {
    const channel = parseInt(digits.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

/**
 * OKLab hue in degrees (0–360). The category palette's hue gaps were measured in this space:
 * the approved solids are all at least ~24° from the nearest status hue.
 */
function okLabHue(hex: string): number {
  const [r, g, b] = linearSrgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const labB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(labB, a) * 180) / Math.PI;
  return hue < 0 ? hue + 360 : hue;
}

/** Shortest distance between two OKLab hues, in degrees (0–180). */
function hueDistance(a: string, b: string): number {
  const gap = Math.abs(okLabHue(a) - okLabHue(b));
  return Math.min(gap, 360 - gap);
}

/**
 * A category solid closer than this to success, warning, danger or focus reads as that
 * status. The retired palette was inside 14°; the approved one is past 23°.
 */
const MIN_STATUS_HUE_GAP = 20;

describe('contrastRatio', () => {
  it('is 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('is 1:1 for a color on itself and symmetric in its arguments', () => {
    expect(contrastRatio('#6B675F', '#6B675F')).toBeCloseTo(1, 5);
    expect(contrastRatio('#1C1B19', '#FBFAF7')).toBeCloseTo(
      contrastRatio('#FBFAF7', '#1C1B19'),
      10,
    );
  });

  it('accepts lower-case and 3-digit hex', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 2);
  });

  it('rejects anything that is not a hex color', () => {
    expect(() => contrastRatio('red', '#FFFFFF')).toThrow(/hex/);
  });
});

describe('tokenPairs', () => {
  it.each(tokenPairs)('$name meets $min:1', ({ fg, bg, min }) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it('covers every required pair in both themes', () => {
    const names = new Set(tokenPairs.map((p) => p.name));
    for (const theme of themes) {
      for (const fg of ['ink', 'ink-2', 'muted']) {
        for (const bg of ['bg', 'surface', 'surface-2']) {
          expect(names).toContain(`${theme}: ${fg} on ${bg}`);
        }
      }
      expect(names).toContain(`${theme}: on-primary on primary`);
      expect(names).toContain(`${theme}: success on success-bg`);
      for (const c of categories) {
        expect(names).toContain(`${theme}: ${c}-fg on ${c}-bg`);
        expect(names).toContain(`${theme}: ${c}-solid on surface`);
      }
    }
  });

  it('uses 4.5:1 for text pairs and 3:1 for category solids', () => {
    for (const p of tokenPairs) {
      if (/-solid on /.test(p.name)) expect(p.min).toBe(3);
      if (/: (ink|ink-2|muted|on-primary|success) on /.test(p.name)) expect(p.min).toBe(4.5);
    }
  });
});

describe('category palette', () => {
  const themes = [
    ['light', "[data-theme='light'] {"],
    ['dark', "[data-theme='dark'] {"],
  ] as const;
  const status = ['success', 'warning', 'danger', 'focus'] as const;

  it.each(themes)(
    '%s: fg on bg is 4.5:1, solids are 3:1, and solids stay off status hues',
    (_theme, selector) => {
      const vars = hexVars(block(css, selector));
      const card = requiredHex(vars, 'surface');
      const page = requiredHex(vars, 'bg');
      for (const category of categories) {
        const fg = requiredHex(vars, `${category}-fg`);
        const tint = requiredHex(vars, `${category}-bg`);
        const solid = requiredHex(vars, `${category}-solid`);
        expect(contrastRatio(fg, tint)).toBeGreaterThanOrEqual(4.5);
        for (const markBg of [card, page, tint]) {
          expect(contrastRatio(solid, markBg)).toBeGreaterThanOrEqual(3);
        }
        for (const name of status) {
          expect(hueDistance(solid, requiredHex(vars, name))).toBeGreaterThanOrEqual(
            MIN_STATUS_HUE_GAP,
          );
        }
      }
    },
  );
});

describe('light tokens', () => {
  it('match the design board', () => {
    expect(colors.light).toMatchObject({
      bg: '#FBFAF7',
      surface: '#FFFFFF',
      ink: '#1C1B19',
      'ink-2': '#4A4740',
      muted: '#6B675F',
      line: '#E6E1D8',
      primary: '#1C1B19',
      success: '#1F6B43',
      'success-bg': '#E3F1E8',
      'maritime-fg': '#003949',
      'maritime-bg': '#DBF3FC',
      'maritime-solid': '#0E7490',
      'seasonal-fg': '#4B4300',
      'seasonal-bg': '#F4EEB8',
      'seasonal-solid': '#A08318',
      'farm-fg': '#354316',
      'farm-bg': '#EAF8D4',
      'farm-solid': '#74915E',
      'remote-fg': '#41094C',
      'remote-bg': '#FBECFE',
      'remote-solid': '#652A72',
    });
  });
});

describe('tokens.css', () => {
  it('declares every light token on :root and data-theme="light" with the tokens.ts values', () => {
    expect(css).toMatch(/:root,\s*\[data-theme='light'\] \{/);
    expect(hexVars(block(css, "[data-theme='light'] {"))).toEqual(colors.light);
  });

  it('declares the dark tokens for prefers-color-scheme unless data-theme="light"', () => {
    const media = block(css, '@media (prefers-color-scheme: dark)');
    expect(media).toContain(":root:not([data-theme='light'])");
    expect(hexVars(block(css, ":root:not([data-theme='light']) {"))).toEqual(colors.dark);
  });

  it('declares the dark tokens for data-theme="dark" (on <html> or any subtree)', () => {
    expect(hexVars(block(css, "[data-theme='dark'] {"))).toEqual(colors.dark);
  });

  it('maps every color token into the Tailwind theme', () => {
    const theme = block(css, '@theme inline {');
    for (const name of colorTokenNames) {
      expect(theme).toContain(`--color-${name}: var(--ee-${name});`);
    }
  });

  it('defines the type scale, radii and shadows', () => {
    const theme = block(css, '@theme {');
    for (const size of typeScale) {
      expect(theme).toContain(`--text-${size}: ${size / 16}rem;`);
      expect(theme).toMatch(new RegExp(`--text-${size}--line-height: [0-9.]+rem;`));
    }
    for (const [name, px] of Object.entries(radii)) {
      expect(theme).toContain(`--radius-${name}: ${px / 16}rem;`);
    }
    const inline = block(css, '@theme inline {');
    for (const name of shadowNames) {
      expect(inline).toContain(`--shadow-${name}: var(--ee-shadow-${name});`);
    }
  });

  it('defines pb-safe, which pads a bottom-pinned bar by the safe-area inset', () => {
    expect(block(css, '@utility pb-safe {').trim()).toBe(
      'padding-bottom: env(safe-area-inset-bottom);',
    );
  });

  it('only uses colors defined in tokens.ts', () => {
    expect(new Set(Object.keys(colors.light))).toEqual(new Set(colorTokenNames));
    expect(new Set(Object.keys(colors.dark))).toEqual(new Set(colorTokenNames));
  });
});

describe('tokenVar', () => {
  it('returns the CSS variable for a token', () => {
    expect(tokenVar('maritime-solid')).toBe('var(--ee-maritime-solid)');
  });
});
