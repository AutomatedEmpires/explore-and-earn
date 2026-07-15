import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveHostProfileReadiness } from "../../components/host/hostReadiness.ts";
import {
  resolveHostProfileReadinessInput,
  type HostProfileSummary,
} from "../../components/host/models.ts";

const displayProfile: HostProfileSummary = {
  hostName: "Host",
  orgName: "Your organization",
  verified: false,
};

describe("resolveHostProfileReadinessInput", () => {
  it("keeps display placeholders from completing an absent persisted profile", () => {
    const input = resolveHostProfileReadinessInput(displayProfile, null);
    const readiness = deriveHostProfileReadiness(input);

    assert.deepEqual(input, {
      companyName: null,
      about: null,
      primaryLocationName: null,
      photoUrl: null,
      categoryScopes: [],
    });
    assert.equal(readiness.completed, 0);
    assert.deepEqual(readiness.missing, [
      "company",
      "story",
      "location",
      "photo",
      "categories",
    ]);
  });

  it("uses raw persisted fields even when display copy differs", () => {
    const input = resolveHostProfileReadinessInput(
      { ...displayProfile, orgName: "Marketplace display name" },
      {
        companyName: "Persisted organization",
        about: "A real host story.",
        primaryLocationName: "Bend, OR",
        photoUrl: "https://example.com/host.jpg",
        categoryScopes: ["seasonal"],
      },
    );

    assert.equal(input.companyName, "Persisted organization");
    assert.equal(deriveHostProfileReadiness(input).completed, 5);
  });
});
