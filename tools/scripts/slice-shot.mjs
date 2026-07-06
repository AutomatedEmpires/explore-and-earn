/**
 * Slice a tall full-page screenshot into review-sized sections so the design
 * loop can actually read them. Companion to shoot.mjs / shoot-baseline.mjs.
 *
 * Usage: node tools/scripts/slice-shot.mjs <shot.png> [outDir] [sliceHeight]
 * Writes <outDir>/<name>_s00.png, _s01.png, ...
 */
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { basename, join } from "node:path";

const require = createRequire(import.meta.url);
// Resolve sharp from the pnpm store (it isn't hoisted to the root).
const sharp = require(
  new URL(
    "../../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js",
    import.meta.url,
  ).pathname,
);

const [, , input, outDirArg, sliceArg] = process.argv;
if (!input) {
  console.error("usage: node tools/scripts/slice-shot.mjs <shot.png> [outDir] [sliceHeight]");
  process.exit(1);
}
const outDir = outDirArg ?? "docs/design/reference/_shots/slices";
const sliceH = Number(sliceArg ?? 1400);
const name = basename(input).replace(/\.png$/, "");

await mkdir(outDir, { recursive: true });
const img = sharp(input);
const { width, height } = await img.metadata();

let n = 0;
for (let top = 0; top < height; top += sliceH) {
  const h = Math.min(sliceH, height - top);
  const file = join(outDir, `${name}_s${String(n).padStart(2, "0")}.png`);
  await sharp(input).extract({ left: 0, top, width, height: h }).toFile(file);
  console.log("✓", file);
  n++;
}
console.log(`${n} slices of ${width}x${height}`);
