import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import {
  SeekerSettingsForm,
  type SeekerSettingsFormProps,
} from "../../components/seeker/SeekerSettingsForm";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");

describe("truthful seeker settings form", () => {
  it("starts idle with the real form values and no fabricated success", () => {
    const action: NonNullable<SeekerSettingsFormProps["action"]> = () =>
      Promise.resolve({ ok: true });
    const html = renderToStaticMarkup(
      createElement(
        SeekerSettingsForm,
        {
          action,
          submitLabel: "Save availability",
          savingLabel: "Saving…",
          savedMessage: "Availability saved.",
          validationError: "Check the values.",
          unauthenticatedError: "Sign in again.",
          temporarilyUnavailableError: "Try again.",
        },
        createElement("input", {
          name: "availability_start",
          defaultValue: "2026-09-01",
        }),
      ),
    );

    expect(html).toContain("<form");
    expect(html).toContain('method="post"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain("<fieldset");
    expect(html).toContain('value="2026-09-01"');
    expect(html).toContain(">Save availability</button>");
    expect(html).not.toContain("Availability saved.");
    expect(html).not.toContain('role="alert"');
  });

  it("renders an explicit actionless preview contract without claiming a save", () => {
    const html = renderToStaticMarkup(
      createElement(
        SeekerSettingsForm,
        {
          preview: {
            id: "schedule",
            notice: "Preview only — changes on this page are not saved.",
            savedMessage: "Preview updated. No settings were saved.",
          },
          ariaLabel: "General availability",
          submitLabel: "Save availability",
          savingLabel: "Saving…",
          savedMessage: "Availability saved.",
          validationError: "Check the values.",
          unauthenticatedError: "Sign in again.",
          temporarilyUnavailableError: "Try again.",
        },
        createElement("input", { name: "availability_start" }),
      ),
    );

    expect(html).toContain('aria-label="General availability"');
    expect(html).toContain('data-dev-fixture="schedule"');
    expect(html).toContain("Preview only — changes on this page are not saved.");
    expect(html).not.toContain("Preview updated. No settings were saved.");
    expect(html).not.toContain("Availability saved.");
  });

  it("pins synchronous guarding, focus-safe pending state, and truthful feedback", () => {
    const source = read("components/seeker/SeekerSettingsForm.tsx");
    const guard = source.indexOf("inFlight.current = true");
    const invoke = source.indexOf("await action(formData)");
    const fieldsetEnd = source.indexOf("</fieldset>");
    const actions = source.indexOf('<div className={styles.actions}>');

    expect(source).toContain('"use client"');
    expect(source).toContain("if (isSaving || inFlight.current) return");
    expect(guard).toBeGreaterThan(-1);
    expect(invoke).toBeGreaterThan(guard);
    expect(source).toContain("new FormData(event.currentTarget)");
    expect(source).toContain("result.ok");
    expect(source).toContain('error: "temporarily_unavailable"');
    expect(source).toContain("disabled={isSaving}");
    expect(source).toContain("aria-disabled={isSaving}");
    expect(actions).toBeGreaterThan(fieldsetEnd);
    expect(source).toContain("aria-busy={isSaving}");
    expect(source).toContain('role="status"');
    expect(source).toContain('role="alert"');
    expect(source).not.toContain(".reset(");
    expect(source).not.toContain("router.refresh");
  });
});

describe("schedule and travel persistence surfaces", () => {
  const schedule = read("app/[locale]/(seeker)/schedule/page.tsx");
  const travel = read("app/[locale]/(seeker)/travel/page.tsx");

  it("uses strict readers and never substitutes a flexible default", () => {
    expect(schedule).toContain("getSeekerAvailabilityResult");
    expect(schedule).not.toMatch(/\bgetSeekerAvailability\(/);
    expect(schedule).toContain("availabilityResult.ok");
    expect(schedule).toContain("availability.loadError.title");
    expect(schedule).toContain("availabilityStatus ?? \"\"");
    expect(schedule).toContain('<option value="">');
    expect(schedule).not.toContain('?? "flexible"');

    expect(travel).toContain("getSeekerTravelPrefsResult");
    expect(travel).not.toMatch(/\bgetSeekerTravelPrefs\(/);
    expect(travel).toContain("travelResult.ok");
    expect(travel).toContain("loadError.title");
    expect(travel).toContain("travelReadiness ?? \"\"");
    expect(travel).toContain('<option value="">');
    expect(travel).not.toContain('?? "flexible"');
  });

  it("passes both actions through the shared truthful-state component", () => {
    for (const [source, action, fixture, previewKey] of [
      [schedule, "updateScheduleAction", "schedule", "availability.preview"],
      [travel, "updateTravelAction", "travel", "preview"],
    ] as const) {
      expect(source).toContain("<SeekerSettingsForm");
      expect(source).toContain(`: { action: ${action} })`);
      expect(source).toContain(`id: "${fixture}" as const`);
      expect(source).toContain(`notice: t("${previewKey}.notice")`);
      expect(source).toContain(`savedMessage: t("${previewKey}.saved")`);
      expect(source).toContain("savingLabel=");
      expect(source).toContain("savedMessage=");
      expect(source).toContain("validationError=");
      expect(source).toContain("unauthenticatedError=");
      expect(source).toContain("temporarilyUnavailableError=");
    }
  });

  it("short-circuits exact-role fixtures before Clerk or database reads", () => {
    for (const [source, reader] of [
      [schedule, "getSeekerAvailabilityResult(token"],
      [travel, "getSeekerTravelPrefsResult(token"],
    ] as const) {
      const fixtureBranch = source.indexOf("if (isDevFixture)");
      const authCall = source.indexOf("await auth()", fixtureBranch);
      const readerCall = source.indexOf(reader, fixtureBranch);

      expect(source).toContain('const isDevFixture = devRole === "seeker"');
      expect(source).toContain("if (devRole !== null) return signedOutState");
      expect(fixtureBranch).toBeGreaterThan(-1);
      expect(authCall).toBeGreaterThan(fixtureBranch);
      expect(readerCall).toBeGreaterThan(authCall);
    }
  });

  it.each([
    "components/seeker/SchedulePanel.module.css",
    "components/seeker/TravelPanel.module.css",
  ])("contains form controls at phone widths in %s", (path) => {
    const css = read(path);

    expect(css).toMatch(
      /\.form\s*{[^}]*box-sizing:\s*border-box;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;/s,
    );
    expect(css).toMatch(
      /\.input,\s*\.select\s*{[^}]*box-sizing:\s*border-box;[^}]*width:\s*100%;[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*min-height:\s*44px;/s,
    );
  });

  it("keeps shared actions and feedback wrap-safe", () => {
    const css = read("components/seeker/SeekerSettingsForm.module.css");

    expect(css).toMatch(/\.fieldset\s*{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.actions\s*{[^}]*flex-wrap:\s*wrap;[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/overflow-wrap:\s*anywhere;/);
  });
});
