import type { Metadata } from "next";

import { BucketPage } from "../../../components/seeker";
import { getDiscoveryListingsWithCoords } from "../../../components/discovery";
import { MapView } from "../../../components/map";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Map",
};

type MapSearchParams = {
	[key: string]: string | string[] | undefined;
};

function firstValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Map \u2014 locked seeker-nav tab. Renders the real interactive Mapbox map
 * (MapView) for opportunities that carry coordinates. The page stays a server
 * component: it fetches only coordinate-bearing live listings through the
 * discovery data-access boundary (getDiscoveryListingsWithCoords) and hands
 * them to the client MapView. A ?focus=<id> deep link (from a card's location
 * row on another surface) auto-opens that listing's popup.
 */
export default async function MapPage({
	searchParams,
}: {
	searchParams: Promise<MapSearchParams>;
}) {
	const [params, listings] = await Promise.all([
		searchParams,
		getDiscoveryListingsWithCoords(),
	]);
	return (
		<BucketPage
			title="Map"
			description="Explore open opportunities by location."
		>
			<MapView
				listings={listings}
				initialFocusId={firstValue(params.focus)}
			/>
		</BucketPage>
	);
}
