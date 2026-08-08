import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resolveSeekerShellHref } from "../../components/seeker/SeekerShell";
import { signInHref } from "../../lib/authRedirect";

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) =>
  readFileSync(new URL(relative, webRoot), "utf8");

const shell = read("components/seeker/SeekerShell.tsx");
const layout = read("app/[locale]/(seeker)/layout.tsx");

describe("signed-out seeker chrome", () => {
  it.each(["/seek", "/swipe", "/map"])(
    "keeps public discovery destination %s direct",
    (href) => {
      expect(resolveSeekerShellHref(href, false)).toBe(href);
    },
  );

  it.each([
    "/home",
    "/profile",
    "/notifications",
    "/saved",
    "/applied",
    "/messages",
    "/settings",
  ])("role-shapes private destination %s through seeker sign-in", (href) => {
    expect(resolveSeekerShellHref(href, false)).toBe(
      signInHref("seeker", href),
    );
  });

  it("keeps authenticated destinations direct", () => {
    expect(resolveSeekerShellHref("/profile", true)).toBe("/profile");
    expect(resolveSeekerShellHref("/notifications", true)).toBe(
      "/notifications",
    );
  });

  it("preserves isolated demo destinations without auth redirects", () => {
    const routeMap = { "/profile": "/for-seekers/demo/profile" };
    expect(resolveSeekerShellHref("/profile", false, routeMap, true)).toBe(
      "/for-seekers/demo/profile",
    );
    expect(resolveSeekerShellHref("/unmapped", false, routeMap, true)).toBe(
      "/unmapped",
    );
  });

  it("gates role chrome and account coachmarks on actual auth state", () => {
    expect(shell).toContain("isAuthenticated={hasAuthenticatedChrome}");
    expect(shell).toContain("demoMode || !isAuthenticated ? null");
    expect(shell).toContain("data-seeker-shell");
    expect(shell).toContain(
      'data-authenticated={hasAuthenticatedChrome ? "true" : "false"}',
    );
    expect(shell).toContain(
      "userName={hasAuthenticatedChrome ? name : undefined}",
    );
    expect(shell).toContain(
      'data-account-state={hasAuthenticatedChrome ? "authenticated" : "guest"}',
    );
    expect(shell).toContain(
      'href={hasAuthenticatedChrome ? hrefFor("/home") : "/"}',
    );
  });
});

describe("seeker layout auth state", () => {
  it("treats the deterministic seeker bench as authenticated", () => {
    expect(layout).toContain("clerkUserId: DEV_USER_ID");
    expect(layout).toContain("isAuthenticated: true");
  });

  it("threads Clerk auth state into the client shell", () => {
    expect(layout).toContain("isAuthenticated={isAuthenticated}");
    expect(layout).toContain("isAuthenticated: clerkUserId !== null");
  });

  it("keeps authenticated chrome when token or optional data reads fail", () => {
    expect(layout.match(/return seekerShellFallback\(userId\);/g)).toHaveLength(2);
    expect(layout.match(/return seekerShellFallback\(\);/g)).toHaveLength(2);
  });
});
