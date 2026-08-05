import { HostDemoListingDetail } from "../../../../../../components/demo/full-fidelity/host/HostDemoViews";

export default async function HostWalkthroughListingPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <HostDemoListingDetail listingId={id} />;
}
