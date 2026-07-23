import type { Metadata } from "next";

import {
	getSourceReviewQueueAction,
	listListingSourcesAction,
} from "../../../../actions/sourceImport";
import { SourcingConsole } from "../../../../../components/admin/SourcingConsole";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Sourcing console",
	robots: { index: false, follow: false },
};

/**
 * /admin/sourcing — the founder console for the sourced-ingestion pipeline
 * (the three server actions existed headless since the 064 wave; this page is
 * their intended UI — activation wave 2026-07-23).
 *
 * The (admin) layout already gates this route to the env-allow-listed founder
 * account (or the privileged dev bench); every action re-verifies server-side
 * regardless. The compliance decision (approving a source) is an explicit,
 * recorded act — the engine never makes it.
 */
export default async function AdminSourcingPage() {
	const [sources, reviewQueue] = await Promise.all([
		listListingSourcesAction(),
		getSourceReviewQueueAction(),
	]);

	return <SourcingConsole initialSources={sources} initialReviewQueue={reviewQueue} />;
}
