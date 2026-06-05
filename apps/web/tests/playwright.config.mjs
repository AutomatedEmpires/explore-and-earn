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
    timeout: 120000,
    url: "http://127.0.0.1:3100"
  }
});