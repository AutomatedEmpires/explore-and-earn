import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design audit 3 (#155, D3-4): 12 px is retired for UI text. Labels, counts, initials and caps
 * use 14 px at least (`text-14/bold-caps`, `text-14/extrabold`). The token stays in tokens.css
 * for non-UI text, but no shared component may use it.
 */
const uiDir = path.join(import.meta.dirname, '..');
const sources = ['components', 'patterns'].flatMap((dir) =>
  readdirSync(path.join(uiDir, dir))
    .filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))
    .map((name) => ({
      file: `${dir}/${name}`,
      source: readFileSync(path.join(uiDir, dir, name), 'utf8'),
    })),
);

describe('UI text is at least 14 px (#155 D3-4)', () => {
  it('scans the shared components', () => {
    expect(sources.map((s) => s.file)).toEqual(
      expect.arrayContaining(['components/Badge.tsx', 'components/Chip.tsx']),
    );
  });

  it.each(sources)('$file has no text-12 class', ({ source }) => {
    expect(source).not.toMatch(/\btext-12\b/);
  });
});
