import { DiscoveryFeed } from "../components/discovery";
import { getDiscoveryListings } from "../components/discovery/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const listings = await getDiscoveryListings();

	return (
		<main>
			<DiscoveryFeed listings={listings} />
		</main>
	);
}
