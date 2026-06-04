import type { Metadata } from "next";

import { getDiscoveryListings } from "../../../components/discovery";
import { SeekBrowser } from "../../../components/seeker";

export const metadata: Metadata = {
	title: "Seek",
};

type SeekSearchParams = {
	[key: string]: string | string[] | undefined;
};

function firstValue(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Seek \u2014 locked seeker-nav tab (founder-flagged). The seeker-scope
 * opportunity feed, now browsable: SeekBrowser layers client-side category +
 * benefit filters and sort over the single canonical DiscoveryCard. Filter and
 * sort state is hydrated from the URL query so a filtered view is shareable and
 * bookmarkable. Listings now arrive through the discovery data-access boundary
 * (getDiscoveryListings) rather than importing fixtures directly.
 */
export default async function SeekPage({
	searchParams,
}: {
	searchParams: Promise<SeekSearchParams>;
}) {
	const [params, listings] = await Promise.all([
		searchParams,
		getDiscoveryListings(),
	]);
	return (
		<SeekBrowser
			listings={listings}
			initialCategory={firstValue(params.category)}
			initialBenefits={firstValue(params.benefits)}
			initialSort={firstValue(params.sort)}
		/>
	);
}
