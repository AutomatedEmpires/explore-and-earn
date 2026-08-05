import { DemoSeekerExperience } from "../../../../../components/demo/full-fidelity/seeker/DemoSeekerExperience";

export default async function SeekerDemoSeekPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly q?: string | readonly string[] }>;
}) {
  const { q } = await searchParams;
  const initialQuery = Array.isArray(q) ? q[0] ?? "" : q ?? "";
  return <DemoSeekerExperience surface="seek" initialQuery={initialQuery} />;
}
