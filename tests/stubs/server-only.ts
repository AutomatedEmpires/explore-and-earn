// Vitest's stand-in for the `server-only` package (aliased in vitest.config.ts). Next.js swaps
// the package for an empty module in server bundles; tests run server code directly, so they
// get an empty module too.
export {};
