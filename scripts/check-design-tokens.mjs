#!/usr/bin/env node
// `pnpm check:tokens`: outside the design system there are no raw colors and no arbitrary
// Tailwind values. Screens use src/ui components and token classes only (spec section 1).
//
// Usage: node scripts/check-design-tokens.mjs [files...]
// With no arguments it scans src/**/*.{ts,tsx,css}, except src/ui/** and src/app/globals.css.
// Prints `path:line: message` for each problem and exits 1 if there are any.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const EXCLUDED_DIRS = [path.join('src', 'ui')];
const EXCLUDED_FILES = [path.join('src', 'app', 'globals.css')];

const RULES = [
  {
    // #rgb, #rgba, #rrggbb, #rrggbbaa; not HTML entities (&#123;) or identifiers.
    pattern: /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
    message: (m) => `raw color "${m}" (use a design token)`,
  },
  {
    pattern: /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi,
    message: (m) => `raw color function "${m}" (use a design token)`,
  },
  {
    // Tailwind arbitrary values such as text-[#fff], w-[13px], grid-cols-[1fr_2fr]. Only right
    // after a letter or digit, so regexes like /[0-9a-f]{8}-[0-9a-f]{4}/ don't count.
    pattern: /(?<=[a-zA-Z0-9])-\[/g,
    message: () => 'arbitrary Tailwind value "-[...]" (add a token to src/ui instead)',
  },
];

/** Blanks out comments, keeping line breaks so line numbers stay right. */
function stripComments(source) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(
      /(^|[^:\\])\/\/[^\n]*/g,
      (match, before) => before + blank(match.slice(before.length)),
    );
}

function isExcluded(rel) {
  return (
    EXCLUDED_FILES.includes(rel) ||
    EXCLUDED_DIRS.some((dir) => rel === dir || rel.startsWith(dir + path.sep))
  );
}

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function check(file) {
  const problems = [];
  const lines = stripComments(readFileSync(file, 'utf8')).split('\n');
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        problems.push(`${path.relative(root, file)}:${index + 1}: ${rule.message(match[0])}`);
      }
    }
  });
  return problems;
}

const args = process.argv.slice(2);
const files = args.length > 0 ? args.map((f) => path.resolve(f)) : walk(path.join(root, 'src'), []);

const problems = [];
for (const file of files) {
  if (!statSync(file).isFile()) continue;
  problems.push(...check(file));
}

if (problems.length > 0) {
  console.log(problems.join('\n'));
  console.error(`\n${problems.length} design token problem(s).`);
  process.exit(1);
}
