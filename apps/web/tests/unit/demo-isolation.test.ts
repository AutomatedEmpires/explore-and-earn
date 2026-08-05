import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HOST_DEMO_ROUTE_MAP,
  SEEKER_DEMO_ROUTE_MAP,
} from "../../components/demo/demoRoutes";

/**
 * Structural guardrails for the public walkthroughs.
 *
 * These routes render production-shaped UI around fictional records, but they
 * must never acquire production capabilities. The scan intentionally follows
 * both route trees and the shared full-fidelity components so a new nested page
 * is protected without being added to a hand-maintained allowlist.
 */

const APPS_WEB = fileURLToPath(new URL("../../", import.meta.url));
const HOST_DEMO_ROOT = join(APPS_WEB, "app/[locale]/for-hosts/demo");
const SEEKER_DEMO_ROOT = join(APPS_WEB, "app/[locale]/for-seekers/demo");
const FULL_FIDELITY_ROOT = join(
  APPS_WEB,
  "components/demo/full-fidelity",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      walk(path, out);
    } else if (/\.(?:ts|tsx)$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

function readSource(relativePath: string): string {
  return readFileSync(join(APPS_WEB, relativePath), "utf8");
}

const HOST_DEMO_FILES = walk(HOST_DEMO_ROOT);
const SEEKER_DEMO_FILES = walk(SEEKER_DEMO_ROOT);
const FULL_FIDELITY_FILES = walk(FULL_FIDELITY_ROOT);
const ALL_WALKTHROUGH_FILES = [
  ...HOST_DEMO_FILES,
  ...SEEKER_DEMO_FILES,
  ...FULL_FIDELITY_FILES,
];

describe("full-fidelity walkthrough isolation", () => {
  it("covers both public route trees and the shared walkthrough components", () => {
    expect(HOST_DEMO_FILES.length).toBeGreaterThan(10);
    expect(SEEKER_DEMO_FILES.length).toBeGreaterThan(10);
    expect(FULL_FIDELITY_FILES.length).toBeGreaterThan(4);
  });

  it.each([
    [
      "an application action import",
      /(?:from\s+|import\s*\()\s*["'][^"']*app\/actions(?:\/|["'])/,
    ],
    ["Clerk", /@clerk\//i],
    ["a Supabase client", /@supabase\/|\bsupabase(?:Client|Server|Browser|Admin)\b/i],
    [
      "a Stripe client",
      /(?:from\s+|import\s*\()\s*["'][^"']*stripe[^"']*["']|\bstripe\s*\./i,
    ],
    [
      "a Resend client",
      /(?:from\s+|import\s*\()\s*["'][^"']*resend[^"']*["']|\bresend\s*\./i,
    ],
    ["a service-role client", /\b(?:createServiceClient|serviceClient|serviceRole)\b/],
    ["a network fetch", /\bfetch\s*\(/],
    ["a persistence mutation", /\.(?:insert|update|upsert|delete)\s*\(/],
  ])("never uses %s", (_label, pattern) => {
    for (const file of ALL_WALKTHROUGH_FILES) {
      expect(
        pattern.test(readFileSync(file, "utf8")),
        relative(APPS_WEB, file),
      ).toBe(false);
    }
  });

  it("does not import the obsolete parallel demo workspace", () => {
    for (const file of ALL_WALKTHROUGH_FILES) {
      const source = readFileSync(file, "utf8");
      expect(source, relative(APPS_WEB, file)).not.toMatch(
        /(?:DemoWorkspaceNav|enterpriseDemo)/,
      );
    }
  });

  it("keeps every mutable walkthrough choice in sessionStorage", () => {
    const sessionModules = [
      "components/demo/full-fidelity/host/HostDemoSession.tsx",
      "components/demo/full-fidelity/seeker/DemoSeekerSession.tsx",
    ];

    for (const module of sessionModules) {
      const source = readSource(module);
      expect(source, module).toContain("window.sessionStorage");
      expect(source, module).not.toContain("window.localStorage");
    }

    for (const file of ALL_WALKTHROUGH_FILES) {
      expect(readFileSync(file, "utf8"), relative(APPS_WEB, file)).not.toMatch(
        /\blocalStorage\b/,
      );
    }
  });
});

describe("canonical shell ownership", () => {
  it("renders the host walkthrough through HostShell and its isolated route map", () => {
    const layout = readSource("app/[locale]/for-hosts/demo/layout.tsx");
    expect(layout).toContain("HostShell");
    expect(layout).toContain("HOST_DEMO_ROUTE_MAP");
    expect(layout).toContain("routeMap={HOST_DEMO_ROUTE_MAP}");
    expect(layout).toContain("demoMode");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
  });

  it("renders the seeker walkthrough through SeekerShell and its isolated route map", () => {
    const layout = readSource("app/[locale]/for-seekers/demo/layout.tsx");
    const shell = readSource(
      "components/demo/full-fidelity/seeker/DemoSeekerShell.tsx",
    );
    expect(layout).toContain("DemoSeekerShell");
    expect(shell).toContain("SeekerShell");
    expect(shell).toContain("SEEKER_DEMO_ROUTE_MAP");
    expect(shell).toContain("routeMap={SEEKER_DEMO_ROUTE_MAP}");
    expect(shell).toContain("demoMode");
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
  });
});

function pageForDestination(
  routeRoot: string,
  namespace: string,
  destination: string,
): string {
  const suffix = destination.slice(namespace.length).replace(/^\//, "");
  return suffix
    ? join(routeRoot, ...suffix.split("/"), "page.tsx")
    : join(routeRoot, "page.tsx");
}

describe("demo route maps", () => {
  it.each([
    ["host", HOST_DEMO_ROUTE_MAP, "/for-hosts/demo", HOST_DEMO_ROOT],
    ["seeker", SEEKER_DEMO_ROUTE_MAP, "/for-seekers/demo", SEEKER_DEMO_ROOT],
  ] as const)(
    "keeps every %s shell destination inside the demo and backed by a page",
    (_role, routeMap, namespace, routeRoot) => {
      for (const [canonical, destination] of Object.entries(routeMap)) {
        expect(destination, canonical).toMatch(
          new RegExp(`^${namespace.replaceAll("/", "\\/")}(?:/|$)`),
        );
        const page = pageForDestination(routeRoot, namespace, destination);
        expect(
          existsSync(page),
          `${canonical} maps to ${destination}, but ${relative(APPS_WEB, page)} does not exist`,
        ).toBe(true);
      }
    },
  );
});

describe("one canonical public host profile", () => {
  it.each([
    ["the live public route", "app/[locale]/host/[id]/page.tsx"],
    [
      "the host walkthrough",
      "components/demo/full-fidelity/host/HostDemoViews.tsx",
    ],
    [
      "the seeker walkthrough",
      "components/demo/full-fidelity/seeker/DemoSeekerExperience.tsx",
    ],
  ])("is rendered by PublicHostProfileView in %s", (_surface, file) => {
    expect(readSource(file)).toContain("PublicHostProfileView");
  });
});

describe("fixture direction", () => {
  const productionRouteRoots = [
    "app/[locale]/(host)",
    "app/[locale]/(seeker)",
    "app/[locale]/(admin)",
    "app/[locale]/host",
    "app/[locale]/listing",
  ];
  const demoImport = /components\/demo\/(?:full-fidelity|enterpriseDemo)|enterpriseDemo/;

  it.each(productionRouteRoots)(
    "does not import demo records under %s",
    (root) => {
      const files = walk(join(APPS_WEB, root));
      expect(files.length, `${root} unexpectedly has no source files`).toBeGreaterThan(0);
      for (const file of files) {
        expect(
          demoImport.test(readFileSync(file, "utf8")),
          relative(APPS_WEB, file),
        ).toBe(false);
      }
    },
  );
});
