import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "playwright/test";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

// Deterministic startup: kill anything already bound to the e2e port before
// Playwright boots its own server. Two historical failure modes this removes:
//   - EADDRINUSE from an orphaned `next dev` of a previous (crashed) run
//   - Next silently auto-incrementing to :3101 while Playwright waits 240s
//     on :3100 and times out the whole run with zero tests executed.
// reuseExistingServer stays false so a stale server (old code) can never
// masquerade as the app under test; opt back in with PW_REUSE_SERVER=1.
const PORT = 3100;
// TEST_WORKER_INDEX guard: workers re-import this config AFTER the webServer
// is up — an unguarded kill here would shoot down the very server the main
// process just started (every test then fails ERR_CONNECTION_REFUSED).
if (!process.env.PW_REUSE_SERVER && !process.env.TEST_WORKER_INDEX) {
  try {
    execFileSync("fuser", ["-k", `${PORT}/tcp`], { stdio: "ignore" });
  } catch {
    // Nothing was listening — the normal case.
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Must exceed a single cold-route navigation: dev per-route compiles run
  // 60-120s on this box, so a 60s test budget made failures nondeterministic
  // (whichever routes were cold that run blew up). Warm-cache tests finish in
  // seconds regardless.
  timeout: 240000,
  workers: 1,
  // Diagnostics: without retries+trace+reporter a webServer timeout is
  // indistinguishable from a test failure (.last-run.json just says "failed").
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  // Dev-server reality on this box: a cold per-route webpack compile can take
  // 60-120s (the /faq compile measured 74s), far beyond Playwright's 30s
  // default navigation budget.
  expect: { timeout: 15000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    navigationTimeout: 180000,
    trace: "on-first-retry"
  },
  webServer: {
    // WEBPACK dev on purpose — NOT --turbopack: the webpack build aliases
    // @clerk/nextjs/server to the dev-bench shim (next.config.ts webpack()),
    // which the impersonated smoke specs need for synthetic auth() sessions.
    //
    // KEYLESS on purpose: with real Clerk keys, clerkMiddleware's
    // first-request fetch hangs ~30s per request on this WSL2 box under BOTH
    // bundlers (the audit's historic "socket hang up" / ECONNRESET). Keyless,
    // the middleware uses its fail-closed fallback — public routes pass,
    // protected routes 401 (asserted as a security property in smoke.spec) —
    // and authed shells are traversed via the dev-bench ee_dev_role cookie,
    // exactly like local QA.
    command: `corepack pnpm exec next dev --hostname localhost --port ${PORT}`,
    cwd: webRoot,
    reuseExistingServer: Boolean(process.env.PW_REUSE_SERVER),
    // next dev cold-compiles the first request; on this WSL2 box a COLD
    // webpack compile of the homepage tree alone measured 205s, so the budget
    // must comfortably exceed it (warm .next cache runs are far faster).
    timeout: 480000,
    url: `http://localhost:${PORT}`,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      // Deterministic GET-only unsubscribe token for the confirmation-page
      // layout test. The test never submits it and this value exists only in
      // the Playwright child process.
      NOTIFICATION_SIGNING_SECRET: "e2e-only-unsubscribe-secret"
    }
  }
});
