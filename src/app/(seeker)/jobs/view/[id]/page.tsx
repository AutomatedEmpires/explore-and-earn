// /jobs/view/[id] without its slug: 308 to the canonical address, keeping `source` (SP3 plan
// Task 34). Unknown and removed listings are 404.
import { notFound, permanentRedirect } from 'next/navigation';
import { getPageViewer } from '@/server/viewer';
import { canonicalPath, loadListing, sourceOf } from '../_lib/load';

export default async function JobIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const viewer = await getPageViewer();
  const detail = await loadListing(id, viewer.seekerId, viewer.tz);
  if (!detail) notFound();
  const source = sourceOf((await searchParams).source);
  const canonical = canonicalPath(detail);
  permanentRedirect(source === 'other' ? canonical : `${canonical}?source=${source}`);
}
