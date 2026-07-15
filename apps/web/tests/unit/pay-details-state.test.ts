import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canOpenPayDetails,
  getPayBenchmarkState,
  getPayDetailsHeadline,
} from "../../components/discovery/payDetailsState.ts";

describe("pay detail availability", () => {
  it("keeps no-pay cells static and uses literal unavailable copy", () => {
    const state = getPayBenchmarkState("not_provided", undefined);

    assert.equal(canOpenPayDetails("not_provided"), false);
    assert.equal(state.hasBenchmark, false);
    assert.equal(state.headline, "Pay unavailable");
    assert.equal(state.emptyKicker, "Pay not provided");
    assert.match(state.emptyMessage, /has not provided pay details/i);
    assert.doesNotMatch(state.emptyMessage, /summary provided/i);
  });

  it("does not imply comparative analytics for summary-only pay", () => {
    const state = getPayBenchmarkState("provided", undefined);

    assert.equal(canOpenPayDetails("provided"), true);
    assert.equal(state.hasBenchmark, false);
    assert.equal(state.headline, "Comparison unavailable");
    assert.match(state.emptyMessage, /no verified market comparison/i);
  });

  it("enables comparison UI only when a real meter value is present", () => {
    const state = getPayBenchmarkState("provided", 62);

    assert.equal(state.hasBenchmark, true);
    assert.equal(state.headline, "Pay benchmark available");
  });

  it("uses the canonical pay summary verbatim instead of reformatting insight data", () => {
    assert.equal(
      getPayDetailsHeadline("$18.50–$24.75 stipend"),
      "$18.50–$24.75 stipend",
    );
    assert.equal(getPayDetailsHeadline(undefined), "Not provided");
  });
});
