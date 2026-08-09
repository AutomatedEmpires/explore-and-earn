import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP_ROOT = join(__dirname, "../..");

function source(relativePath: string): string {
  return readFileSync(join(APP_ROOT, relativePath), "utf8");
}

describe("listing application state", () => {
  it("keeps apply and save transitions independent", () => {
    const component = source("app/[locale]/listing/[id]/ApplyButton.tsx");

    expect(component).toContain("const [isApplying, startApplying] = useTransition()");
    expect(component).toContain("const [isSaving, startSaving] = useTransition()");
    expect(component).toContain('{isApplying ? t("submitting") : tc("apply")}');
    expect(component).not.toContain('{isPending ? t("submitting")');
  });

  it("focuses the persistent applied status after a committed application", () => {
    const component = source("app/[locale]/listing/[id]/ApplyButton.tsx");
    const styles = source("app/[locale]/listing/[id]/ApplyButton.module.css");

    expect(component).toContain("focusAppliedAfterCommit.current = true");
    expect(component).toContain("appliedStateRef.current?.focus()");
    expect(component).toContain("ref={appliedStateRef}");
    expect(component).toContain("tabIndex={-1}");
    expect(component).not.toContain("requestAnimationFrame");
    expect(styles).toMatch(/\.appliedState:focus\s*\{[^}]*var\(--ui-focus-ring\)/s);
  });

  it("keeps focus inside the confirmation dialog while apply is pending", () => {
    const component = source("app/[locale]/listing/[id]/ApplyButton.tsx");
    const handleConfirm = component.indexOf("const handleConfirm");
    const actionCall = component.indexOf(
      "await applyToListingAction(listingId)",
      handleConfirm,
    );
    const modalClose = component.indexOf(
      "setShowConfirmModal(false)",
      actionCall,
    );
    const confirmButton = component.slice(
      component.indexOf('variant="primary"', component.indexOf("{showConfirmModal")),
      component.indexOf('variant="ghost"', component.indexOf("{showConfirmModal")),
    );

    expect(handleConfirm).toBeGreaterThan(-1);
    expect(actionCall).toBeGreaterThan(handleConfirm);
    expect(modalClose).toBeGreaterThan(actionCall);
    expect(component).toContain("if (applyRequestInFlight.current) return");
    expect(component).toContain(
      "if (!applyRequestInFlight.current) setShowConfirmModal(false)",
    );
    expect(confirmButton).toContain("aria-busy={isApplying}");
    expect(confirmButton).toContain("aria-disabled={isApplying}");
    expect(confirmButton).toContain(
      '{isApplying ? t("submitting") : tc("confirm")}',
    );
    expect(confirmButton).not.toContain("disabled={isPending}");
  });

  it("renders the stable unavailable state without exposing raw database errors", () => {
    const component = source("app/[locale]/listing/[id]/ApplyButton.tsx");
    const action = source("app/actions/applications.ts");
    const messages = JSON.parse(source("messages/en.json")) as {
      Apply: { errorListingUnavailable?: string };
    };

    expect(component).toContain(
      'result.error === "listing_not_accepting_applications"',
    );
    expect(component).toContain('message: t("errorListingUnavailable")');
    expect(component).not.toContain("message: result.error");
    expect(messages.Apply.errorListingUnavailable).toBe(
      "This listing is no longer accepting applications. Nothing was submitted.",
    );
    expect(action).not.toContain("This opportunity hasn't been confirmed");
  });

  it("does not emit a second submission event for invite adoption", () => {
    const action = source("app/actions/invites.ts");

    expect(action).toContain('result.disposition === "created"');
    expect(action).toContain('result.disposition === "reactivated"');
    expect(action).toContain("`existing` disposition");
  });
});
