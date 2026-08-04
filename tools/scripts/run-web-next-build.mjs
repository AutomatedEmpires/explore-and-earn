import { spawnSync } from "node:child_process";

const DEFAULT_BUILD_HEAP_MB = 4096;
const existingNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";
const hasExplicitHeapLimit =
  /(?:^|\s)--max[-_]old[-_]space[-_]size(?:=|\s)\d+(?:\s|$)/.test(
    existingNodeOptions,
  );
const nodeOptions = hasExplicitHeapLimit
  ? existingNodeOptions
  : [existingNodeOptions, `--max-old-space-size=${DEFAULT_BUILD_HEAP_MB}`]
      .filter(Boolean)
      .join(" ");

// npm_execpath points at the active package manager's JavaScript entrypoint,
// which keeps this wrapper portable across pnpm on Linux, macOS, and Windows.
const packageManagerEntry = process.env.npm_execpath;
const command = packageManagerEntry
  ? process.execPath
  : process.platform === "win32"
    ? "pnpm.cmd"
    : "pnpm";
const args = packageManagerEntry
  ? [packageManagerEntry, "exec", "next", "build"]
  : ["exec", "next", "build"];

const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
  stdio: "inherit",
});

if (result.error) {
  console.error(`next-build: failed to start: ${result.error.message}`);
  process.exitCode = 1;
} else if (result.signal) {
  console.error(`next-build: terminated by ${result.signal}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
