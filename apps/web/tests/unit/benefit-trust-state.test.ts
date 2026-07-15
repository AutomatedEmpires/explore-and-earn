import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  benefitDismissBlocker,
  publicBenefitPhotoStatus,
} from "../../components/discovery/benefitTrustState.ts";

describe("benefit editor dismissal", () => {
  it("blocks uploads and confirms dirty edit state, but never guards view mode", () => {
    assert.equal(benefitDismissBlocker("edit", false, true), "uploading");
    assert.equal(benefitDismissBlocker("edit", true, false), "dirty");
    assert.equal(benefitDismissBlocker("edit", false, false), null);
    assert.equal(benefitDismissBlocker("view", true, true), null);
  });
});

describe("public benefit photo truth", () => {
  it("distinguishes loading, unavailable, and genuinely unpublished states", () => {
    assert.equal(publicBenefitPhotoStatus(true, false), "Loading photo");
    assert.equal(publicBenefitPhotoStatus(false, true), "Details unavailable");
    assert.equal(publicBenefitPhotoStatus(false, false), "Photo not published");
  });
});
