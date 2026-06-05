import type { ListingStatus } from "@explore-and-earn/contracts"
import type { ListingRow } from "@explore-and-earn/db"
import { rowToDiscoveryFields } from "@explore-and-earn/db"
import type { ListingDetailData } from "./fixtures"

/**
 * Map a DB ListingRow into the ListingDetailData view-model consumed by
 * <ListingDetail>. Core fields (title, category, location, window, benefits,
 * host name/verified) come from the shared rowToDiscoveryFields() mapper so the
 * detail and discovery surfaces stay consistent.
 *
 * KNOWN GAPS (the public listing projection in packages/db does not yet select
 * these columns — tracked as follow-ups, intentionally out of scope here):
 * - `description`: no long-form description column is projected -> [] (no body
 *   paragraphs render).
 * - `gallery`: no media is projected -> [] (ImageGallery renders nothing).
 * - `host.id`: host_profiles id is not projected, so the host permalink is not
 *   yet wired. Left blank rather than pointing at a wrong id.
 */
export function listingRowToDetailData(row: ListingRow): ListingDetailData {
	const fields = rowToDiscoveryFields(row)

	return {
		id: fields.id,
		title: fields.title,
		category: fields.category,
		status: row.status as ListingStatus,
		location: fields.location,
		opportunityWindow: fields.opportunityWindow,
		description: [],
		gallery: [],
		benefits: fields.benefits,
		host: {
			id: "",
			name: fields.host.name,
			location: row.location_display ?? "Location not specified",
			verified: fields.host.verified,
		},
	}
}
