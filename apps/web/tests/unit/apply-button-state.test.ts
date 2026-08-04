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
});
