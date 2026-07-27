import { describe, expect, it } from "vitest";

import { CATALOG } from "./catalog.mjs";
import {
  INTERNAL_SMOKE_PRICE,
  INTERNAL_SMOKE_TIER,
  INTERNAL_TEST_METADATA_KEY,
  internalSmokeMetadata,
  internalSmokeSessionMetadata,
  isInternalBillingTestObject,
} from "./internal-smoke.mjs";
import {
  catalogPriceIndex,
  isLiveModeKey,
  isTestModeKey,
  LIFECYCLE_PRICE_KEYS,
  resolveLifecyclePrices,
} from "./provision.mjs";

describe("catalogPriceIndex", () => {
  it("flattens every catalog price under its lookup key", () => {
    const index = catalogPriceIndex();
    const expected = CATALOG.flatMap((product) => product.prices).length;
    expect(index.size).toBe(expected);
  });

  it("carries the owning product through so a price can name its product", () => {
    const index = catalogPriceIndex();
    expect(index.get("ee_starter_monthly").productKey).toBe("starter");
    expect(index.get("ee_additional_listing_starter").productKey).toBe(
      "additional_listing",
    );
  });

  it("preserves recurrence, so a one-time price cannot be subscribed to by mistake", () => {
    const index = catalogPriceIndex();
    expect(index.get("ee_starter_monthly")).toMatchObject({
      type: "recurring",
      interval: "month",
    });
    expect(index.get("ee_starter_yearly")).toMatchObject({
      type: "recurring",
      interval: "year",
    });
    expect(index.get("ee_announcement")).toMatchObject({
      type: "one_time",
      interval: null,
    });
  });

  it("throws on a duplicate lookup key rather than losing a price", () => {
    const duplicated = [
      { key: "a", name: "A", prices: [{ lookupKey: "dupe", envVar: "A", unitAmountCents: 1, type: "one_time" }] },
      { key: "b", name: "B", prices: [{ lookupKey: "dupe", envVar: "B", unitAmountCents: 2, type: "one_time" }] },
    ];
    expect(() => catalogPriceIndex(duplicated)).toThrow(/duplicate catalog lookupKey/);
  });
});

describe("resolveLifecyclePrices", () => {
  it("maps every lifecycle role onto a provisioned price id", () => {
    const provisioned = new Map([
      [LIFECYCLE_PRICE_KEYS.planMonthly, "price_monthly"],
      [LIFECYCLE_PRICE_KEYS.planYearly, "price_yearly"],
      [LIFECYCLE_PRICE_KEYS.addOnMonthly, "price_addon"],
    ]);
    expect(resolveLifecyclePrices(provisioned)).toEqual({
      planMonthly: "price_monthly",
      planYearly: "price_yearly",
      addOnMonthly: "price_addon",
    });
  });

  it("names every missing role at once instead of failing one at a time", () => {
    const provisioned = new Map([[LIFECYCLE_PRICE_KEYS.planMonthly, "price_monthly"]]);
    expect(() => resolveLifecyclePrices(provisioned)).toThrow(
      /planYearly.*ee_starter_yearly.*addOnMonthly.*ee_additional_listing_starter/s,
    );
  });

  it("every lifecycle key is a REAL catalog price (a renamed lookup key fails here)", () => {
    const index = catalogPriceIndex();
    for (const lookupKey of Object.values(LIFECYCLE_PRICE_KEYS)) {
      expect(index.has(lookupKey), `${lookupKey} is not in the catalog`).toBe(true);
    }
  });

  it("the lifecycle drives RECURRING prices only — a lifetime needs renewals", () => {
    const index = catalogPriceIndex();
    for (const lookupKey of Object.values(LIFECYCLE_PRICE_KEYS)) {
      expect(index.get(lookupKey).type).toBe("recurring");
    }
  });

  it("the two plan prices differ in interval, so the switch really prorates", () => {
    const index = catalogPriceIndex();
    expect(index.get(LIFECYCLE_PRICE_KEYS.planMonthly).interval).toBe("month");
    expect(index.get(LIFECYCLE_PRICE_KEYS.planYearly).interval).toBe("year");
  });
});

