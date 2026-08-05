import { HostDemoMessages } from "../../../../../../components/demo/full-fidelity/host/HostDemoViews";

export default async function HostWalkthroughMessagePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <HostDemoMessages threadId={id} />;
}
