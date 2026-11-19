import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { hostPage } from '@/server/shell';
import { ListingBuilder } from '../_components/ListingBuilder';
import { builderReferences, orgName } from '../_server/context';

export const metadata: Metadata = { title: 'Listing builder · Explore&Earn' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The listing builder (Figma 01 Host, section C): 10 steps on a phone, one workspace at 768
// and 1440. The draft itself loads in the browser so it can autosave and work offline.
export default async function ListingBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const host = await hostPage(`/host/listings/${id}`);
  const [name, refs] = await Promise.all([orgName(host.orgId), builderReferences()]);
  return (
    <Suspense>
      <ListingBuilder
        listingId={id}
        base="/host/listings"
        viewerUserId={host.user.id}
        orgName={name}
        occupations={refs.occupations}
        destinations={refs.destinations}
      />
    </Suspense>
  );
}
