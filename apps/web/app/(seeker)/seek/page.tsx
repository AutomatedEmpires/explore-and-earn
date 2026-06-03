import { DISCOVERY_FIXTURES } from "../../../components/discovery";
import { SeekBrowser } from "../../../components/seeker";

/**
 * Seek — locked seeker-nav tab (founder-flagged). The seeker-scope opportunity
 * feed, now browsable: SeekBrowser layers client-side category + benefit
 * filters and sort over the single canonical DiscoveryCard.
 */
export default function SeekPage() {
	return <SeekBrowser listings={DISCOVERY_FIXTURES} />;
}
