import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { popupDismissalAllowed } from "../../components/overlay/popupDismissal.ts";

describe("popup dismissal preflight", () => {
  it("allows normal dismissals and synchronously preserves a veto", () => {
    let checked = 0;

    assert.equal(popupDismissalAllowed(), true);
    assert.equal(
      popupDismissalAllowed(() => {
        checked += 1;
        return false;
      }),
      false,
    );
    assert.equal(checked, 1);
  });
});
