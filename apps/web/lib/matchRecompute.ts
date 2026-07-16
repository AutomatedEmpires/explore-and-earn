import "server-only";

import { after } from "next/server";

import { computeAndStoreMatchesForSeekerByClerkId } from "../services/matching";
import { reportError } from "./sentry";

/**
 * Queue a fire-and-forget stored-score recompute for a seeker AFTER a profile
 * save response is sent (mirrors the apply-time pattern in
 * app/actions/applications.ts). This is what keeps the stored ADR-040 scores —
 * the single number every discovery pill reads — fresh when the seeker edits
 * the inputs the engine scores (categories, skills, certs, prefs, pay,
 * availability, travel): without it, scores only exist from apply-time pairs
 * and the 48h new-listing cron.
 *
 * Bounded: computeAndStoreMatchesForSeeker caps at 500 live listings per run
 * (CANDIDATE_CAP). Best-effort: a scoring fault never affects the save.
 */
export function queueSeekerMatchRecompute(clerkUserId: string): void {
	after(async () => {
		try {
			await computeAndStoreMatchesForSeekerByClerkId(clerkUserId);
		} catch (error) {
			reportError(error, {
				action: "computeAndStoreMatchesForSeekerByClerkId",
				userId: clerkUserId,
			});
		}
	});
}
