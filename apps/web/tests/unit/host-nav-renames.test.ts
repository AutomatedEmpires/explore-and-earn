import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { routing } from "../../i18n/routing";
import { HOST_NAV_GROUPS } from "../../components/host/hostNav";

/**
 * D17 host navigation: route renames, rail regrouping, and the compatibility
 * that keeps existing links alive.
 *
 * The renames are the risky part of this phase. `/host/invites` is not just a
 * bookmark — it is baked into a LIVE Stripe checkout `success_url`, so a
 * session created before the deploy returns to it after the deploy. And
 * `/host/assistant` is the kind of URL a host emails to a colleague. Both are
 * therefore permanent redirects, and this file asserts that the redirect, the
 * new directory, and every internal reference moved together.
 *
 * Source-scanning rather than rendering: this repo has no DOM test harness, and
 * what is being pinned here is structure and wiring, which the source states
 * directly.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");
const exists = (relative: string) => existsSync(new URL(relative, webRoot));

const nextConfig = read("next.config.ts");

describe("route renames — the new routes exist", () => {
  it.each([
    ["app/[locale]/(host)/host/outreach/page.tsx", "Outreach"],
    ["app/[locale]/(host)/host/coach/page.tsx", "Recruiting Coach"],
  ])("%s ships and titles itself %s", (file, title) => {
    expect(exists(file), `${file} is missing`).toBe(true);
    expect(read(file)).toContain(title);
  });

  it.each([
    "app/[locale]/(host)/host/invites/page.tsx",
    "app/[locale]/(host)/host/assistant/page.tsx",
  ])("no longer serves the old route %s", (file) => {
    expect(exists(file), `${file} should have been renamed away`).toBe(false);
  });
});

describe("route renames — permanent redirects", () => {
  it.each([
    ["/host/invites", "/host/outreach"],
    ["/host/assistant", "/host/coach"],
  ])("redirects %s to %s", (from, to) => {
    // The redirect entries are object literals; assert the pairing, not just
    // that both strings appear somewhere in the file.
    const pattern = new RegExp(
      `source:\\s*"${from}",\\s*\\n\\s*destination:\\s*"${to}",\\s*\\n\\s*permanent:\\s*true`,
    );
    expect(nextConfig).toMatch(pattern);
  });

  it("also redirects the locale-prefixed form", () => {
    expect(nextConfig).toContain("/:locale(${LOCALE_PATTERN})/host/invites");
    expect(nextConfig).toContain("/:locale(${LOCALE_PATTERN})/host/assistant");
  });

  /**
   * The locale alternation in next.config is a hand-maintained copy of
   * routing.locales (next.config cannot import the app's module graph). If a
   * locale is added to routing and not here, the prefixed redirect silently
   * stops covering it — a 404 for exactly the users a new locale was added for.
   */
  it("keeps LOCALE_PATTERN in sync with routing.locales", () => {
    const declared = /const LOCALE_PATTERN = "([^"]+)"/.exec(nextConfig)?.[1];
    expect(declared, "LOCALE_PATTERN is not declared in next.config.ts").toBeDefined();
    expect(declared!.split("|").sort()).toEqual([...routing.locales].sort());
  });

  it("leaves no internal link pointing at a renamed route", () => {
    for (const file of [
      "components/host/HostShell.tsx",
      "components/dev/surfaces.ts",
      "components/host/HostPipelineBoard.tsx",
      "services/stripe/index.ts",
      "app/actions/invites.ts",
      "app/[locale]/(host)/host/applicants/page.tsx",
    ]) {
      const source = read(file);
      expect(source, `${file} still links to /host/invites`).not.toContain(
        '"/host/invites',
      );
      expect(source, `${file} still links to /host/assistant`).not.toContain(
        '"/host/assistant',
      );
    }
  });

  it("returns the Stripe invite-credit purchase to the renamed surface", () => {
    expect(read("services/stripe/index.ts")).toContain(
      'absoluteAppUrl("/host/outreach?credits=1")',
    );
  });
});

describe("host rail groups (D17)", () => {
  const headings = HOST_NAV_GROUPS.map((group) => group.heading);
  const labelsIn = (heading: string) =>
    HOST_NAV_GROUPS.find((group) => group.heading === heading)?.items.map(
      (item) => item.label,
    ) ?? [];

  it("ships exactly three groups, in order", () => {
    expect(headings).toEqual(["Primary", "Business", "Support"]);
  });

  it("orders Primary along the recruiting loop", () => {
    expect(labelsIn("Primary")).toEqual([
      "Overview",
      "Listings",
      "Applicants",
      "Outreach",
      "Messages",
      "Announcements",
      "Analytics",
    ]);
  });

  it("puts the company and the money under Business", () => {
    expect(labelsIn("Business")).toEqual(["Employer profile", "Billing"]);
  });

  it("puts help under Support", () => {
    expect(labelsIn("Support")).toEqual([
      "Recruiting Coach",
      "Settings",
      "Help",
    ]);
  });

  /**
   * D17 lists "Team" under Business. There is no /host/team route — team
   * membership is edited inside Settings, and D13 keeps team seats out of every
   * claim until access exists. A rail entry is a promise that a destination is
   * there; this asserts we did not make one we cannot keep.
   */
  it("omits Team while no team route exists", () => {
    const allHrefs = HOST_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.href),
    );
    expect(allHrefs).not.toContain("/host/team");
    expect(exists("app/[locale]/(host)/host/team")).toBe(false);
  });

  it("renames the two sections D17 renamed, and only re-labels invites", () => {
    const allLabels = HOST_NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => item.label),
    );
    expect(allLabels).not.toContain("Invites");
    expect(allLabels).not.toContain("Assistant");
    // "Invite" survives as the unit and the metered credit inside Outreach.
    expect(read("app/[locale]/(host)/host/outreach/page.tsx")).toContain(
      "Invites sent",
    );
  });

  it("does not duplicate a rail destination in the top bar", () => {
    const shell = read("components/host/HostShell.tsx");
    const railHrefs = new Set(
      HOST_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
    );
    // The top bar's links, in render order after the rail is configured.
    const topBar = shell.slice(shell.indexOf("<header className={styles.topbar}>"));
    const topHrefs = [...topBar.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const duplicated = topHrefs.filter(
      (href) => railHrefs.has(href) && href !== "/host",
    );
    // "/host" is the brand's home link, not a nav item; /host/messages and
    // /host/profile are reachable from the bar as the messages + account
    // affordances D17 explicitly keeps there.
    expect(duplicated.sort()).toEqual(["/host/messages", "/host/profile"]);
  });
});
