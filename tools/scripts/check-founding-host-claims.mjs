import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * check-founding-host-claims.mjs (guardrail G53) — VERSION 2.
 *
 * ─── WHAT V1 WAS, AND WHY IT WAS RIGHT ──────────────────────────────────────
 *
 * The founding-host programme was a term sheet with no code path. The contract
 * carried FOUNDING_LOCKED_PRICING and a seat cap, six live Stripe prices sat
 * dormant, and the estate promise audit of 2026-07-17 recorded it as the single
 * finding that becomes UNFIXABLE once it works: a lifetime price lock offered to
 * the first N hosts, with nothing counting a claim, no capacity, no deadline and
 * no surface. resolveStripePriceId had no founding branch at all, so a card
 * saying one number would have charged another.
 *
 * V1's answer was total prohibition: the programme's language, its contract
 * symbols, and the four promises it makes ("first N hosts", a locked rate, a
 * discount that survives a tier change, forfeiture on cancellation) were
 * FORBIDDEN anywhere in apps/web/{app,components,messages}. That was correct for
 * vaporware. A ban is not correct for a programme that exists.
 *
 * ─── WHAT V2 IS ─────────────────────────────────────────────────────────────
 *
 * Commercial redesign P4 made the programme real: migration 087 gives it a
 * singleton config row, a transactional claim function, a claim ledger and an
 * over-subscription log; six env-provisioned Stripe prices carry the discount;
 * an admin console turns it on. So the ban is replaced with a narrower rule that
 * targets what was ACTUALLY wrong — not the words, but numbers with nothing
 * behind them.
 *
 *   (a) The programme's language is allowed ONLY in the allow-listed files
 *       below: the config module, its two public components, the admin console
 *       and its action and page. Everywhere else in apps/web the v1 prohibition
 *       stands, unchanged and with the same patterns.
 *
 *   (b) An allow-listed file that renders anything QUANTITATIVE about the
 *       programme — a capacity, a claimed count, a remainder, a deadline — must
 *       read it through the config module (components/founding/program.ts). The
 *       config module is the only thing that turns the database row into a view,
 *       and it is what makes "unconfigured renders no number" a property of the
 *       system rather than of whoever wrote the page.
 *
 *   (c) No file may reference FOUNDING_SEAT_CAP. It is the contract's DEFAULT
 *       capacity, and the live capacity is whatever the founder configured;
 *       rendering the default beside a different real figure would state two
 *       numbers for one fact, and rendering it while the programme is
 *       unconfigured would be exactly the fabricated scarcity this guardrail
 *       exists to prevent. Nothing needs it: the claim path reads the row.
 *
 * The one thing that has NOT changed is the reason any of this exists. A
 * scarcity claim is the easiest lie in a product to tell by accident, and the
 * only defence that survives a refactor is a machine that can tell the
 * difference between a number and a number with evidence behind it.
 *
 * This module exports its rule so the self-test in
 * apps/web/tests/unit/founding-host-guardrail.test.ts can drive it in both
 * directions — a guardrail nobody tests is a guardrail nobody knows is running.
 */

const roots = ["apps/web/app", "apps/web/components", "apps/web/messages"];
const sourceExtensions = new Set([".json", ".ts", ".tsx"]);
const ignoredDirectories = new Set([".next", "dist", "node_modules"]);

/**
 * The surfaces the programme is allowed to exist on, created by the P4 change
 * that made it real. Paths are repo-relative and matched exactly: a new surface
 * is a deliberate edit here, reviewed alongside whatever it renders.
 */
export const ALLOWED_FOUNDING_FILES = new Set([
  // The config seam. Turns the database row into the four view states and is the
  // only place a count may come from.
  "apps/web/components/founding/program.ts",
  // The public section and its countdown.
  "apps/web/components/founding/FoundingHostSection.tsx",
  "apps/web/components/founding/FoundingCountdown.tsx",
  // The founder's switch.
  "apps/web/components/admin/FoundingProgramConsole.tsx",
  "apps/web/app/actions/foundingProgram.ts",
  "apps/web/app/[locale]/(admin)/admin/founding/page.tsx",
]);

/**
 * How an allow-listed file proves its figures come from the configured row.
 *
 * Either it goes through the config module (any import depth, or the sibling
 * form used inside components/founding), or it touches the reader / writer of
 * the row itself — the admin page and its action legitimately handle the raw
 * configuration rather than the public view. What NONE of these permits is a
 * figure that came from a literal, which is the entire failure mode: the old
 * programme's numbers lived in marketing copy with nothing behind them.
 */
