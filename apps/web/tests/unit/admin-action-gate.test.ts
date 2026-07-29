import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * EVERY admin-reachable server action re-verifies admin server-side.
 *
 * The (admin)/layout.tsx gate protects the PAGES. It does not protect the
 * ACTIONS: a Next.js server action is an HTTP endpoint with a generated id, and
 * anyone who has ever loaded the admin bundle — or who reads an action id out of
 * a stale deploy — can POST to it directly without the layout ever running.
 * Rendering is not authorization. So each action must check for itself.
 *
 * Today they all do. That is precisely why this test exists: the property holds
 * right now, and nothing keeps it holding. The failure mode is a NEW action
 * wired into an admin component by someone who reasonably assumes the layout
 * already handled it, and there is no compiler error, no lint rule and no
 * runtime symptom for that — the hole is invisible until it is used.
 *
 * It reads sources rather than invoking the actions: the property is structural
 * ("the gate is reached before any work"), and asserting it behaviourally would
 * need every action's db, Stripe and Clerk dependencies mocked to prove
 * something the source states in two lines.
 *
 * TWO LAYERS, and the first is the one that catches the real regression:
 *   1. DERIVE which actions admin surfaces actually import, and pin that set.
 *      Wiring a new action into an admin component fails here until it is added
 *      to the pinned list — which is the moment to check that it gates.
 *   2. For each of those, prove a gate token is reached in its body (directly,
 *      or in the `…Impl` it immediately delegates to).
 */

const WEB = join(__dirname, "../..");
const ACTIONS_DIR = join(WEB, "app/actions");
const ADMIN_COMPONENTS = join(WEB, "components/admin");
const ADMIN_ROUTES = join(WEB, "app/[locale]/(admin)");

/**
 * Anything that proves the caller was checked against the founder allow-list.
 * `guardAdmin` / `requireAdmin` are file-local helpers that wrap one of the
 * first two; they are accepted because the helper bodies are themselves covered
 * by the "helpers really do gate" test below.
 */
const GATE_TOKENS = [
  "isAdminUserId",
  "isCurrentUserAdmin",
  "guardAdmin",
  "requireAdmin",
];

/**
 * The admin-reachable server actions, module → exported names.
 *
 * Derived from what admin surfaces import (see the pinned-set test). Update
 * this ONLY together with a check that the new action gates.
 */
const EXPECTED_ADMIN_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  "admin.ts": [
    "approveListingAction",
    "clearHostFlagAction",
    "holdListingAction",
    "rejectListingAction",
    "unverifyHostAction",
    "verifyHostAction",
  ],
  "accountDeletionAdmin.ts": ["resolveDeletionRequestAction"],
  "adminNotifications.ts": ["cancelDeliveryAction", "requeueDeliveryAction"],
  "foundingProgram.ts": ["saveFoundingProgramAction"],
  "listingClaims.ts": ["reviewClaimAction", "revokeClaimAction"],
  "moderation.ts": ["takeModerationActionAction"],
  "refunds.ts": ["resolveRefundAction"],
  "sourceImport.ts": [
    "getSourceReviewQueueAction",
    "listListingSourcesAction",
    "runSourceImportAction",
  ],
};

/** Every .tsx/.ts under an admin surface directory, recursively. */
function adminSources(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...adminSources(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Which server actions the admin surfaces import, as module → names.
 * Matches `import { a, b } from "…/app/actions/<module>"` across both the
 * admin components and the (admin) route segments.
 */
function importedAdminActions(): Record<string, string[]> {
  const found: Record<string, Set<string>> = {};
  const importRe =
    /import\s*\{([^}]+)\}\s*from\s*["'][^"']*app\/actions\/([A-Za-z0-9_]+)["']/g;

  for (const file of [
    ...adminSources(ADMIN_COMPONENTS),
    ...adminSources(ADMIN_ROUTES),
  ]) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(importRe)) {
      const moduleFile = `${match[2]}.ts`;
      const names = match[1]
        .split(",")
        .map((n) => n.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
        .filter((n) => n.endsWith("Action"));
      if (names.length === 0) continue;
      found[moduleFile] ??= new Set();
      for (const name of names) found[moduleFile].add(name);
    }
  }

  return Object.fromEntries(
    Object.entries(found).map(([k, v]) => [k, [...v].sort()]),
  );
}

