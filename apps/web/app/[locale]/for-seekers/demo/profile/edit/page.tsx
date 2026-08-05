import { DemoSeekerExperience } from "../../../../../../components/demo/full-fidelity/seeker/DemoSeekerExperience";

export default async function SeekerDemoProfileEditAliasPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly apply?: string | readonly string[] }>;
}) {
  const { apply } = await searchParams;
  const pendingApplicationListingId = Array.isArray(apply) ? apply[0] : apply;

  return (
    <DemoSeekerExperience
      surface="profileEdit"
      pendingApplicationListingId={pendingApplicationListingId}
    />
  );
}
