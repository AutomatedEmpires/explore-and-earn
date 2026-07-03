// Runtime catalog loader. Reads the committed snapshot (expected-stripe-manifest
// .json) rather than importing the pricing contracts directly: the contracts
// package exports TypeScript source with extensionless imports, which plain
// `node` cannot resolve — but the founder runs `node seed.mjs`. The snapshot is
// kept in lockstep with the founder-locked pricing contracts by catalog.test.mjs
// (which CAN import the contracts), so the JSON is a *verified* mirror, not a
// hand-maintained fork.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(here, "expected-stripe-manifest.json"), "utf8"),
);

export const CATALOG_CURRENCY = manifest.currency;
export const CATALOG = manifest.products;