const CONFIGURED_ROW_REFERENCES = [
  "founding/program",
  'from "./program"',
  "from './program'",
  "getFoundingHostProgram",
  "upsertFoundingHostProgram",
];

/** The config module itself, which IS the source those references point at. */
const PROGRAM_MODULE = "apps/web/components/founding/program.ts";

/**
 * Identifiers that mean a file is rendering a figure about the programme. A
 * file naming one of these has to have gone through the config module.
 */
const QUANTITATIVE_TOKENS = [
  /\bcapacity\b/i,
  /\bclaimed\b/i,
  /\bremaining\b/i,
  /\benrollment_?deadline\b/i,
  /\bdeadlineIso\b/,
];

const forbiddenPatterns = [
  {
    label: "unimplemented Founding Host runtime contract",
    pattern: /\b(?:FOUNDING_LOCKED_PRICING|FoundingCountdown)\b/g,
  },
  {
    label: "public Founding Host program claim",
    pattern: /\bfounding\s+(?:host|rate|pricing|program)s?\b/gi,
  },
  {
    label: "unimplemented limited-host price promise",
    pattern: /\bfirst\s+(?:\d+|\{[^}\n]+\})\s+(?:paying\s+)?hosts?\b/gi,
  },
  {
    label: "unimplemented lifetime price lock",
    pattern: /\block(?:ed|s|ing)?\b[^\n]{0,80}\b(?:rate|price|life)\b/gi,
  },
  {
    label: "unimplemented tier-change guarantee",
    pattern: /\bsurvives?\s+(?:a\s+)?tier\s+changes?\b/gi,
  },
  {
    label: "unimplemented cancellation-forfeiture term",
    pattern: /\b(?:forfeit(?:ed|s|ing)?|given\s+up)\b[^\n]{0,80}\bcancel(?:lation|led|s)?\b/gi,
  },
];

/**
 * The contract's DEFAULT seat cap. Banned outright, in allow-listed files too:
 * the live capacity is the configured one, and a default rendered beside it is a
 * second number for one fact.
 */
const SEAT_CAP_PATTERN = /\bFOUNDING_SEAT_CAP\b/g;

/**
 * Evaluate one file. Returns a list of human-readable violations.
 *
 * Pure and exported so the self-test can assert both directions without a
 * filesystem: a guardrail that is only ever run over a passing tree cannot be
 * distinguished from one that has silently stopped checking.
 *
 * @param {string} relativePath repo-relative, forward slashes
 * @param {string} content
 * @returns {string[]}
 */
export function evaluateFoundingClaims(relativePath, content) {
  const violations = [];
  const lineOf = (index) => content.slice(0, index).split("\n").length;

  // (c) applies everywhere, allow-listed or not.
  SEAT_CAP_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(SEAT_CAP_PATTERN)) {
    violations.push(
      `G53: the contract's default seat cap is not the live capacity — read the configured programme instead, in ${relativePath}:${lineOf(match.index)}`,
    );
  }

  if (ALLOWED_FOUNDING_FILES.has(relativePath)) {
    // (b) an allow-listed surface may say it, but only about real figures.
    const isProgramModule = relativePath === PROGRAM_MODULE;
    const readsConfiguredRow = CONFIGURED_ROW_REFERENCES.some((reference) =>
      content.includes(reference),
    );
    if (!isProgramModule && !readsConfiguredRow) {
      const quantitative = QUANTITATIVE_TOKENS.find((pattern) =>
        pattern.test(content),
      );
      if (quantitative) {
        violations.push(
          `G53: ${relativePath} states a founding-programme figure without reading the configured row — every capacity, count, remainder and deadline must come from components/founding/program.ts or from the row accessors.`,
        );
      }
    }
    return violations;
  }

  // (a) everywhere else, v1 stands.
  for (const rule of forbiddenPatterns) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      violations.push(
        `G53: ${rule.label} in ${relativePath}:${lineOf(match.index)}`,
      );
    }
  }

  return violations;
}

function collectSourceFiles(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(path, files);
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function run() {
  let hasFailure = false;

  for (const root of roots) {
    for (const file of collectSourceFiles(root)) {
      const relativePath = relative(".", file).replaceAll("\\", "/");
      const content = readFileSync(file, "utf8");

      for (const violation of evaluateFoundingClaims(relativePath, content)) {
        hasFailure = true;
        console.error(violation);
      }
    }
  }

  if (hasFailure) {
    process.exit(1);
  }

  console.log(
    "founding-host-claims: programme language confined to its allow-listed surfaces, every figure read from the configured row",
  );
}

// Only sweep the tree when invoked directly; importing this module (the
// self-test) must not walk the repository or exit the process.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run();
}
