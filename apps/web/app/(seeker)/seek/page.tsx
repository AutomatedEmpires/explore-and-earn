import { DiscoveryFeed, DISCOVERY_FIXTURES } from "../../../components/discovery";

/**
 * Seek — locked seeker-nav tab (founder-flagged). The seeker-scope opportunity
 * feed: every open listing rendered through the single canonical DiscoveryCard
 * via DiscoveryFeed. Phase D replacement for the placeholder shipped with the
 * locked bottom nav.
 */
export default function SeekPage() {
	return (
		<DiscoveryFeed
			listings={DISCOVERY_FIXTURES}
			heading="Seek opportunities"
			subheading="Browse every open work-travel opportunity — housing, meals, and pay from hosts worldwide."
		/>
	);
}
