import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  hasListingApplyIntent,
  resolveInitialListingApplyDialog,
} from "../../lib/listingApplyIntent";

const webRoot = new URL("../../", import.meta.url);
const source = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");

describe("listing apply deep links", () => {
  it("recognizes only an explicit apply=1 intent", () => {
    expect(hasListingApplyIntent("1")).toBe(true);
    expect(hasListingApplyIntent(["0", "1"])).toBe(true);
    expect(hasListingApplyIntent("0")).toBe(false);
    expect(hasListingApplyIntent("true")).toBe(false);
    expect(hasListingApplyIntent(undefined)).toBe(false);
  });

  it("opens the existing confirmation or resume gate for an eligible seeker", () => {
    const eligible = {
      requested: true,
      viewerRole: "seeker" as const,
      alreadyApplied: false,
      isSourced: false,
      isDemoFixture: false,
    };

    expect(
      resolveInitialListingApplyDialog({
        ...eligible,
        resumeComplete: true,
      }),
    ).toBe("confirm");
    expect(
      resolveInitialListingApplyDialog({
        ...eligible,
        resumeComplete: false,
      }),
    ).toBe("resume");
  });

  it("preserves normal postures when automatic apply is not valid", () => {
    const base = {
      requested: true,
      viewerRole: "seeker" as const,
      alreadyApplied: false,
      resumeComplete: true,
      isSourced: false,
      isDemoFixture: false,
    };

    expect(
      resolveInitialListingApplyDialog({ ...base, requested: false }),
    ).toBeNull();
    expect(
      resolveInitialListingApplyDialog({ ...base, viewerRole: "guest" }),
    ).toBeNull();
    expect(
      resolveInitialListingApplyDialog({ ...base, viewerRole: "owner" }),
    ).toBeNull();
    expect(
      resolveInitialListingApplyDialog({ ...base, alreadyApplied: true }),
    ).toBeNull();
    expect(
      resolveInitialListingApplyDialog({ ...base, isSourced: true }),
    ).toBeNull();
  });

  it("opens confirmation for a known demo fixture without entering the resume loop", () => {
    const demo = {
      requested: true,
      alreadyApplied: false,
      resumeComplete: false,
      isSourced: false,
      isDemoFixture: true,
    };

    expect(
      resolveInitialListingApplyDialog({ ...demo, viewerRole: "guest" }),
    ).toBe("confirm");
    expect(
      resolveInitialListingApplyDialog({ ...demo, viewerRole: "seeker" }),
    ).toBe("confirm");
  });

  it("wires the route through safe auth return and the existing ApplyButton", () => {
    const page = source("app/[locale]/listing/[id]/page.tsx");
    const button = source("app/[locale]/listing/[id]/ApplyButton.tsx");
    const seek = source("components/seeker/SeekBrowser.tsx");
    const swipe = source("components/seeker/SwipeDeck.tsx");

    expect(page).toContain("const autoApply = hasListingApplyIntent(query.apply)");
    expect(page).toContain("isKnownDevDiscoveryFixtureId(listing.id)");
    expect(page).toContain(
      "if (autoApply && !userId && !isSourced && !isDemoFixture)",
    );
    expect(page).toContain(
      'redirect(signInHref("seeker", `/listing/${listing.id}?apply=1`))',
    );
    expect(page).toContain("autoApply={autoApply}");
    expect(page).toContain("isDemoFixture={isDemoFixture}");

    expect(button).toContain('initialApplyDialog === "confirm"');
    expect(button).toContain('initialApplyDialog === "resume"');
    expect(button).toContain('next.delete("apply")');
    expect(button).toContain("router.replace(");
    expect(button).toContain(
      'continueApplyAfterResume ? "?apply=1" : ""',
    );

    const seekApplyStart = seek.indexOf("onApply: (id) => {");
    const seekApplyEnd = seek.indexOf("onSave:", seekApplyStart);
    const seekApply = seek.slice(seekApplyStart, seekApplyEnd);
    expect(seekApplyStart).toBeGreaterThan(-1);
    expect(seekApplyEnd).toBeGreaterThan(seekApplyStart);
    expect(seekApply).toContain("router.push(`/listing/${id}?apply=1`)");
    expect(seekApply).not.toContain("requireAuth()");

    // Swipe has one immediate, non-mutating Apply route shared by guests and
    // authenticated seekers; the listing page owns the safe auth handoff.
    expect(
      swipe.match(/router\.push\(`\/listing\/\$\{card\.id\}\?apply=1`\)/g),
    ).toHaveLength(1);
  });

  it("keeps fixture confirmation local and never reaches the real application action", () => {
    const button = source("app/[locale]/listing/[id]/ApplyButton.tsx");
    const confirmHandler = button.indexOf("const handleConfirm");
    const demoGuard = button.indexOf("if (isDemoFixture)", confirmHandler);
    const realAction = button.indexOf(
      "await applyToListingAction(listingId)",
      confirmHandler,
    );

    expect(confirmHandler).toBeGreaterThan(-1);
    expect(demoGuard).toBeGreaterThan(confirmHandler);
    expect(realAction).toBeGreaterThan(demoGuard);
    expect(button.slice(demoGuard, realAction)).toContain("return;");
    expect(button).toContain('t("demoConfirmBody")');
    expect(button).toContain('t("demoApplicationPreviewed")');
    expect(button).toContain("!isDemoFixture ? (");
  });
});
