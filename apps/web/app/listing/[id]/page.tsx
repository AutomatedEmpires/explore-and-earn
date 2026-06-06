import { auth } from "@clerk/nextjs/server"
import { getPublicListingById, getSeekerApplicationIds } from "@explore-and-earn/db"
import { notFound } from "next/navigation"
import { ListingDetail } from "../../../components/listing/ListingDetail"
import { listingRowToDetailData } from "../../../components/listing/toDetailData"

// Listing detail reads live data (and per-seeker applied state) at request time,
// so it must not be statically prerendered. force-dynamic also avoids build-time
// NEXT_PUBLIC_SUPABASE_URL evaluation.
export const dynamic = "force-dynamic"

export default async function ListingDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params

	const listing = await getPublicListingById(id)
	if (!listing) {
		notFound()
	}

	const { userId, getToken } = await auth()
	let alreadyApplied = false
	if (userId) {
		const token = await getToken({ template: "supabase" })
		if (token) {
			const appliedListingIds = await getSeekerApplicationIds(token, userId).catch(() => [] as string[])
			alreadyApplied = appliedListingIds.includes(id)
		}
	}

	return (
		<ListingDetail
			listing={listingRowToDetailData(listing)}
			isAuthenticated={Boolean(userId)}
			alreadyApplied={alreadyApplied}
		/>
	)
}
