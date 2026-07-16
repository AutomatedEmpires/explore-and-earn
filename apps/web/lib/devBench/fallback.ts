import { isDevBenchEnabled } from "./index";

/**
 * Dev-bench data fallback.
 *
 * The seeker lifecycle pages call DB queries directly. In the local dev mock
 * bench there is no Supabase configured, so those queries throw at client
 * creation ("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL").
 * That turned every data-backed seeker surface into an error boundary, making
 * the app impossible to review locally.
 *
 * `devFallback` wraps a query promise: in the dev bench a failure degrades to a
 * supplied fallback (usually the page's empty/default shape, or a light
 * fixture) so the surface RENDERS and can be reviewed. In production the error
 * is RE-THROWN unchanged — real data faults must never be silently swallowed.
 *
 * This mirrors the `isDevBenchEnabled()` fixture short-circuit the discovery
 * lane already uses (see components/discovery/data.ts); it just applies it to
 * the lifecycle surfaces that were never given one.
 */
export async function devFallback<T>(promise: Promise<T>, fallback: T): Promise<T> {
	try {
		return await promise;
	} catch (error) {
		if (isDevBenchEnabled()) {
			console.warn(
				`[devbench] data query failed; rendering fallback. ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
			return fallback;
		}
		throw error;
	}
}
