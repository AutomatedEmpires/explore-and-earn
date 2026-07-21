import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES } from "@explore-and-earn/contracts";

import {
  BenefitPhotoSessionLedger,
  type TrackedBenefitPhotoUpload,
} from "../../components/discovery/benefitPhotoSession";

const upload = (
  slot: string,
  url: string,
): TrackedBenefitPhotoUpload => ({
  listingId: "listing-1",
  kind: "meals",
  slot,
  url,
});

describe("BenefitPhotoSessionLedger", () => {
  it("tracks a replacement as stale until its object is discarded", () => {
    const ledger = new BenefitPhotoSessionLedger();
    const first = upload("kitchen", "https://storage/first.webp");
    const second = upload("kitchen", "https://storage/second.webp");

    expect(ledger.track(first)).toBeUndefined();
    expect(ledger.track(second)).toEqual(first);
    expect(ledger.stale()).toEqual([first]);
    expect(ledger.all()).toEqual([first, second]);

    ledger.forget(first.url);
    expect(ledger.all()).toEqual([second]);
  });

  it("marks a removed current upload stale and clears a saved session", () => {
    const ledger = new BenefitPhotoSessionLedger();
    const kitchen = upload("kitchen", "https://storage/kitchen.webp");
    const dining = upload("dining", "https://storage/dining.webp");
    ledger.track(kitchen);
    ledger.track(dining);

    expect(ledger.removeCurrent("listing-1", "meals", "kitchen")).toEqual(
      kitchen,
    );
    expect(ledger.stale()).toEqual([kitchen]);

    ledger.clear();
    expect(ledger.all()).toEqual([]);
    expect(ledger.stale()).toEqual([]);
  });

  it("wires replacement, removal, cancel, save, and cleanup locking into the modal", () => {
    const source = readFileSync(
      new URL(
        "../../components/discovery/BenefitTrustModal.tsx",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).toContain("sessionUploads.current.track({");
    expect(source).toContain("if (replaced) await discardSessionUploads([replaced])");
    expect(source).toContain("sessionUploads.current.removeCurrent(");
    expect(source).toContain("discardSessionUploads(sessionUploads.current.all())");
    expect(source).toContain("discardSessionUploads(sessionUploads.current.stale())");
    expect(source).toContain("sessionUploads.current.clear()");
    expect(source).toContain(
      "const closeLocked = saving || cleaningUploads || uploadingSlots.size > 0",
    );
    expect(source).toContain("if (closeLocked) return;");
    expect(source).toContain("closeDisabled={closeLocked}");
    expect(source).toContain("if (cancelled) return;");
    expect(source).toContain("cancelled = true;");
    expect(SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES).toBe(4 * 1024 * 1024);
    const sizeGate = source.indexOf(
      "file.size > SERVER_IMAGE_UPLOAD_MAX_FILE_BYTES",
    );
    const uploadCall = source.indexOf("uploadBenefitPhotoAction(");
    expect(sizeGate).toBeGreaterThan(-1);
    expect(source).toContain("Images must be 4 MB or smaller.");
    expect(sizeGate).toBeLessThan(uploadCall);
  });
});
