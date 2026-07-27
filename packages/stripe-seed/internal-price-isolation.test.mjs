// THE INTERNAL SMOKE PRICE MUST NEVER BE REACHABLE FROM THE PRODUCT.
//
// The whole safety argument for a live $1 price that grants a real starter tier
// is that no public surface can select it. That argument rests on two facts,
// and a comment cannot hold either of them:
//
//   1. apps/web never mentions the lookup key, the catalog key, or the product
//      name. resolveStripePriceId returns only prices named by the public
//      STRIPE_PRICE_* env vars, so a price the app cannot NAME is a price the
//      app cannot SELL.
//   2. the sellable catalog (expected-stripe-manifest.json, what seed.mjs
//      writes) does not contain it. If it ever did, the founder would seed the
//      smoke price into live alongside the real plans and it would acquire an
//      env var.
//
// This test is what stops either from quietly becoming false. It lives in
// packages/stripe-seed rather than in apps/web on purpose: a scanner that sits
// inside the tree it scans has to exempt itself, and an exemption is the hole.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CATALOG } from "./catalog.mjs";
import { INTERNAL_SMOKE_PRICE } from "./internal-smoke.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const webRoot = join(repoRoot, "apps", "web");

const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  ".turbo",
  ".vercel",
  "dist",
  "coverage",
  ".git",
]);

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|md)$/;

/** Every source file under apps/web. */
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SOURCE_EXTENSIONS.test(name)) out.push(full);
  }
  return out;
}

/**
 * The strings that would each, on their own, be evidence the smoke instrument
 * had leaked into the product surface.
 */
const FORBIDDEN_IN_WEB = [
  INTERNAL_SMOKE_PRICE.lookupKey,
  INTERNAL_SMOKE_PRICE.catalogKey,
  INTERNAL_SMOKE_PRICE.productName,
];

describe("internal billing smoke price isolation", () => {
  const files = walk(webRoot);

  it("scans a non-trivial number of apps/web files (negative control)", () => {
    // Without this, a broken walk() would make every assertion below pass by
    // scanning nothing at all — the failure mode where a guard reports green
    // because it looked at an empty list.
    expect(files.length).toBeGreaterThan(200);
  });

  for (const needle of FORBIDDEN_IN_WEB) {
    it(`"${needle}" never appears in apps/web`, () => {
      const hits = files
        .filter((file) => readFileSync(file, "utf8").includes(needle))
        .map((file) => relative(repoRoot, file).replaceAll("\\", "/"));
      expect(
        hits,
        `The internal billing smoke price leaked into the product surface. It is a LIVE $1 price that grants a real starter tier and must never be selectable by a customer. Remove the reference; do not add an exemption.`,
      ).toEqual([]);
    });
  }

  it("is absent from the sellable catalog, so seed.mjs can never provision it", () => {
    const lookupKeys = CATALOG.flatMap((product) =>
      product.prices.map((price) => price.lookupKey),
    );
    const catalogKeys = CATALOG.map((product) => product.key);
    expect(lookupKeys).not.toContain(INTERNAL_SMOKE_PRICE.lookupKey);
    expect(catalogKeys).not.toContain(INTERNAL_SMOKE_PRICE.catalogKey);
  });

  it("carries no env var — an env var is exactly what would make it resolvable", () => {
    // resolveStripePriceId maps tier+interval onto a STRIPE_PRICE_* env var and
    // nothing else. The smoke price descriptor deliberately has no envVar field,
    // and ensureSmokePrice() writes no ee_env_var metadata.
    expect(INTERNAL_SMOKE_PRICE).not.toHaveProperty("envVar");
  });
});
