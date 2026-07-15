import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildPublicHostLocationContext } from "../../components/host/publicHostLocation.ts";

describe("buildPublicHostLocationContext", () => {
  it("uses persisted host and listing locations and counts duplicate work places", () => {
    const context = buildPublicHostLocationContext("Wenatchee, WA", [
      { locationDisplay: "Leavenworth, WA" },
      { locationDisplay: " leavenworth, wa " },
      { locationDisplay: "Remote — US" },
      { locationDisplay: null },
    ]);

    assert.ok(context);
    assert.equal(context.hostBase?.label, "Wenatchee, WA");
    assert.match(context.hostBase?.mapsUrl ?? "", /Wenatchee%2C%20WA/);
    assert.deepEqual(context.opportunityLocations, [
      {
        label: "Leavenworth, WA",
        opportunityCount: 2,
        mapsUrl:
          "https://www.google.com/maps/search/?api=1&query=Leavenworth%2C%20WA",
      },
      {
        label: "Remote — US",
        opportunityCount: 1,
        mapsUrl: null,
      },
    ]);
  });

  it("still returns current opportunity locations when the host base is missing", () => {
    const context = buildPublicHostLocationContext(null, [
      { locationDisplay: "Sitka, AK" },
    ]);

    assert.ok(context);
    assert.equal(context.hostBase, null);
    assert.equal(context.opportunityLocations[0]?.label, "Sitka, AK");
  });

  it("returns no location module when neither profile nor live listings provide location", () => {
    const context = buildPublicHostLocationContext("   ", [
      { locationDisplay: null },
      { locationDisplay: "" },
    ]);

    assert.equal(context, null);
  });
});
