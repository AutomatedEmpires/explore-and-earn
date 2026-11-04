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
      'maritime-fg': '#1A4F9C',
      'maritime-bg': '#E6EEFA',
      'maritime-solid': '#1D5FBF',
      'seasonal-fg': '#8F4E06',
      'seasonal-bg': '#FBEEDD',
      'seasonal-solid': '#B45F06',
      'farm-fg': '#24622E',
      'farm-bg': '#E5F2E6',
      'farm-solid': '#2F7D3B',
      'remote-fg': '#A12C23',
      'remote-bg': '#FBE7E5',
      'remote-solid': '#C8382E',
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