/** Index of the character matching the bracket at `from`, or -1. */
function matchBracket(source: string, from: number, open: string, close: string) {
  let depth = 0;
  for (let i = from; i < source.length; i += 1) {
    if (source[i] === open) depth += 1;
    else if (source[i] === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The body of `async function <name>(…)`, by brace matching.
 *
 * Finding the body brace is fiddlier than it looks, and getting it wrong is
 * silent: an earlier version took the first `{` after the signature, which for
 * `): Promise<{ ok: boolean; error?: string }> {` is the RETURN TYPE's brace.
 * It then "matched" the type annotation, found no gate token inside it, and
 * reported five correctly-gated actions as ungated. A scanner that reads the
 * wrong span does not fail loudly — it just answers about the wrong text.
 *
 * So: skip the parameter list by paren-matching (a destructured or inline-typed
 * parameter has braces of its own), then take the first `{` that sits at
 * angle-bracket depth zero — everything between `)` and the body is type
 * syntax, where any braces are nested inside `<…>`.
 */
function functionBody(source: string, name: string): string | null {
  const signature = new RegExp(
    `(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\??\\s*[<(]`,
  );
  const at = source.search(signature);
  if (at < 0) return null;

  const paramsOpen = source.indexOf("(", at);
  if (paramsOpen < 0) return null;
  const paramsClose = matchBracket(source, paramsOpen, "(", ")");
  if (paramsClose < 0) return null;

  let angle = 0;
  for (let i = paramsClose + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "<") angle += 1;
    else if (ch === ">") angle -= 1;
    else if (ch === "{" && angle <= 0) {
      const end = matchBracket(source, i, "{", "}");
      return end < 0 ? null : source.slice(i, end + 1);
    }
  }
  return null;
}

function isGated(source: string, name: string): boolean {
  const body = functionBody(source, name);
  if (body === null) return false;
  if (GATE_TOKENS.some((token) => body.includes(token))) return true;

  // The wrapper/impl split used by app/actions/admin.ts and friends: the
  // exported action does nothing but call `<name>Impl`. Follow exactly one hop.
  for (const call of body.matchAll(/\b([A-Za-z0-9_]*Impl)\s*\(/g)) {
    const implBody = functionBody(source, call[1]);
    if (implBody && GATE_TOKENS.some((token) => implBody.includes(token))) {
      return true;
    }
  }
  return false;
}

describe("admin server-action authorization", () => {
  it("finds admin surfaces to scan (guards against a silently empty sweep)", () => {
    expect(adminSources(ADMIN_COMPONENTS).length).toBeGreaterThanOrEqual(10);
    expect(adminSources(ADMIN_ROUTES).length).toBeGreaterThanOrEqual(10);
  });

  /**
   * The living half. A new action wired into an admin component lands here
   * first, which is the only moment anyone is reliably thinking about its gate.
   */
  it("the set of actions admin surfaces import is exactly the pinned set", () => {
    expect(importedAdminActions()).toEqual(
      Object.fromEntries(
        Object.entries(EXPECTED_ADMIN_ACTIONS).map(([k, v]) => [k, [...v]]),
      ),
    );
  });

  it.each(
    Object.entries(EXPECTED_ADMIN_ACTIONS).flatMap(([moduleFile, names]) =>
      names.map((name) => [moduleFile, name] as const),
    ),
  )("%s → %s reaches an admin gate before doing work", (moduleFile, name) => {
    const source = readFileSync(join(ACTIONS_DIR, moduleFile), "utf8");
    expect(functionBody(source, name)).not.toBeNull();
    expect(isGated(source, name)).toBe(true);
  });

  /**
   * `guardAdmin` / `requireAdmin` are accepted as gate tokens above. That is
   * only sound if the helpers themselves consult the allow-list — otherwise a
   * helper could be renamed into a no-op and every action would still "pass".
   */
  it("the file-local guard helpers really do consult the allow-list", () => {
    const helpers: ReadonlyArray<readonly [string, string]> = [
      ["admin.ts", "guardAdmin"],
      ["adminNotifications.ts", "requireAdmin"],
      ["sourceImport.ts", "requireAdmin"],
    ];
    for (const [moduleFile, helper] of helpers) {
      const body = functionBody(
        readFileSync(join(ACTIONS_DIR, moduleFile), "utf8"),
        helper,
      );
      expect(body, `${moduleFile}:${helper}`).not.toBeNull();
      expect(
        /isAdminUserId|isCurrentUserAdmin/.test(body ?? ""),
        `${moduleFile}:${helper} must check the allow-list`,
      ).toBe(true);
    }
  });

  /**
   * Negative control: the scanner must be able to FAIL. A body with no gate
   * token must not pass, or every assertion above is vacuous.
   */
  it("the scanner rejects an ungated action (negative control)", () => {
    const fake = `
      export async function wideOpenAction(id: string) {
        await deleteEverything(id);
        return { ok: true };
      }
    `;
    expect(isGated(fake, "wideOpenAction")).toBe(false);
    expect(isGated(fake, "noSuchAction")).toBe(false);
  });

  /**
   * The scanner must read the BODY, not the return type. This is the exact
   * shape that made an earlier version report five gated actions as ungated:
   * braces in the return-type annotation, and braces in an inline-typed
   * parameter, both before the body starts.
   */
  it("the scanner finds the body past braces in types and params", () => {
    const gated = `
      export async function trickyAction(
        input: { readonly id: string },
      ): Promise<{ ok: boolean; error?: string }> {
        const { userId } = await auth();
        if (!isAdminUserId(userId)) return { ok: false, error: "forbidden" };
        return { ok: true };
      }
    `;
    const body = functionBody(gated, "trickyAction");
    expect(body).toContain("isAdminUserId");
    expect(body).not.toContain("Promise<");
    expect(isGated(gated, "trickyAction")).toBe(true);

    // Same signature shape, no gate — must still be rejected.
    const ungated = gated.replace(
      /const \{ userId \}[\s\S]*?forbidden" \};/,
      "await doTheThing(input.id);",
    );
    expect(isGated(ungated, "trickyAction")).toBe(false);
  });

  /**
   * The admin PAGE gate, pinned separately: it is the allow-list, not a Clerk
   * role claim. A role/claim can be granted by any code path that writes user
   * metadata; the allow-list can only be changed by a deploy.
   */
  it("the (admin) layout gates on the allow-list and redirects", () => {
    const layout = readFileSync(join(ADMIN_ROUTES, "layout.tsx"), "utf8");
    expect(layout).toContain("isAdminUserId");
    expect(layout).toMatch(/redirect\(\s*["']\/["']\s*\)/);
  });

  /**
   * No admin surface may accept `publicMetadata.role === "admin"` as an
   * ALTERNATIVE to the allow-list. Both email-preview pages used to, which
   * contradicted the property lib/admin.ts is written to hold.
   */
  it("no admin surface accepts a Clerk role claim as an alternative gate", () => {
    const offenders = adminSources(ADMIN_ROUTES).filter((file) => {
      const source = readFileSync(file, "utf8");
      return /publicMetadata/.test(source) && /role\s*!==\s*["']admin["']/.test(source);
    });
    expect(offenders).toEqual([]);
  });
});
