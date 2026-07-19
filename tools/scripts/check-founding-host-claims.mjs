import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const roots = ["apps/web/app", "apps/web/components"];
const sourceExtensions = new Set([".ts", ".tsx"]);
const ignoredDirectories = new Set([".next", "dist", "node_modules"]);

const forbiddenPatterns = [
  {
    label: "unimplemented Founding Host runtime contract",
    pattern: /\b(?:FOUNDING_LOCKED_PRICING|FOUNDING_SEAT_CAP|FoundingCountdown)\b/g,
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

let hasFailure = false;

for (const root of roots) {
  for (const file of collectSourceFiles(root)) {
    const content = readFileSync(file, "utf8");

    for (const rule of forbiddenPatterns) {
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        hasFailure = true;
        const line = content.slice(0, match.index).split("\n").length;
        console.error(
          `G53: ${rule.label} in ${relative(".", file)}:${line}`,
        );
      }
    }
  }
}

if (hasFailure) {
  process.exit(1);
}

console.log("founding-host-claims: no unsupported runtime claims found");
