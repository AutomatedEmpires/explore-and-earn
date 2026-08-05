import { HostDemoListingEdit } from "../../../../../../../components/demo/full-fidelity/host/HostDemoViews";

export default async function HostWalkthroughListingEditPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <HostDemoListingEdit listingId={id} />;
}
