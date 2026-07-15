"use server"

import { auth } from "@clerk/nextjs/server"
import {
	getRecordsNeedingReview,
	recordEvent,
	runSourceImport,
	upsertListingSource,
	type ImportReport,
	type SourceRecordReviewRow,
	type UpsertListingSourceInput,
} from "@explore-and-earn/db"

import { isCurrentUserAdmin } from "../../lib/admin"
import { checkRateLimit } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"

/**
 * Founder/admin sourcing operations. EVERY action here is admin-gated
 * server-side (isCurrentUserAdmin — the env-allow-listed founder accounts);
 * imports run only against sources whose compliance_status is 'approved', and
 * the compliance decision itself is an explicit admin act recorded on the
 * source. No client input can select provenance, category, or evidence —
 * those are derived inside the engine from the source's own statements.
 */

const PAYLOAD_MAX_BYTES = 5 * 1024 * 1024 // 5 MB founder-supplied payload cap

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
	const { userId } = await auth()
	if (!userId) return { ok: false, error: "unauthenticated" }
	if (!(await isCurrentUserAdmin())) return { ok: false, error: "forbidden" }
	return { ok: true }
}

/**
 * Create or update a source registry entry. Compliance defaults to
 * pending_review; passing complianceStatus='approved' is the founder's
 * explicit legal/permission decision — the engine never makes it.
 */
export async function upsertListingSourceAction(
	input: UpsertListingSourceInput,
): Promise<{ ok: boolean; sourceId?: string; error?: string }> {
	try {
		const gate = await requireAdmin()
		if (!gate.ok) return { ok: false, error: gate.error }
		const result = await upsertListingSource(input)
		if (result.ok && input.complianceStatus === "pending_review") {
			await recordEvent({
				eventType: "source_compliance_review_required",
				actorScope: "admin",
				subjectType: "listing_source",
				subjectId: result.sourceId,
			})
		}
		return result
	} catch (error) {
		reportError(error, { action: "upsertListingSourceAction" })
		return { ok: false, error: "source_upsert_failed" }
	}
}

/**
 * Run (or dry-run) an import of a founder-supplied CSV/JSON payload against
 * an approved source. Deterministic and idempotent; the full record-by-record
 * plan is preserved as lineage. dryRun previews the plan without writing.
 */
export async function runSourceImportAction(args: {
	readonly sourceId: string
	readonly payloadText: string
	readonly dryRun?: boolean
}): Promise<ImportReport> {
	try {
		const gate = await requireAdmin()
		if (!gate.ok) return { ok: false, runId: null, error: gate.error, stats: {}, needsReview: 0 }

		const { userId } = await auth()
		const { allowed } = checkRateLimit(`source-import:${userId}`, 10, 10 * 60 * 1000)
		if (!allowed) {
			return { ok: false, runId: null, error: "rate_limit_exceeded", stats: {}, needsReview: 0 }
		}

		if (typeof args.payloadText !== "string" || args.payloadText.length === 0) {
			return { ok: false, runId: null, error: "payload_empty", stats: {}, needsReview: 0 }
		}
		if (Buffer.byteLength(args.payloadText, "utf8") > PAYLOAD_MAX_BYTES) {
			return { ok: false, runId: null, error: "payload_too_large", stats: {}, needsReview: 0 }
		}

		await recordEvent({
			eventType: "source_import_started",
			actorScope: "admin",
			subjectType: "listing_source",
			subjectId: args.sourceId,
			properties: { dryRun: args.dryRun === true },
		})

		const report = await runSourceImport({
			sourceId: args.sourceId,
			payloadText: args.payloadText,
			dryRun: args.dryRun,
		})

		// Strip the (potentially large) dry-run plan from the wire response —
		// the deterministic stats + needsReview are the review surface.
		const wireReport: ImportReport = {
			ok: report.ok,
			runId: report.runId,
			stats: report.stats,
			needsReview: report.needsReview,
			...(report.error ? { error: report.error } : {}),
			...(report.idempotentReplay ? { idempotentReplay: true } : {}),
		}

		await recordEvent({
			eventType: report.ok ? "source_import_completed" : "source_import_failed",
			actorScope: "admin",
			subjectType: "source_import_run",
			subjectId: report.runId ?? undefined,
			properties: {
				sourceId: args.sourceId,
				dryRun: args.dryRun === true,
				received: report.stats.received ?? 0,
				inserted: report.stats.inserted ?? 0,
				updated: report.stats.updated ?? 0,
				rejected: report.stats.rejected ?? 0,
				quarantined: report.stats.quarantined ?? 0,
				needsReview: report.needsReview,
				...(report.error ? { error: report.error } : {}),
			},
		})

		return wireReport
	} catch (error) {
		reportError(error, { action: "runSourceImportAction" })
		return { ok: false, runId: null, error: "import_failed", stats: {}, needsReview: 0 }
	}
}

/** Founder review queue: quarantined + probable-duplicate records. */
export async function getSourceReviewQueueAction(): Promise<SourceRecordReviewRow[]> {
	try {
		const gate = await requireAdmin()
		if (!gate.ok) return []
		return await getRecordsNeedingReview()
	} catch (error) {
		reportError(error, { action: "getSourceReviewQueueAction" })
		return []
	}
}
