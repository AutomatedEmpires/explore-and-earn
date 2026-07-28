import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { RETURN_PARAM, safeInternalRedirect, signInHref } from "../../lib/authRedirect";
import { COMMUNITY_ROOT, isCommunityPath } from "../../lib/communityRoutes";

/**
 * V2 D18 — Community became an AUTHENTICATED SEEKER SPACE.
 *
 * WHAT WAS ACTUALLY WRONG BEFORE. /community was never in the middleware's
 * public matcher, so it was already auth-required — but nothing owned WHAT a
 * signed-out visitor got, and Clerk's auth.protect() answers that question two
 * different ways:
 *
 *   * a document request went to `signInUrl`, which with no
 *     NEXT_PUBLIC_CLERK_SIGN_IN_URL configured is Clerk's hosted Account Portal
 *     — off-domain, no role, no idea where the visitor was heading;
 *   * everything else (crawlers, unfurlers, curl, fetch) got notFound(), the
 *     `x-clerk-auth-reason: protect-rewrite` response that reads as a plain 404.
 *
 * That is the same defect that made /swipe and /for-hosts/demo look "missing"
 * in production while their branch builds passed, and a prerender cannot catch
 * it: middleware does not run during prerender.
 *
 * These tests pin the DECISION (a role-shaped, path-exact redirect) and the
 * INVARIANT that nothing on the path writes before the visitor is authenticated.
 */

const webRoot = new URL("../../", import.meta.url);
const read = (relative: string) => readFileSync(new URL(relative, webRoot), "utf8");

/**
 * Source with comments removed.
 *
 * Needed because the interesting assertions here are about what the code DOES,
 * and this codebase documents its refusals in prose — access.ts explains at
 * length that it never calls ensure_my_seeker_profile, which a naive
 * `not.toContain("ensure_my_seeker_profile")` reads as the call itself. The
 * same trap has bitten the G50 ratchet (it scans comments too). Strip first,
 * then assert on code.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const COMMUNITY_DIR = new URL("app/[locale]/(seeker)/community/", webRoot);

describe("the Community path matcher is wildcard-aware", () => {
  it.each([
    "/community",
    "/community/photos",
    "/community/announcements",
    "/community/announcements/some-future-id",
  ])("matches %s", (path) => {
    expect(isCommunityPath(path)).toBe(true);
  });

  /**
   * A SEGMENT boundary, not a string prefix. Auth-walling a sibling route whose
   * name merely starts with "community" would be a silent outage on a public
   * page, and prefix matching is exactly how that happens.
   */
  it.each([
    "/community-guidelines",
    "/communityfeed",
    "/seek",
    "/",
  ])("does not match %s", (path) => {
    expect(isCommunityPath(path)).toBe(false);
  });

  it("names the root once, and the root matches itself", () => {
    expect(COMMUNITY_ROOT).toBe("/community");
    expect(isCommunityPath(COMMUNITY_ROOT)).toBe(true);
  });
});

/**
 * MIDDLEWARE ROUTE DECISIONS.
 *
 * Read from source rather than executed: middleware.ts imports
 * @clerk/nextjs/server and next-intl at module scope, and standing up both to
 * assert a routing table would test the mocks. What has to be true is
 * structural, and structural facts are exactly what source pinning can hold.
 */
