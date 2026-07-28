import { describe, expect, it } from "vitest";

import { safeInternalRedirect } from "../../lib/authRedirect";

describe("safeInternalRedirect", () => {
  it.each([
    "/claim/00000000-0000-4000-8000-000000000001",
    "/host/messages?view=unread",
    "/onboarding/skills?source=resume#experience",
  ])("keeps an internal return path: %s", (candidate) => {
    expect(safeInternalRedirect(candidate)).toBe(candidate);
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/..//attacker.example",
    "/%2e%2e//attacker.example",
    "/.%2e//attacker.example",
    "javascript:alert(1)",
    "host/messages",
    "\n//attacker.example",
  ])("rejects an external or malformed return target: %s", (candidate) => {
    expect(safeInternalRedirect(candidate)).toBeUndefined();
  });
});
