import { DiscoveryFeed, getDiscoveryListings } from "../components/discovery";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const listings = await getDiscoveryListings();

	return (
		<main>
			<DiscoveryFeed listings={listings} />
		</main>
	);
}
