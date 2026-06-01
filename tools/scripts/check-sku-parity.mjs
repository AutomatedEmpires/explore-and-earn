import { readFileSync } from "node:fs";

// G-BILL-5: conventional SKU keys must match between the contracts and the seed catalog.
const contracts = readFileSync("packages/contracts/src/stripe.ts", "utf8");
const catalog = readFileSync("packages/stripe-seed/src/catalog.ts", "utf8");

function extractArray(source, name) {
  const match = source.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return null;
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

const failures = [];

function compare(label, fromContracts, fromCatalog) {
  if (!fromContracts) {
    failures.push(`${label}: missing array in contracts/src/stripe.ts`);
    return;
  }
  if (!fromCatalog) {
    failures.push(`${label}: missing array in stripe-seed/src/catalog.ts`);
    return;
  }
  const a = new Set(fromContracts);
  const b = new Set(fromCatalog);
  const missing = [...a].filter((key) => !b.has(key));
  const extra = [...b].filter((key) => !a.has(key));
  if (missing.length) failures.push(`${label}: in contracts but not catalog -> ${missing.join(", ")}`);
  if (extra.length) failures.push(`${label}: in catalog but not contracts -> ${extra.join(", ")}`);
}

const products = extractArray(contracts, "STRIPE_PRODUCT_KEYS");
const prices = extractArray(contracts, "STRIPE_PRICE_KEYS");
const coupons = extractArray(contracts, "STRIPE_COUPON_KEYS");

const planProducts = extractArray(catalog, "PLAN_PRODUCTS") ?? [];
const addonProducts = extractArray(catalog, "ADDON_PRODUCTS") ?? [];
const planPrices = extractArray(catalog, "PLAN_PRICES") ?? [];
const addonPrices = extractArray(catalog, "ADDON_PRICES") ?? [];
const foundingCoupons = extractArray(catalog, "FOUNDING_COUPONS");

compare("products", products, [...planProducts, ...addonProducts]);
compare("prices", prices, [...planPrices, ...addonPrices]);
compare("coupons", coupons, foundingCoupons);

if (failures.length) {
  console.error("G-BILL-5: SKU drift between contracts and stripe-seed catalog:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("sku-parity: contract SKU keys match the stripe-seed catalog");
