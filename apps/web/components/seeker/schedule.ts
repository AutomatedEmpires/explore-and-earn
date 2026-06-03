/**
 * Seeker Schedule — LOCAL view model (Sprint Zero, no backend).
 *
 * Internal scheduling proposals (interview / call / trial day) exchanged with a
 * host. UI-only; the persisted scheduling contract is founder-gated and not yet
 * in @explore-and-earn/contracts. Replace (or map from) it when it lands.
 */
export type ScheduleStatus = "proposed" | "confirmed" | "declined" | "completed";

export const SCHEDULE_STATUS_LABEL: Record<ScheduleStatus, string> = {
	proposed: "Proposed",
	confirmed: "Confirmed",
	declined: "Declined",
	completed: "Completed",
};

export interface ScheduleProposal {
	readonly id: string;
	readonly hostName: string;
	readonly listingTitle: string;
	/** Kind of session, e.g. "Video interview". */
	readonly kind: string;
	/** Human-readable proposed time, e.g. "Jun 6, 2026 · 10:00 AM PT". */
	readonly proposedFor: string;
	readonly status: ScheduleStatus;
	readonly note?: string;
}

export const SCHEDULE_PROPOSALS: readonly ScheduleProposal[] = [
	{
		id: "sch_sitka",
		hostName: "North Pacific Fisheries Co-op",
		listingTitle: "Deckhand — Salmon Season",
		kind: "Video interview",
		proposedFor: "Jun 6, 2026 · 10:00 AM PT",
		status: "proposed",
		note: "Bring any questions about the season length and gear provided.",
	},
	{
		id: "sch_orchard",
		hostName: "Cascade Bloom Orchards",
		listingTitle: "Orchard Harvest Hand",
		kind: "Phone call",
		proposedFor: "Jun 4, 2026 · 2:30 PM PT",
		status: "confirmed",
	},
	{
		id: "sch_breck",
		hostName: "Summit Pass Hospitality",
		listingTitle: "Ski Resort Front Desk",
		kind: "Onboarding call",
		proposedFor: "May 28, 2026 · 9:00 AM PT",
		status: "completed",
	},
];
