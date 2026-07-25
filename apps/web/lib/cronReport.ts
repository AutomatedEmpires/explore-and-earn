import { reportError, reportMessage } from "./sentry";

/**
 * Make a failing scheduled job VISIBLE.
 *
 * Every cron route returned a JSON 500 on failure and reported nothing to
 * Sentry, so a job could fail on every invocation indefinitely with the only
 * trace being a status code in the Vercel log that nobody reads. This is not
 * hypothetical here: the sourced-freshness sweep failed on every run for weeks
 * because migration 064's CHECK omitted the very status the sweep writes, and
 * the failure was invisible — stale sourced listings would have stayed live
 * forever. Migration 078 fixed the constraint; this fixes the blindness.
 *
 * Two entry points because a scheduled job fails in two different ways, and
 * both must page someone:
 *
 *   reportCronException — something threw.
 *   reportCronFailure   — nothing threw, but the job reported ok: false. This
 *                         is the dangerous one: a returned error object is
 *                         silent by construction.
 */

/** A job that threw. */
export function reportCronException(job: string, error: unknown): void {
  reportError(error, { action: `cron:${job}`, route: `/api/cron/${job}` });
}

/**
 * A job that completed but reported failure. Raised as an ERROR-level message
 * rather than an exception because there is no throwable — the point is that it
 * still has to reach the same alerting path.
 */
export function reportCronFailure(job: string, detail: string): void {
  reportMessage(`cron:${job} failed: ${detail}`, "error", {
    action: `cron:${job}`,
    route: `/api/cron/${job}`,
  });
}