describe("middleware sends a signed-out Community visitor to a seeker sign-in", () => {
  const middleware = read("middleware.ts");

  it("routes every Community path through the shared matcher", () => {
    expect(middleware).toContain('from "./lib/communityRoutes"');
    expect(middleware).toContain("if (isCommunityPath(pathname)) {");
    expect(middleware).toContain('return { role: "seeker", param: RETURN_PARAM };');
  });

  it("decides BEFORE auth.protect(), so the answer is a redirect and not a 404", () => {
    const funnelCheck = middleware.indexOf("const funnel = protectedFunnel(");
    const protectCall = middleware.indexOf("await auth.protect()");
    expect(funnelCheck).toBeGreaterThan(-1);
    expect(protectCall).toBeGreaterThan(-1);
    expect(funnelCheck).toBeLessThan(protectCall);
  });

  it("carries the EXACT requested path, query string included", () => {
    expect(middleware).toContain(
      "`${request.nextUrl.pathname}${request.nextUrl.search}`",
    );
    expect(middleware).toContain("const safePath = safeInternalRedirect(requestedPath)");
    expect(middleware).toContain("url.searchParams.set(funnel.param, safePath)");
  });

  it("applies the same decision in the keyless fallback branch", () => {
    // Two middleware implementations exist (Clerk configured / not). A guard
    // present in only one of them is a guard that stops existing the moment the
    // keys are missing — which is precisely the local/preview case.
    expect(middleware.match(/const funnel = protectedFunnel\(/g)).toHaveLength(2);
  });

  it("scrubs an unsafe or duplicated return path off both auth entry URLs", () => {
    expect(middleware).toContain("const unsafe = RETURN_PARAM_NAMES.filter");
    expect(middleware).toContain("if (candidates.length > 1) return true;");
    expect(middleware).toContain("for (const name of unsafe) url.searchParams.delete(name)");
  });

  it("keeps /community OUT of the public matcher", () => {
    const publicBlock = middleware.slice(
      middleware.indexOf("const isPublicRoute = createRouteMatcher(["),
      middleware.indexOf("type FunnelRole"),
    );
    expect(publicBlock).not.toContain('"/community"');
    expect(publicBlock).not.toContain('"/community(.*)"');
  });

  /**
   * The other half of D18: the seeker DOOR must be public, with the wildcard
   * form. An exact match here is how /for-hosts/demo 404'd in production.
   */
  it("makes /for-seekers public with a wildcard, like /for-hosts", () => {
    expect(middleware).toContain('"/for-seekers(.*)"');
  });
});

describe("the route decision, computed", () => {
  /**
   * The href the middleware builds, reconstructed from the same helpers it
   * uses. This is the assertion a curl against the dev server confirms.
   */
  it.each([
    ["/community", "/sign-in?role=seeker&returnTo=%2Fcommunity"],
    ["/community/photos", "/sign-in?role=seeker&returnTo=%2Fcommunity%2Fphotos"],
  ])("%s → %s", (path, expected) => {
    expect(signInHref("seeker", path)).toBe(expected);
  });

  it("keeps a deep link's query string in the return path", () => {
    const href = signInHref("seeker", "/community/announcements?tab=hiring");
    const returned = new URLSearchParams(href.split("?")[1]).get(RETURN_PARAM);
    expect(returned).toBe("/community/announcements?tab=hiring");
    expect(isCommunityPath((returned ?? "").split("?")[0] ?? "")).toBe(true);
  });

  it("refuses to build a sign-in link that leaves the origin", () => {
    expect(signInHref("seeker", "https://attacker.example/community")).toBe(
      "/sign-in?role=seeker",
    );
    expect(safeInternalRedirect("//attacker.example/community")).toBeUndefined();
  });
});

describe("the server-side Community gate", () => {
  const layout = read("app/[locale]/(seeker)/community/layout.tsx");
  const access = read("app/[locale]/(seeker)/community/access.ts");
  const gate = read("app/[locale]/(seeker)/community/CommunityJoinGate.tsx");

  it("redirects a signed-out visitor even if the matcher missed them", () => {
    expect(layout).toContain('if (access.state === "signed_out")');
    expect(layout).toContain('redirect(signInHref("seeker", COMMUNITY_ROOT))');
  });

  it("offers a signed-in visitor with no seeker profile an explicit choice", () => {
    expect(layout).toContain('access.state === "needs_seeker_profile"');
    expect(layout).toContain("<CommunityJoinGate");
    // A CHOICE, not a conversion: the primary action is a link the person
    // presses, and it goes to onboarding rather than to a mutation.
    expect(gate).toContain("/onboarding?returnTo=");
    expect(gate).toContain("Join as a seeker");
    expect(gate).toContain("Back to my host workspace");
  });

  it("keeps Community out of the search index now that it needs a login", () => {
    expect(layout).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(read("app/robots.txt/route.ts")).toContain('"Disallow: /community"');
  });

  /**
   * THE INVARIANT THAT MATTERS: no profile is created by visiting. The database
   * already refuses an anonymous ensure_my_seeker_profile (migration 073 grants
   * it to `authenticated` only, and the authorization matrix asserts the
   * refusal) — but a database refusing a write the product attempts is a
   * 500-shaped bug, not a design. The product must not attempt it.
   */
  it("performs no profile mutation anywhere in the gate", () => {
    for (const [name, source] of [
      ["layout.tsx", layout],
      ["access.ts", access],
      ["CommunityJoinGate.tsx", gate],
    ] as const) {
      const body = code(source);
      expect(body, `${name} must not create a seeker profile`).not.toContain(
        "ensure_my_seeker_profile",
      );
      expect(body, `${name} must not save a seeker profile`).not.toContain(
        "saveSeekerProfile",
      );
      expect(body, `${name} must not be a server action`).not.toContain(
        '"use server"',
      );
    }
  });

  /**
   * NEGATIVE CONTROL for the comment stripper above. If `code()` returned an
   * empty string — or stripped the whole file — every assertion in this block
   * would pass on a gate that creates profiles on sight.
   */
  it("still sees real code after comments are stripped", () => {
    expect(code(access)).toContain("resolveCommunityAccess");
    expect(code(access)).toContain("cachedSeekerProfile");
    // And the prose that motivated the stripper is genuinely there.
    expect(access).toContain("ensure_my_seeker_profile");
  });
});

/**
 * SOURCE PIN: every Community server action refuses an unauthenticated caller
 * before it touches anything.
 *
 * Enumerated from the module rather than spot-checked, so an action added
 * tomorrow is covered without anyone remembering to extend a list — the
 * "enumerated coverage" method, because a hand-written list of call sites is
 * only ever correct on the day it was written.
 */
describe("Community server actions require auth before any effect", () => {
  const actions = read("app/actions/community.ts");

  const exported = [
    ...actions.matchAll(/export async function (\w+Action)\s*\(/g),
  ].map((match) => match[1]);

  it("finds the actions at all (guards against a silent zero-case pass)", () => {
    expect(exported.length).toBeGreaterThanOrEqual(8);
  });

  /**
   * Effects, matched as CALLS rather than as substrings. "upload" appears in
   * `uploadCommunityPhotoAction` itself, so a bare substring search reports the
   * function's own name as an effect that precedes its auth check.
   */
  const EFFECT_CALLS = [
    /\binsert[A-Z]\w*\(/,
    /\bdelete[A-Z]\w*\(/,
    /\bupload[A-Z]\w*\(/,
    /\btoggle[A-Z]\w*\(/,
    /\bcreate[A-Z]\w*\(/,
    /\brevalidatePath\(/,
    /\bcheckRateLimitDistributed\(/,
  ];

  it.each(exported)("%s bails on an unauthenticated session", (name) => {
    const start = actions.indexOf(`export async function ${name}(`);
    const nextExport = actions.indexOf("\nexport ", start + 1);
    const whole = actions.slice(start, nextExport === -1 ? undefined : nextExport);
    // Skip the signature line so the function's own name is not scanned as an
    // effect, and strip comments for the same reason `code()` exists.
    const body = code(whole.slice(whole.indexOf("{")));

    // resolveAuth() returns null without BOTH a userId and a Supabase token.
    expect(body, `${name} does not resolve a session`).toContain("await resolveAuth()");
    expect(body, `${name} does not refuse an anonymous caller`).toMatch(
      /if \(!session\) return \{ ok: false, reason: "unauthenticated" \}/,
    );

    // The refusal must come FIRST. An action that reads, writes, or spends a
    // rate-limit budget and THEN checks the session has already done the thing
    // the check was supposed to prevent.
    const refusal = body.indexOf('reason: "unauthenticated"');
    expect(refusal, `${name} has no refusal to order against`).toBeGreaterThan(-1);
    for (const pattern of EFFECT_CALLS) {
      const match = pattern.exec(body);
      if (!match) continue;
      expect(
        match.index,
        `${name} runs ${match[0]} before refusing an anonymous caller`,
      ).toBeGreaterThan(refusal);
    }
  });

  it("resolves auth from Clerk, never from a caller-supplied id", () => {
    expect(actions).toContain('import { auth } from "@clerk/nextjs/server"');
    expect(actions).toMatch(/async function resolveAuth\(\)[\s\S]*?const \{ userId, getToken \} = await auth\(\)/);
  });
});

/**
 * The Community ROUTE tree carries no server action of its own — every mutation
 * goes through app/actions/community.ts, which the block above covers in full.
 * Asserting the absence keeps that true: a "use server" file dropped beside a
 * page would escape the enumeration entirely.
 */
describe("the Community route tree defines no server actions", () => {
  function walk(dir: URL): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir);
      if (entry.isDirectory()) out.push(...walk(child));
      else if (/\.tsx?$/.test(entry.name)) out.push(child.pathname);
    }
    return out;
  }

  const files = walk(COMMUNITY_DIR);

  it("finds the route files (guards against a zero-case pass)", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it.each(files)("%s is not a server-action module", (file) => {
    expect(readFileSync(file, "utf8")).not.toContain('"use server"');
  });
});
