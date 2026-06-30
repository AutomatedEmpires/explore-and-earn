import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ANNOUNCEMENT_PRICING,
  BOOST_PRICING,
  FOUNDER_LOCKED_PRICING,
} from "@explore-and-earn/contracts";
import { describe, expect, it } from "vitest";

import { CATALOG, CATALOG_CURRENCY } from "./catalog.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(here, "expected-stripe-manifest.json"), "utf8"),
);

function amountFor(lookupKey) {
  for (const product of CATALOG) {
    const price = product.prices.find((p) => p.lookupKey === lookupKey);
    if (price) return price.unitAmountCents;
  }
  throw new Error(`no catalog price for ${lookupKey}`);
}

describe("stripe-seed catalog", () => {
  it("matches the committed manifest snapshot (drift guard)", () => {
    const manifestCatalog = {
      currency: manifest.currency,
      products: manifest.products,
    };
    expect({ currency: CATALOG_CURRENCY, products: CATALOG }).toEqual(
      manifestCatalog,
    );
  });

  it("amounts come from the founder-locked pricing contracts (no drift)", () => {
    expect(amountFor("ee_starter_monthly")).toBe(FOUNDER_LOCKED_PRICING.starter.monthly);
    expect(amountFor("ee_starter_yearly")).toBe(FOUNDER_LOCKED_PRICING.starter.yearly);
    expect(amountFor("ee_professional_monthly")).toBe(FOUNDER_LOCKED_PRICING.professional.monthly);
    expect(amountFor("ee_professional_yearly")).toBe(FOUNDER_LOCKED_PRICING.professional.yearly);
    expect(amountFor("ee_enterprise_monthly")).toBe(FOUNDER_LOCKED_PRICING.enterprise.monthly);
    expect(amountFor("ee_enterprise_yearly")).toBe(FOUNDER_LOCKED_PRICING.enterprise.yearly);
    expect(amountFor("ee_announcement_7d")).toBe(ANNOUNCEMENT_PRICING[7]);
    expect(amountFor("ee_announcement_14d")).toBe(ANNOUNCEMENT_PRICING[14]);
    expect(amountFor("ee_announcement_28d")).toBe(ANNOUNCEMENT_PRICING[28]);
    expect(amountFor("ee_boost_7d")).toBe(BOOST_PRICING[7]);
    expect(amountFor("ee_boost_14d")).toBe(BOOST_PRICING[14]);
    expect(amountFor("ee_boost_28d")).toBe(BOOST_PRICING[28]);
  });

  it("env vars and lookup keys are unique", () => {
    const envVars = CATALOG.flatMap((p) => p.prices.map((x) => x.envVar));
    const lookupKeys = CATALOG.flatMap((p) => p.prices.map((x) => x.lookupKey));
    expect(new Set(envVars).size).toBe(envVars.length);
    expect(new Set(lookupKeys).size).toBe(lookupKeys.length);
  });

  it("covers exactly the 9 required STRIPE_PRICE_* env vars the app requireEnv's", () => {
    const required = CATALOG.flatMap((p) =>
      p.prices.filter((x) => !x.optional).map((x) => x.envVar),
    ).sort();
    expect(required).toEqual([
      "STRIPE_PRICE_ANNOUNCEMENT_14D",
      "STRIPE_PRICE_ANNOUNCEMENT_28D",
      "STRIPE_PRICE_ANNOUNCEMENT_7D",
      "STRIPE_PRICE_ENTERPRISE_MONTHLY",
      "STRIPE_PRICE_ENTERPRISE_YEARLY",
      "STRIPE_PRICE_PROFESSIONAL_MONTHLY",
      "STRIPE_PRICE_PROFESSIONAL_YEARLY",
      "STRIPE_PRICE_STARTER_MONTHLY",
      "STRIPE_PRICE_STARTER_YEARLY",
    ]);
  });
});
