"use client";

import { useState, useTransition } from "react";
import type {
	ImportReport,
	ListingSourceSummary,
	SourceRecordReviewRow,
} from "@explore-and-earn/db";

import {
	getSourceReviewQueueAction,
	listListingSourcesAction,
	runSourceImportAction,
} from "../../app/actions/sourceImport";
import { ConfirmAction } from "./ConfirmAction";
import styles from "./SourcingConsole.module.css";

/**
 * Sourcing console — registry view + import runner + review queue over the
 * three admin server actions (each re-gated server-side).
 *
 * Deliberate omissions, matching the engine's honesty rules:
 *  • NO approve-source button. Approving a source is a compliance decision
 *    recorded with its permission basis — it ships as a reviewed MIGRATION
 *    (see 078's USAJOBS registration), never a casual click.
 *  • The review queue is read-only: quarantined records simply never publish.
 *    Resolution tooling is a follow-up; fail direction is "not live".
 */

const STATUS_LABEL: Record<ListingSourceSummary["complianceStatus"], string> = {
	approved: "Approved",
	pending_review: "Pending review",
	rejected: "Rejected",
};

export function SourcingConsole({
	initialSources,
	initialReviewQueue,
}: {
	readonly initialSources: readonly ListingSourceSummary[];
	readonly initialReviewQueue: readonly SourceRecordReviewRow[];
}) {
	const [sources, setSources] = useState(initialSources);
	const [reviewQueue, setReviewQueue] = useState(initialReviewQueue);
	const [sourceId, setSourceId] = useState(
		initialSources.find((s) => s.complianceStatus === "approved")?.id ?? "",
	);
	const [payloadText, setPayloadText] = useState("");
	const [dryRun, setDryRun] = useState(true);
	// The report keeps the dryRun flag OF THE RUN IT DESCRIBES — deriving the
	// label from the live checkbox re-labeled a stale dry-run report as a real
	// "Import complete." the moment the box was toggled (caught in the
	// activation bench run, 2026-07-23).
	const [report, setReport] = useState<(ImportReport & { wasDryRun: boolean }) | null>(null);
	const [pending, startTransition] = useTransition();

	const refresh = () =>
		startTransition(async () => {
			const [nextSources, nextQueue] = await Promise.all([
				listListingSourcesAction(),
				getSourceReviewQueueAction(),
			]);
			setSources(nextSources);
			setReviewQueue(nextQueue);
		});

	const runImport = () => {
		const requestedDryRun = dryRun;
		startTransition(async () => {
			const result = await runSourceImportAction({
				sourceId,
				payloadText,
				dryRun: requestedDryRun,
			});
			setReport({ ...result, wasDryRun: requestedDryRun });
			if (result.ok && !requestedDryRun) {
				const nextQueue = await getSourceReviewQueueAction();
				setReviewQueue(nextQueue);
			}
		});
	};

	// What the live-run confirmation names. The id is the value the select
	// carries, but it is the source NAME the operator chose, so the confirmation
	// says that and falls back to the id only when nothing matches.
	const selectedSourceName =
		sources.find((source) => source.id === sourceId)?.name ?? sourceId;

	return (
		<div className={styles.page}>
			<header className={styles.header}>
				<h1 className={styles.title}>Sourcing console</h1>
				<p className={styles.sub}>
					Compliance-gated listing ingestion. Only sources approved with a
					recorded permission basis can ingest; source approval ships as a
					reviewed migration, not a button. Payloads are operator-supplied
					exports (CSV/JSON) — the engine extracts stated facts only.
				</p>
			</header>

			{/* ── Source registry ── */}
			<section className={styles.section} aria-labelledby="sourcing-registry">
				<h2 id="sourcing-registry" className={styles.sectionTitle}>
					Source registry
				</h2>
				{sources.length === 0 ? (
					<p className={styles.empty}>
						No sources registered. Sources are registered + approved via
						reviewed migrations (see 078_sourced_ingestion_activation.sql).
					</p>
				) : (
					<ul className={styles.sourceList} role="list">
						{sources.map((source) => (
							<li key={source.id} className={styles.sourceCard}>
								<div className={styles.sourceHead}>
									<span className={styles.sourceName}>{source.name}</span>
									<span
										className={styles.status}
										data-status={source.complianceStatus}
									>
										{STATUS_LABEL[source.complianceStatus]}
									</span>
									<span className={styles.kind}>{source.kind}</span>
								</div>
								{source.termsUrl ? (
									<a
										className={styles.termsLink}
										href={source.termsUrl}
										target="_blank"
										rel="noopener noreferrer"
									>
										Source terms
									</a>
								) : null}
								{source.complianceNotes ? (
									<details className={styles.notes}>
										<summary>Permission basis</summary>
										<p>{source.complianceNotes}</p>
									</details>
								) : null}
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ── Import runner ── */}
			<section className={styles.section} aria-labelledby="sourcing-import">
				<h2 id="sourcing-import" className={styles.sectionTitle}>
					Run an import
				</h2>
				<div className={styles.formRow}>
					<label className={styles.label} htmlFor="sourcing-source">
						Source
					</label>
					<select
						id="sourcing-source"
						className={styles.select}
						value={sourceId}
						onChange={(event) => setSourceId(event.target.value)}
					>
						<option value="">Select a source…</option>
						{sources.map((source) => (
							<option
								key={source.id}
								value={source.id}
								disabled={source.complianceStatus !== "approved"}
							>
								{source.name}
								{source.complianceStatus !== "approved" ? " (not approved)" : ""}
							</option>
						))}
					</select>
				</div>
				<div className={styles.formRow}>
					<label className={styles.label} htmlFor="sourcing-payload">
						Payload (CSV or JSON, ≤ 3 MB)
					</label>
					<textarea
						id="sourcing-payload"
						className={styles.payload}
						value={payloadText}
						onChange={(event) => setPayloadText(event.target.value)}
						rows={10}
						spellCheck={false}
						placeholder='[{"position_id":"…","title":"…","organization":"…","location":"…","url":"…"}]'
					/>
				</div>
				<div className={styles.formRow}>
					<label className={styles.checkboxLabel}>
						<input
							type="checkbox"
							checked={dryRun}
							onChange={(event) => setDryRun(event.target.checked)}
						/>
						Dry run (plan + stats only, no writes)
					</label>
					{/* A dry run writes nothing, so it stays one click — putting a
					confirmation in front of the safe rehearsal is how operators learn
					to click through the one that matters. Only the live run is
					guarded. */}
					{dryRun ? (
						<button
							type="button"
							className={styles.runBtn}
							onClick={runImport}
							disabled={pending || !sourceId || payloadText.length === 0}
						>
							{pending ? "Running…" : "Preview import"}
						</button>
					) : (
						<ConfirmAction
							label="Run import"
							question="Run this import for real? It writes listing rows to the database. There is no undo from this console."
							confirmLabel="Confirm live import"
							busyLabel="Running…"
							subject={selectedSourceName}
							tone="danger"
							disabled={pending || !sourceId || payloadText.length === 0}
							busy={pending}
							onConfirm={runImport}
						/>
					)}
					<button
						type="button"
						className={styles.refreshBtn}
						onClick={refresh}
						disabled={pending}
					>
						Refresh
					</button>
				</div>

				{report ? (
					<div
						className={styles.report}
						data-ok={report.ok ? "true" : "false"}
						role="status"
					>
						<p className={styles.reportLine}>
							{report.ok
								? report.idempotentReplay
									? "Identical payload already imported — no-op replay."
									: report.wasDryRun
										? "Dry run complete (no writes)."
										: "Import complete."
								: `Import failed: ${report.error}`}
						</p>
						<dl className={styles.stats}>
							{Object.entries(report.stats).map(([key, value]) => (
								<div key={key} className={styles.stat}>
									<dt>{key}</dt>
									<dd>{String(value)}</dd>
								</div>
							))}
							<div className={styles.stat}>
								<dt>needs review</dt>
								<dd>{report.needsReview}</dd>
							</div>
						</dl>
					</div>
				) : null}
			</section>

			{/* ── Review queue (read-only) ── */}
			<section className={styles.section} aria-labelledby="sourcing-review">
				<h2 id="sourcing-review" className={styles.sectionTitle}>
					Review queue
					<span className={styles.queueCount}>{reviewQueue.length}</span>
				</h2>
				<p className={styles.sub}>
					Quarantined + probable-duplicate records. Nothing here is published —
					the fail direction is always &ldquo;not live&rdquo;. Resolution tooling
					is a follow-up; re-import after correcting the source payload.
				</p>
				{reviewQueue.length === 0 ? (
					<p className={styles.empty}>Queue is empty.</p>
				) : (
					<ul className={styles.queueList} role="list">
						{reviewQueue.map((row) => {
							const title =
								(row.normalized as { title?: string } | null)?.title ?? "(no title)";
							return (
								<li key={row.id} className={styles.queueRow}>
									<span className={styles.queueOutcome}>{row.outcome}</span>
									<span className={styles.queueTitle}>{title}</span>
									{row.rejectReason ? (
										<span className={styles.queueReason}>{row.rejectReason}</span>
									) : null}
								</li>
							);
						})}
					</ul>
				)}
			</section>
		</div>
	);
}
