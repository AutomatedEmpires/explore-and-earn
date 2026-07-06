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
if (!process.env.PW_REUSE_SERVER) {
  try {
    execFileSync("fuser", ["-k", `${PORT}/tcp`], { stdio: "ignore" });
  } catch {
    // Nothing was listening — the normal case.
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60000,
  workers: 1,
  // Diagnostics: without retries+trace+reporter a webServer timeout is
  // indistinguishable from a test failure (.last-run.json just says "failed").
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry"
  },
  webServer: {
    // Turbopack matches the repo's `dev` script and cuts WSL2 cold-compile time
    // substantially — the old webpack dev boot was the main startup-timeout
    // culprit.
    command: `corepack pnpm exec next dev --turbopack --hostname 127.0.0.1 --port ${PORT}`,
    cwd: webRoot,
    reuseExistingServer: Boolean(process.env.PW_REUSE_SERVER),
    // next dev cold-compiles the first request; in WSL2 this can exceed the old
    // 120s default and time out the whole run before any test executes.
    timeout: 240000,
    url: `http://127.0.0.1:${PORT}`,
    stdout: "pipe",
    stderr: "pipe"
  }
});
