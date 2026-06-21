/**
 * Dev Mock Bench — request-scoped helpers (server).
 *
 * `next/headers` is imported lazily inside each function so this module stays
 * import-safe in every runtime (RSC, route handler, edge middleware) — only the
 * call sites execute it, and only during a request. See `./index` for the gate.
 */

import { DEV_ROLE_COOKIE, isDevBenchEnabled, isDevRole, type DevRole } from "./index";

/** The role currently being impersonated, or null when the bench is off/unset. */
export async function readDevRole(): Promise<DevRole | null> {
  if (!isDevBenchEnabled()) return null;
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const value = store.get(DEV_ROLE_COOKIE)?.value;
    return isDevRole(value) ? value : null;
  } catch {
    // cookies() is unavailable outside a request scope — treat as not impersonating.
    return null;
  }
}

/** Persist the impersonated role (used by the /dev role-switch action). */
export async function writeDevRole(role: DevRole): Promise<void> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(DEV_ROLE_COOKIE, role, {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    // Session cookie — clears when the browser closes; never persisted to prod.
  });
}
