import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * Guard the two temporary Phase 2 compatibility seams:
 *  - Clerk must use the ordinary session token supplied by its native
 *    Supabase integration, never the deprecated named JWT template.
 *  - remote map fixtures may run only in a production-mode Vercel Preview and
 *    may never be enabled by a committed environment file.
 */

const DISCOVERY_FILE = "apps/web/components/discovery/data.ts";
const PREVIEW_FLAG = "PREVIEW_MAP_FIXTURES";
const DEPRECATED_TOKEN_CALL = /getToken\s*\(\s*\{\s*template\s*:\s*["']supabase["']/;
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", ".next", "build", ".git"]);
const violations = [];

function walk(directory, predicate, out = []) {
  if (!existsSync(directory)) return out;
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) walk(full, predicate, out);
    else if (predicate(entry)) out.push(full);
  }
  return out;
}

for (const root of ["apps", "packages"]) {
  for (const file of walk(root, (name) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(name))) {
    const source = readFileSync(file, "utf8");
    if (DEPRECATED_TOKEN_CALL.test(source)) {
      violations.push(`${file.split(sep).join("/")}  deprecated Clerk JWT-template call remains`);
    }
  }
}

if (!existsSync(DISCOVERY_FILE)) {
  violations.push(`${DISCOVERY_FILE}  Preview map-fixture gate is missing`);
} else {
  const source = readFileSync(DISCOVERY_FILE, "utf8");
  for (const guard of [
    'process.env.NODE_ENV === "production"',
    'process.env.VERCEL_ENV === "preview"',
    `process.env.${PREVIEW_FLAG} === "1"`,
  ]) {
    if (!source.includes(guard)) {
      violations.push(`${DISCOVERY_FILE}  missing required gate: ${guard}`);
    }
  }

  const mapStart = source.indexOf("export async function getDiscoveryListingsWithCoords");
  const nextExport = source.indexOf("\nexport function", mapStart);
  const mapFunction = source.slice(mapStart, nextExport === -1 ? undefined : nextExport);
  const sourceWithoutMapFunction = source.slice(0, mapStart) + source.slice(nextExport);
  if (!mapFunction.includes("allowPreviewMapFixtures")) {
    violations.push(`${DISCOVERY_FILE}  Preview fixture gate is not used by the map fetch seam`);
  }
  if (sourceWithoutMapFunction.match(/allowPreviewMapFixtures/g)?.length !== 1) {
    violations.push(`${DISCOVERY_FILE}  Preview fixture gate escaped the map-only seam`);
  }
}

function isCommittedEnvFile(name) {
  if (name.endsWith(".local")) return false;
  return name === ".env" || name === ".env.example" || name.startsWith(".env.");
}

for (const root of ["apps", "packages", "."]) {
  for (const file of walk(root, isCommittedEnvFile)) {
    const posix = file.split(sep).join("/").replace(/^\.\//, "");
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return;
      const match = trimmed.match(new RegExp(`^${PREVIEW_FLAG}\\s*=\\s*(.*)$`));
      if (!match) return;
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      if (value !== "" && value !== "0") {
        violations.push(
          `${posix}:${index + 1}  ${PREVIEW_FLAG} must never be committed enabled`,
        );
      }
    });
  }
}

if (violations.length > 0) {
  for (const violation of violations) console.error(violation);
  console.error(`\npreview-readiness: FAILED with ${violations.length} violation(s)`);
  process.exit(1);
}

console.log("preview-readiness: native Clerk tokens and Preview-only map fixtures OK");
