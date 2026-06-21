/**
 * Host-dashboard PREVIEW shot — the dev bench shims auth but not DB queries, so
 * the live dev render shows the empty/no-profile state. This injects a realistic
 * POPULATED state into the DOM at screenshot time (no app-code change) so the
 * intended design — farm atmosphere hero + promoted lead KPI — can be seen/scored.
 *
 * Usage: node tools/scripts/preview-host.mjs
 * Output: docs/design/reference/_shots/host_preview_{desktop,mobile}.png
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE_URL || "http://localhost:3000";
const outDir = "docs/design/reference/_shots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  await context.addCookies([{ name: "ee_dev_role", value: "host", url: base }]);
  const page = await context.newPage();

  async function go() {
    await page.goto(base + "/host", { waitUntil: "load", timeout: 90000 });
    await page
      .waitForFunction(
        () => getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim().length > 0,
        { timeout: 30000 },
      )
      .catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000); // let React finish hydration before we touch the DOM
    // Force the populated visual state via an injected <style> (survives React)
    // plus the 3rd KPI promoted to the dominant lead tile.
    await page.addStyleTag({
      content: `
        .host-hero { background: var(--gradient-category-farm) !important; }
        .host-kpiGrid > .host-kpi:nth-child(3) {
          order: -1 !important; grid-column: span 2 !important;
          background: var(--status-match-bg) !important;
          border-color: var(--status-match-fg) !important;
        }
        .host-kpiGrid > .host-kpi:nth-child(3) .host-kpi__value { font-size: var(--type-display-size) !important; color: var(--status-match-fg) !important; }
        .host-kpiGrid > .host-kpi:nth-child(3) .host-kpi__label,
        .host-kpiGrid > .host-kpi:nth-child(3) .host-kpi__top { color: var(--status-match-fg) !important; }
      `,
    });
    // Text last, then shoot immediately (post-hydration, so it sticks).
    await page.evaluate(() => {
      const t = document.querySelector(".host-hero__title");
      if (t) t.textContent = "Welcome back, Wenatchee Orchard Co.";
      const s = document.querySelector(".host-hero__sub");
      if (s) s.textContent = "Your listings, applicants, and activity at a glance.";
      const kpis = [...document.querySelectorAll(".host-kpi .host-kpi__value")];
      [4, 9, 3, 14].forEach((v, i) => { if (kpis[i]) kpis[i].textContent = String(v); });
    });
    await page.waitForTimeout(300);
  }

  await page.setViewportSize({ width: 1024, height: 950 });
  await go();
  await page.screenshot({ path: `${outDir}/host_preview_desktop.png`, fullPage: true });
  console.log("✓ host_preview_desktop.png");

  await page.setViewportSize({ width: 380, height: 850 });
  await go();
  await page.screenshot({ path: `${outDir}/host_preview_mobile.png`, fullPage: true });
  console.log("✓ host_preview_mobile.png");
} finally {
  await browser.close();
}
