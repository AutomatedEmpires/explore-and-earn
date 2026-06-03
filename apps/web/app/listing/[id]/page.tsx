import { notFound } from "next/navigation"
import { ListingDetail } from "../../../components/listing/ListingDetail"
import {
	LISTING_FIXTURES,
	getListingFixture,
} from "../../../components/listing/fixtures"

export function generateStaticParams(): Array<{ id: string }> {
	return LISTING_FIXTURES.map((listing) => ({ id: listing.id }))
}

export default async function ListingDetailPage({
	params,
}: {
	params: Promise<{ id: string }>
}) {
	const { id } = await params
	const listing = getListingFixture(id)
	if (!listing) {
		notFound()
	}
	return <ListingDetail listing={listing} />
}
