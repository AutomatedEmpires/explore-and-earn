import { HostDemoApplicantDetail } from "../../../../../../components/demo/full-fidelity/host/HostDemoViews";

export default async function HostWalkthroughApplicantPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id } = await params;
  return <HostDemoApplicantDetail applicationId={id} />;
}
