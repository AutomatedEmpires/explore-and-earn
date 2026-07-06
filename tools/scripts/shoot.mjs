/**
 * Design screenshot helper — capture a route at mobile + desktop (+ reduced-motion)
 * for the design-audit / visual-upgrade self-critique loop.
 *
 * Usage:  node tools/scripts/shoot.mjs <path> [devRole]
 *   node tools/scripts/shoot.mjs /host host
 *   node tools/scripts/shoot.mjs /seek seeker
 *
 * Drives the repo's already-installed Playwright (root devDep) + bundled
 * Chromium — no system Chrome / sudo needed. devRole sets the dev-bench
 * `ee_dev_role` cookie so protected surfaces render without Clerk.
 * Output: docs/design/reference/_shots/<slug>_{desktop,mobile,mobile_reduced}.png
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const path = process.argv[2] || "/";
const role = process.argv[3] || null; // seeker | host | admin
const base = process.env.BASE_URL || "http://localhost:3000";
const outDir = "docs/design/reference/_shots";
const slug = path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "root";

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  if (role) await context.addCookies([{ name: "ee_dev_role", value: role, url: base }]);
  const page = await context.newPage();

  // Resolve only once the design TOKENS are actually applied (root layout css),
  // not merely when `load` fires — dev can serve HTML before the token chunk.
  async function tokensReady() {
    await page.waitForFunction(
      () => getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim().length > 0,
      { timeout: 30000 },
    );
    await page.evaluate(() => document.fonts.ready);
  }

  async function shoot(label, width, height) {
    await page.setViewportSize({ width, height });
    // Dev cold-route compiles on this box run 60-300s — pre-warm routes with
    // curl before shooting, and keep this budget generous regardless.
    await page.goto(base + path, { waitUntil: "load", timeout: 300000 });
    await tokensReady().catch(async () => {
      await page.reload({ waitUntil: "load" }); // dev chunk may have lagged; retry once
      await tokensReady().catch(() => {});
    });
    await page.waitForTimeout(700); // reveal/animation settle
    const file = `${outDir}/${slug}_${label}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log("✓", file);
  }

  await shoot("desktop", 1024, 900);
  await shoot("mobile", 380, 800);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await shoot("mobile_reduced", 380, 800);
} finally {
  await browser.close();
}
