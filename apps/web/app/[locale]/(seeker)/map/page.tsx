import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";

import { getDiscoveryListingsWithCoords } from "../../../../components/discovery/data";
import { MapViewLazy } from "../../../../components/map";
import { getSupabaseToken } from "../../../../lib/serverCache";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Explore opportunities on the map",
	description:
		"Browse seasonal work by place — clustered opportunities with housing, meals, and pay on every pin. Location is a first-class way to choose your next season.",
	alternates: { canonical: "/map" },
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
 *
 * The Mapbox token is read HERE, in the server component, and passed down as a
 * prop. Reading `process.env.NEXT_PUBLIC_MAPBOX_TOKEN` inside the dynamically
 * imported (`ssr: false`) client MapView is an unreliable inlining path \u2014 the
 * value could resolve empty on the client and the map fell back to
 * "Map unavailable". Threading it through props guarantees the client receives
 * the runtime value. Never logged or committed.
 */
export default async function MapPage({
	searchParams,
}: {
	searchParams: Promise<MapSearchParams>;
}) {
	// Auth is optional — the map is a public read. When a seeker is signed in we
	// thread their token+userId so applied pins are HARD-excluded and every pin
	// carries the boosted/skipped/match enrichment; signed-out visitors get the
	// unscoped public map (no crash).
	const { userId } = await auth();
	const token = userId ? await getSupabaseToken() : null;
	const [params, listings] = await Promise.all([
		searchParams,
		getDiscoveryListingsWithCoords(token, userId),
	]);
	const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
	return (
		<MapViewLazy
			listings={listings}
			initialFocusId={firstValue(params.focus)}
			mapboxToken={mapboxToken}
		/>
	);
}
