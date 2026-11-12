import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hostPage } from '@/server/shell';
import { InReviewScreen } from '../../_components/InReviewScreen';
import { orgName } from '../../_server/context';

export const metadata: Metadata = { title: 'In review · Explore&Earn' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// After Publish (Figma 01 Host, 43:13314): the listing is in review, not live.
export default async function ListingInReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const host = await hostPage(`/host/listings/${id}/in-review`);
  return (
    <InReviewScreen base="/host/listings" listingId={id} orgName={await orgName(host.orgId)} />
  );
}
