import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConfirmAction } from "../../components/admin/ConfirmAction";

/**
 * Destructive admin actions confirm before they fire (founder Part VIII).
 *
 * The shape of the bug this replaces is worth stating, because it was not
 * "nobody added confirmations" — it was that the confirmations went on the
 * WRONG HALF. RefundQueue confirmed approving a refund but not denying one;
 * ClaimsReviewQueue confirmed approving a claim but not rejecting one;
 * ModerationWorkbench's window.confirm covered Remove and Suspend but not
 * Dismiss or Warn. In each pair the guarded verb was the generous one and the
 * unguarded verb was the one that tells a person no — because "destructive"
 * had been read as "spends money / deletes a row" rather than "cannot be taken
 * back". The erasure queue, which completes statutory deletions, had none at
 * all.
 *
 * This pins the structural property: every admin component that can perform a
 * refusal or a removal routes it through the one shared ConfirmAction control.
 * A source scan, not a render test, because the property is about which control
 * a decision is wired to — rendering each queue would need every action module,
 * router and transition mocked to observe the same fact the import states.
 */

const ADMIN_COMPONENTS = join(__dirname, "../../components/admin");

/**
 * Components that own at least one irreversible decision. Each entry names the
 * verbs that must be behind a confirmation, so the list reads as the contract.
 */
const MUST_CONFIRM: Readonly<Record<string, readonly string[]>> = {
  "RefundQueue.tsx": ["approve", "deny"],
  "ClaimsReviewQueue.tsx": ["approve", "reject", "revoke"],
  "ModerationWorkbench.tsx": ["dismiss", "warn", "remove", "suspend"],
  "DeletionQueue.tsx": ["mark done", "reject"],
  "AdminListingsTable.tsx": ["hold", "reject"],
  "AdminListingCard.tsx": ["hold", "reject"],
  "AdminHostsTable.tsx": ["un-attest", "clear flag"],
  "NotificationOps.tsx": ["requeue", "cancel"],
  "SourcingConsole.tsx": ["live import"],
  "FoundingProgramConsole.tsx": ["save programme"],
};

function source(file: string): string {
  return readFileSync(join(ADMIN_COMPONENTS, file), "utf8");
}

/**
 * Source with comments removed.
 *
 * A negative source scan MUST run on comment-stripped text. The first version
 * of the window.confirm check below failed on a clean tree, because the files
 * that no longer USE window.confirm are exactly the files that now EXPLAIN why
 * they don't — four mentions in ConfirmAction's docblock and one in the comment
 * that replaced ModerationWorkbench's dialog. A prose ban is not a code ban.
 */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

