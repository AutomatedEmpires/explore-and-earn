import type { OpportunityCategory } from "@explore-and-earn/contracts";

/**
 * Seeker Messages — LOCAL view model (Sprint Zero, no backend).
 *
 * Conversations are SCOPED: each thread is tied to a specific host + listing in
 * the seeker's lifecycle (application, invite, or offer). The frozen
 * @explore-and-earn/contracts package does not yet expose a persisted Message /
 * Thread model (founder-gated), so this composes a UI-only view model. Replace
 * (or map from) the canonical messaging contract when it lands. Nothing here is
 * added to @explore-and-earn/contracts.
 */
export interface MessageThread {
	readonly id: string;
	readonly hostName: string;
	/** Listing the conversation is scoped to. */
	readonly listingTitle: string;
	/** Category lane, used to render the canonical category icon. */
	readonly category: OpportunityCategory;
	/** Most recent message preview. */
	readonly preview: string;
	readonly timeAgo: string;
	readonly unread: boolean;
}

export const MESSAGE_THREADS: readonly MessageThread[] = [
	{
		id: "msg_orchard",
		hostName: "Cascade Bloom Orchards",
		listingTitle: "Orchard Harvest Hand",
		category: "farm",
		preview:
			"We loved your orchard experience — would you join us for the harvest?",
		timeAgo: "1h",
		unread: true,
	},
	{
		id: "msg_sitka",
		hostName: "North Pacific Fisheries Co-op",
		listingTitle: "Deckhand — Salmon Season",
		category: "maritime",
		preview: "Your invite is waiting — happy to answer questions about life aboard.",
		timeAgo: "4h",
		unread: true,
	},
	{
		id: "msg_breck",
		hostName: "Summit Pass Hospitality",
		listingTitle: "Ski Resort Front Desk",
		category: "seasonal",
		preview: "Welcome aboard! Here's what to know before your start date.",
		timeAgo: "2d",
		unread: false,
	},
];
