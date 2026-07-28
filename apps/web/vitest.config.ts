import { defineConfig } from "vitest/config";

export default defineConfig({
  // The app tsconfig sets jsx: "preserve" for Next's own compiler, which leaves
  // raw JSX that Vite cannot parse. Tests that render an apps/web .tsx (e.g.
  // the /credits attribution page) need it transformed here instead. Vitest 4
  // transforms with oxc, so this must be set there — an `esbuild` block is
  // silently ignored.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