describe("admin destructive-action confirmations", () => {
  it("the confirmation control exists and is exported from the barrel", () => {
    expect(
      readdirSync(ADMIN_COMPONENTS).includes("ConfirmAction.tsx"),
    ).toBe(true);
    expect(source("index.ts")).toContain("ConfirmAction");
  });

  it.each(Object.entries(MUST_CONFIRM))(
    "%s routes its irreversible verbs (%s) through ConfirmAction",
    (file) => {
      expect(source(file)).toContain("ConfirmAction");
    },
  );

  /**
   * One confirmation mechanism, not four. `window.confirm` is unstyleable,
   * blocks the main thread, cannot be tested without stubbing a global, and —
   * the reason it actually matters here — browsers suppress it after repeated
   * use, so a moderator working a long queue can silently lose the guard.
   */
  it("no admin surface uses window.confirm", () => {
    const offenders = readdirSync(ADMIN_COMPONENTS)
      .filter((name) => name.endsWith(".tsx"))
      .filter((name) => /window\.confirm\s*\(|(?<![.\w])confirm\s*\(/.test(code(name)));
    expect(offenders).toEqual([]);
  });

  /** The comment-stripper must not neuter the check it enables. */
  it("the window.confirm scan still detects a real call (negative control)", () => {
    const stripped = "/* window.confirm is bad */\nif (window.confirm('x')) go();";
    const asCode = stripped
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    expect(/window\.confirm\s*\(/.test(asCode)).toBe(true);
    expect(asCode).not.toContain("is bad");
  });

  /**
   * The confirm step must state a CONSEQUENCE, not ask a bare "are you sure".
   * A prompt that carries no information trains the operator to click through
   * it, which is worse than no prompt because it costs a click and buys
   * nothing.
   */
  it("the control requires a consequence sentence, not a bare confirmation", () => {
    const control = source("ConfirmAction.tsx");
    expect(control).toMatch(/readonly question:\s*string/);
    expect(control).toContain("{question}");
    // No "OK"-style default that would let a call site skip saying the verb.
    expect(control).toMatch(/readonly confirmLabel:\s*string/);
    expect(control).not.toMatch(/confirmLabel\s*=\s*["']OK["']/);
  });

  /**
   * The gate has to survive the panel being open. Each row owns its own open
   * state, so a caller that disables every row while one action is in flight
   * must have that respected on the confirm button too — otherwise an operator
   * can open panel B, confirm A, and still fire B mid-flight.
   */
  it("the confirm step honours the caller's disabled condition", () => {
    const control = code("ConfirmAction.tsx");
    // The JSX attribute (`data-confirm-primary=""`), not the focus effect's
    // `querySelector("[data-confirm-primary]")` — which appears first in the
    // file and, matched instead, made this assertion inspect a span of source
    // containing no `disabled=` at all.
    const marker = control.indexOf('data-confirm-primary=""');
    expect(marker).toBeGreaterThan(-1);

    // The confirm button's own disabled prop is the last one before the marker
    // that identifies it. It must gate on `disabled`, not on `busy` alone.
    const beforeMarker = control.slice(0, marker);
    const lastDisabled = beforeMarker.lastIndexOf("disabled=");
    expect(beforeMarker.slice(lastDisabled)).toContain("disabled={disabled || busy}");
  });

  /**
   * Rendered behaviour, not just source shape. The control's whole a11y story
   * is that the trigger is a real button carrying the verb AND its subject —
   * a screen-reader user hearing "Reject" from a queue of nine listings learns
   * nothing about which one.
   */
  describe("the rendered trigger", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmAction, {
        label: "Reject",
        confirmLabel: "Confirm rejection",
        question: "Reject this claim? The claimant is told it was not accepted.",
        subject: "claim on Glacier Orchard",
        onConfirm: () => {},
      }),
    );

    it("is a real button, not a div with a click handler", () => {
      expect(html).toMatch(/<button[^>]*type="button"/);
    });

    it("names both the verb and the subject", () => {
      expect(html).toContain('aria-label="Reject: claim on Glacier Orchard"');
    });

    it("shows the verb, and does NOT leak the confirm step before it is opened", () => {
      expect(html).toContain("Reject");
      expect(html).not.toContain("Confirm rejection");
      expect(html).not.toContain("The claimant is told");
    });

    it("carries the danger tone by default", () => {
      expect(html).toContain('data-tone="deny"');
    });
  });

  /**
   * Density must not shrink the hit area. The admin scope tightens spacing and
   * type; the confirm buttons keep a 40px floor so the guard does not become a
   * thing operators mis-click past.
   */
  it("confirm-step controls keep a 40px minimum height", () => {
    const css = readFileSync(
      join(ADMIN_COMPONENTS, "ConfirmAction.module.css"),
      "utf8",
    );
    expect(css).toMatch(/\.buttons\s*>\s*\*\s*\{[^}]*min-height:\s*40px/);
  });

  /**
   * Negative control: the scan must be able to fail. If `source()` silently
   * returned "" the assertions above would all pass vacuously.
   */
  it("the scanner can tell a confirmed surface from an unconfirmed one", () => {
    // AdminApplicationsTable is read-only by design — it performs no decision,
    // so it legitimately has no ConfirmAction. If it ever gains one, it has
    // gained a mutation and belongs in MUST_CONFIRM above.
    expect(source("AdminApplicationsTable.tsx")).not.toContain("ConfirmAction");
    expect(source("RefundQueue.tsx").length).toBeGreaterThan(100);
  });
});
