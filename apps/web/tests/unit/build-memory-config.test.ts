import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const nextConfigPath = fileURLToPath(new URL("../../next.config.ts", import.meta.url));
const nextConfig = readFileSync(nextConfigPath, "utf8");

describe("production build memory configuration", () => {
  it("keeps Next build isolation enabled alongside the custom webpack hook", () => {
    expect(nextConfig).toMatch(/webpackBuildWorker:\s*true/);
    expect(nextConfig).toMatch(/webpackMemoryOptimizations:\s*true/);
  });
});
