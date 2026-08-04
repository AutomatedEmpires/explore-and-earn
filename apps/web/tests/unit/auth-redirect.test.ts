import { describe, expect, it } from "vitest";

import {
  REDIRECT_PARAM,
  RETURN_PARAM,
  resolveReturnPath,
  safeInternalRedirect,
  safeInternalRedirectFromOrigin,
  signInHref,
} from "../../lib/authRedirect";

/**
 * The post-auth return path is the product's only user-controlled redirect
 * target, and it reaches Clerk's forceRedirectUrl — which accepts ABSOLUTE
 * URLs. That combination is the textbook open-redirect shape, so the validator
 * is tested adversarially rather than illustratively: the interesting cases are
 * the ones a URL parser can be talked into accepting.
 */
describe("safeInternalRedirect", () => {
  it.each([
    "/claim/00000000-0000-4000-8000-000000000001",
    "/host/messages?view=unread",
    "/onboarding/skills?source=resume#experience",
    "/community",
    "/community/photos",
    "/community/announcements?tab=hiring",
  ])("keeps an internal return path: %s", (candidate) => {
    expect(safeInternalRedirect(candidate)).toBe(candidate);
  });

  it.each([
    // Absolute — the whole point of the check.
    ["absolute https", "https://attacker.example"],
    ["absolute https with a convincing path", "https://attacker.example/community"],
    ["absolute http", "http://attacker.example"],
    // Protocol-relative: no scheme, still off-origin.
    ["protocol-relative", "//attacker.example"],
    ["protocol-relative with path", "//attacker.example/community"],
    // Backslashes: the WHATWG parser folds "\" to "/" for special schemes, so
    // every one of these resolves to a HOST, not a path.
    ["single backslash", "/\\attacker.example"],
    ["double backslash", "\\\\attacker.example"],
    ["mixed slash and backslash", "/\\/attacker.example"],
    ["backslash mid-path", "/community\\@attacker.example"],
    // Traversal and encoded traversal.
    ["dot traversal", "/..//attacker.example"],
    ["encoded traversal", "/%2e%2e//attacker.example"],
    ["half-encoded traversal", "/.%2e//attacker.example"],
    // Non-http schemes.
    ["javascript", "javascript:alert(1)"],
    ["data", "data:text/html,<script>alert(1)</script>"],
    ["mailto", "mailto:someone@attacker.example"],
    // Not a path at all.
    ["schemeless host", "host/messages"],
    ["bare relative", "community"],
    ["empty", ""],
    // Control characters, which some parsers strip before resolving.
    ["leading newline", "\n//attacker.example"],
    ["embedded newline", "/comm\nunity"],
    ["embedded tab", "/comm\tunity"],
    ["header injection attempt", "/community\r\nSet-Cookie: a=b"],
    ["null byte", "/community\u0000"],
    // Userinfo trick: a "path" that is really credentials plus a host.
    ["userinfo host", "/\\user@attacker.example"],
  ])("rejects %s", (_label, candidate) => {
    expect(safeInternalRedirect(candidate)).toBeUndefined();
  });

  it("rejects undefined", () => {
    expect(safeInternalRedirect(undefined)).toBeUndefined();
  });

  /**
   * NEGATIVE CONTROL FOR THE TEST ITSELF. If the validator were replaced with
   * `() => undefined`, every rejection above would still pass and the suite
   * would report green on a completely broken funnel. At least one acceptance
   * has to be asserted for the rejections to mean anything.
   */
  it("is not simply refusing everything", () => {
    expect(safeInternalRedirect("/seek?category=farm")).toBe("/seek?category=farm");
  });
});

describe("safeInternalRedirectFromOrigin", () => {
  const origin = "https://exploreandearn.com";

  it("normalizes Clerk's same-origin absolute redirect to an internal path", () => {
    expect(
      safeInternalRedirectFromOrigin(
        "https://exploreandearn.com/team/accept?token=invite-test#join",
        origin,
      ),
    ).toBe("/team/accept?token=invite-test#join");
  });

  it("keeps an already-internal path unchanged", () => {
    expect(safeInternalRedirectFromOrigin("/saved?view=recent", origin)).toBe(
      "/saved?view=recent",
    );
  });

  it.each([
    ["off-origin", "https://attacker.example/saved"],
    ["lookalike subdomain", "https://exploreandearn.com.attacker.example/saved"],
    ["different subdomain", "https://www.exploreandearn.com/saved"],
    ["different port", "https://exploreandearn.com:444/saved"],
    ["credentialed", "https://user@exploreandearn.com/saved"],
    ["protocol-relative", "//exploreandearn.com/saved"],
    ["backslash", "https:\\exploreandearn.com\\saved"],
    ["control character", "https://exploreandearn.com/sa\nved"],
  ])("rejects a %s absolute target", (_label, candidate) => {
    expect(safeInternalRedirectFromOrigin(candidate, origin)).toBeUndefined();
  });
});

describe("resolveReturnPath", () => {
  it("prefers the spec-named returnTo over the legacy redirect_url", () => {
    expect(
      resolveReturnPath({
        [RETURN_PARAM]: "/community",
        [REDIRECT_PARAM]: "/seek",
      }),
    ).toBe("/community");
  });

  it("falls back to redirect_url when returnTo is absent", () => {
    expect(resolveReturnPath({ [REDIRECT_PARAM]: "/host/messages" })).toBe(
      "/host/messages",
    );
  });

  /**
   * An unsafe value must not fall through to the OTHER parameter. If it did, an
   * attacker could put a harmless value in the name a reviewer reads while the
   * dangerous one is the value actually consumed — parameter shadowing.
   */
  it("does not fall through to redirect_url when returnTo is present but unsafe", () => {
    expect(
      resolveReturnPath({
        [RETURN_PARAM]: "https://attacker.example",
        [REDIRECT_PARAM]: "/seek",
      }),
    ).toBeUndefined();
  });

  it("returns undefined when neither is present", () => {
    expect(resolveReturnPath({})).toBeUndefined();
  });
});

describe("signInHref", () => {
  it("carries the role and the validated return path", () => {
    expect(signInHref("seeker", "/community")).toBe(
      "/sign-in?role=seeker&returnTo=%2Fcommunity",
    );
  });

  it("encodes a deep link with a query string", () => {
    const href = signInHref("seeker", "/community/announcements?tab=hiring");
    expect(href).toContain("role=seeker");
    expect(new URLSearchParams(href.split("?")[1]).get(RETURN_PARAM)).toBe(
      "/community/announcements?tab=hiring",
    );
  });

  /**
   * DROPPED, NOT PASSED THROUGH. There is no argument ordering that produces a
   * sign-in link pointing off-origin: an unsafe return path yields a href with
   * no return parameter at all and the visitor lands on the role default.
   */
  it("drops an unsafe return path rather than emitting it", () => {
    expect(signInHref("seeker", "https://attacker.example")).toBe(
      "/sign-in?role=seeker",
    );
    expect(signInHref("host", "//attacker.example")).toBe("/sign-in?role=host");
    expect(signInHref("seeker", "/\\attacker.example")).toBe(
      "/sign-in?role=seeker",
    );
  });

  it("omits the parameter entirely with no return path", () => {
    expect(signInHref("host")).toBe("/sign-in?role=host");
  });
});
