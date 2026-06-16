import { fileURLToPath } from "node:url";
import { defineConfig } from "playwright/test";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100"
  },
  webServer: {
    command: "corepack pnpm exec next dev --hostname 127.0.0.1 --port 3100",
    cwd: webRoot,
    reuseExistingServer: !process.env.CI,
    // next dev cold-compiles the first request; in WSL2 this can exceed the old
    // 120s default and time out the whole run before any test executes.
    timeout: 240000,
    url: "http://127.0.0.1:3100"
  }
});