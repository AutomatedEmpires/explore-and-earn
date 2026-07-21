import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { devHostProfile } from "../../lib/devBench";
import {
  buildHostBenefitLibraryPatch,
  canManageHostBenefitLibrary,
} from "../../components/host/hostProfileBenefitLibrary";

const housingPhotos = {
  sleeping_area: "https://example.test/sleeping",
  bathroom: "https://example.test/bathroom",
};

const formSource = readFileSync(
  new URL("../../components/host/HostProfileForm.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("../../app/[locale]/(host)/host/profile/edit/page.tsx", import.meta.url),
  "utf8",
);

describe("host benefit-library rollout gate", () => {
  it("hides management and omits the patch while migration 072 is unavailable", () => {
    expect(canManageHostBenefitLibrary("host-1", false)).toBe(false);
    expect(buildHostBenefitLibraryPatch(false, housingPhotos)).toEqual({});
  });

  it("requires a persisted host profile even when the RPC is available", () => {
    expect(canManageHostBenefitLibrary(undefined, true)).toBe(false);
  });

  it("enables management and includes the patch after the RPC succeeds", () => {
    expect(canManageHostBenefitLibrary("host-1", true)).toBe(true);
    expect(buildHostBenefitLibraryPatch(true, housingPhotos)).toEqual({
      benefitLibrary: { housing: { photos: housingPhotos } },
    });
  });

  it("keeps the local host fixture on the post-migration path", () => {
    expect(devHostProfile()).toMatchObject({
      benefitLibraryAvailable: true,
      benefitLibrary: {},
    });
  });

  it("wires the RPC capability through the page to both the UI and payload gates", () => {
    expect(pageSource).toContain(
      "benefitLibraryAvailable={hostProfile?.benefitLibraryAvailable ?? false}",
    );
    expect(formSource).toContain(
      "const showBenefitLibrary = canManageHostBenefitLibrary(",
    );
    expect(formSource).toContain("{showBenefitLibrary ? (");
    expect(formSource).toContain(
      "...buildHostBenefitLibraryPatch(benefitLibraryAvailable, housingPhotos)",
    );
    expect(formSource).not.toContain("hostProfileId && benefitLibraryAvailable");
  });

  it("distinguishes immediate photo persistence from unsaved form edits", () => {
    expect(formSource).toContain("Uploads auto-save");
    expect(formSource).toContain(
      "Photo uploads replace and save that library slot immediately.",
    );
    expect(formSource).toContain("Remove when saved");
    expect(formSource).toContain("Discard unsaved changes");
  });
});
