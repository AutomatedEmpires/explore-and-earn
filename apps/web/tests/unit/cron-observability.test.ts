import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No scheduled job may fail silently (readiness audit 2026-07-24).
 *
 * The defect this pins: all six cron routes returned a JSON 500 on failure and
 * reported NOTHING to Sentry. A job could fail on every invocation indefinitely
 * with the only trace being a status code in a log nobody reads.
 *
 * That is not hypothetical here. The sourced-freshness sweep failed on every
 * run for weeks because migration 064's CHECK omitted 'stale' — the very status
 * the sweep writes — and expire-listings swallowed it with
 * `.catch(() => ({ closed: 0 }))` while still answering `ok: true`. A permanent
 * failure was indistinguishable from "nothing was stale", so stale sourced
 * listings would have stayed live forever. Migration 078 fixed the constraint;
 * this test keeps the blindness from coming back.
 *
 * It reads the route sources rather than invoking them: the property is
 * structural ("every failure path reports"), and a behavioural test would need
 * all six jobs' dependencies mocked to assert something the source states
 * plainly.
 */

const CRON_DIR = join(__dirname, "../../app/api/cron");

function cronRoutes(): { name: string; source: string }[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      source: readFileSync(join(CRON_DIR, entry.name, "route.ts"), "utf8"),
    }));
}

describe("cron observability", () => {
  it("finds the cron routes (guards against a silently empty sweep)", () => {
    const routes = cronRoutes();
    expect(routes.length).toBeGreaterThanOrEqual(6);
  });

  it("every cron route imports the failure reporter", () => {
    const missing = cronRoutes()
      .filter((r) => !r.source.includes("lib/cronReport"))
      .map((r) => r.name);
    expect(missing).toEqual([]);
  });

  /**
   * The two ways a scheduled job fails, and both must reach Sentry:
   * a throw, and a returned `ok: false`. The second is the dangerous one —
   * it is silent by construction.
   */
  it("every catch block reports before returning", () => {
    const offenders: string[] = [];
    for (const { name, source } of cronRoutes()) {
      // Each `catch (` must be followed by a report call before the next return.
      const segments = source.split(/catch\s*\(/).slice(1);
      for (const segment of segments) {
        // "return NextResponse", not bare "return" — prose in the surrounding
        // comments contains the word "returned" and would truncate the body
        // before the reporter, failing a route that is actually correct.
        const untilReturn = segment.slice(0, segment.indexOf("return NextResponse"));
        if (!/reportCron(Exception|Failure)/.test(untilReturn)) {
          offenders.push(name);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every `ok: false` failure branch reports too", () => {
    const offenders: string[] = [];
    for (const { name, source } of cronRoutes()) {
      // `if (!result.ok)` style guards — the returned-error path.
      const guards = source.split(/if\s*\(\s*!\w+\.ok\s*\)/).slice(1);
      for (const guard of guards) {
        const body = guard.slice(0, guard.indexOf("return NextResponse"));
        if (!/reportCron(Exception|Failure)/.test(body)) offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * The specific regression: a broken sourced sweep must be distinguishable
   * from an empty one. Both used to be `sourcedClosed: 0` with `ok: true`.
   */
  it("expire-listings cannot report success when the sourced sweep failed", () => {
    const source = cronRoutes().find((r) => r.name === "expire-listings")!.source;
    expect(source).toContain("sourcedSweepFailed");
    // The bare swallow that hid the outage must not return.
    expect(source).not.toMatch(/\.catch\(\(\)\s*=>\s*\(\{/);
  });
});