describe("key mode detection", () => {
  it("recognises test keys, including restricted ones", () => {
    expect(isTestModeKey("sk_test_abc")).toBe(true);
    expect(isTestModeKey("rk_test_abc")).toBe(true);
  });

  it("recognises live keys, including restricted ones", () => {
    expect(isLiveModeKey("sk_live_abc")).toBe(true);
    expect(isLiveModeKey("rk_live_abc")).toBe(true);
  });

  // The guard in lifecycle-test.mjs refuses to run unless isTestModeKey is
  // true, so an unrecognised shape must read as NOT-test. Asserting the
  // negative is the point: a helper that returned true for everything it did
  // not recognise would let the lifecycle attach a failing card to a live
  // customer.
  it("fails closed: an unrecognised key is neither test nor live", () => {
    for (const key of ["", "abc", "pk_test_abc", "whsec_abc", undefined, null]) {
      expect(isTestModeKey(key)).toBe(false);
      expect(isLiveModeKey(key)).toBe(false);
    }
  });
});

describe("internal smoke instrument", () => {
  it("stamps the internal-test marker on everything it creates", () => {
    expect(internalSmokeMetadata()[INTERNAL_TEST_METADATA_KEY]).toBe("true");
    expect(internalSmokeMetadata({ extra: "x" })).toMatchObject({
      [INTERNAL_TEST_METADATA_KEY]: "true",
      extra: "x",
    });
  });

  it("session metadata carries the two keys syncCheckoutCompleted actually reads", () => {
    const metadata = internalSmokeSessionMetadata("user_abc");
    expect(metadata.subscriptionTier).toBe(INTERNAL_SMOKE_TIER);
    expect(metadata.clerkUserId).toBe("user_abc");
    expect(metadata[INTERNAL_TEST_METADATA_KEY]).toBe("true");
  });

  it("refuses to mint session metadata without a clerk user id", () => {
    expect(() => internalSmokeSessionMetadata("")).toThrow(/clerkUserId is required/);
    expect(() => internalSmokeSessionMetadata(undefined)).toThrow(/clerkUserId is required/);
  });

  // isInternalBillingTestObject is used as a REFUSAL in the cleanup path, so
  // every way of being not-marked must read as false. A truthy-ish value that
  // slipped through would let a refund reach a real customer's subscription.
  it("fails closed on anything that is not exactly the marker", () => {
    expect(isInternalBillingTestObject(null)).toBe(false);
    expect(isInternalBillingTestObject(undefined)).toBe(false);
    expect(isInternalBillingTestObject({})).toBe(false);
    expect(isInternalBillingTestObject({ metadata: {} })).toBe(false);
    expect(isInternalBillingTestObject({ metadata: { [INTERNAL_TEST_METADATA_KEY]: "TRUE" } })).toBe(false);
    expect(isInternalBillingTestObject({ metadata: { [INTERNAL_TEST_METADATA_KEY]: true } })).toBe(false);
    expect(isInternalBillingTestObject({ metadata: { [INTERNAL_TEST_METADATA_KEY]: "1" } })).toBe(false);
  });

  it("recognises the marker it writes (round trip)", () => {
    expect(isInternalBillingTestObject({ metadata: internalSmokeMetadata() })).toBe(true);
    expect(
      isInternalBillingTestObject({ metadata: internalSmokeSessionMetadata("user_abc") }),
    ).toBe(true);
  });

  it("costs one dollar a month — the point of the whole layer", () => {
    expect(INTERNAL_SMOKE_PRICE.unitAmountCents).toBe(100);
    expect(INTERNAL_SMOKE_PRICE.interval).toBe("month");
  });

  it("claims a REAL tier, or the grant path would reject it and prove nothing", () => {
    const realTiers = new Set(CATALOG.map((product) => product.key));
    expect(realTiers.has(INTERNAL_SMOKE_TIER)).toBe(true);
  });
});
