import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canShowHostAllClear,
  deriveHostReadiness,
} from "../../components/host/hostReadiness.ts";

const completeProfile = {
  companyName: "Wenatchee Orchard Co.",
  about: "A third-generation orchard with a small seasonal crew.",
  primaryLocationName: "Wenatchee, WA",
  photoUrl: "https://example.com/orchard.jpg",
  categoryScopes: ["farm", "seasonal"],
} as const;

describe("deriveHostReadiness", () => {
  it("prioritizes an incomplete public profile before inventory work", () => {
    const readiness = deriveHostReadiness(
      { ...completeProfile, about: null },
      {},
      0,
      0,
    );

    assert.equal(readiness.profile.ready, false);
    assert.deepEqual(readiness.profile.missing, ["story"]);
    assert.equal(readiness.nextStep.kind, "complete_profile");
    assert.equal(readiness.nextStep.href, "/host/profile/edit");
  });

  it("preserves an inventory-specific status while profile work leads", () => {
    const readiness = deriveHostReadiness(
      { ...completeProfile, photoUrl: null },
      { under_review: 1 },
      1,
      0,
    );

    assert.equal(readiness.nextStep.kind, "complete_profile");
    assert.equal(readiness.inventoryStep.kind, "awaiting_review");
    assert.match(readiness.inventoryStep.hint, /no action is required/i);
  });

  it("routes a ready host with no inventory to listing creation", () => {
    const readiness = deriveHostReadiness(completeProfile, {}, 0, 0);

    assert.equal(readiness.inventory, "none");
    assert.equal(readiness.nextStep.kind, "create_listing");
    assert.equal(readiness.nextStep.href, "/host/listings/new");
  });

  it("distinguishes draft, moderation, and inactive inventory", () => {
    const draft = deriveHostReadiness(completeProfile, { draft: 1 }, 1, 0);
    const review = deriveHostReadiness(
      completeProfile,
      { under_review: 1 },
      1,
      0,
    );
    const inactive = deriveHostReadiness(
      completeProfile,
      { closed: 1, archived: 1 },
      2,
      0,
    );

    assert.equal(draft.inventory, "draft");
    assert.equal(draft.nextStep.kind, "finish_draft");
    assert.equal(review.inventory, "under_review");
    assert.equal(review.nextStep.kind, "awaiting_review");
    assert.equal(inactive.inventory, "inactive");
    assert.equal(inactive.nextStep.kind, "manage_inactive");
  });

  it("prioritizes an actionable draft over a separate listing awaiting review", () => {
    const readiness = deriveHostReadiness(
      completeProfile,
      { draft: 1, under_review: 1 },
      2,
      0,
    );

    assert.equal(readiness.inventory, "draft");
    assert.equal(readiness.nextStep.kind, "finish_draft");
  });

  it("treats live inventory as setup-ready even when inactive listings also exist", () => {
    const readiness = deriveHostReadiness(
      completeProfile,
      { live: 1, closed: 2 },
      3,
      1,
    );

    assert.equal(readiness.inventory, "live");
    assert.equal(readiness.nextStep.kind, "ready");
  });
});

describe("canShowHostAllClear", () => {
  it("never congratulates a host whose profile or live inventory is incomplete", () => {
    const incompleteProfile = deriveHostReadiness(
      { ...completeProfile, photoUrl: null },
      { live: 1 },
      1,
      1,
    );
    const closedOnly = deriveHostReadiness(
      completeProfile,
      { closed: 1 },
      1,
      0,
    );

    assert.equal(canShowHostAllClear(incompleteProfile, 0, 0, 0), false);
    assert.equal(canShowHostAllClear(closedOnly, 0, 0, 0), false);
  });

  it("allows all-clear only for a ready host with no operational actions", () => {
    const ready = deriveHostReadiness(
      completeProfile,
      { live: 1 },
      1,
      1,
    );

    assert.equal(canShowHostAllClear(ready, 0, 0, 0), true);
    assert.equal(canShowHostAllClear(ready, 1, 0, 0), false);
    assert.equal(canShowHostAllClear(ready, 0, 1, 0), false);
    assert.equal(canShowHostAllClear(ready, 0, 0, 1), false);
  });
});
