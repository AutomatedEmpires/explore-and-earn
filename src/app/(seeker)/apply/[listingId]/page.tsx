import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isClosed, loadListing } from '../../jobs/view/_lib/load';
import { seekerAccess, signInUrl } from '@/server/shell';
import { AccountBridge } from './_components/AccountBridge';
import { ApplyFlow } from './_components/ApplyFlow';

export const metadata: Metadata = {
  title: 'Apply · Explore&Earn',
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined): string | null {
  const picked = Array.isArray(value) ? value[0] : value;
  return picked && picked.length > 0 ? picked : null;
}

export default async function ApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { listingId } = await params;
  const query = await searchParams;
  const source = one(query.source) ?? 'other';
  const invite = one(query.invite);
  const qs = new URLSearchParams({ source });
  if (invite) qs.set('invite', invite);
  const path = `/apply/${encodeURIComponent(listingId)}?${qs.toString()}`;

  const access = await seekerAccess();
  if (access.kind === 'redirect') redirect(access.to);
  if (access.kind !== 'ok') {
    const job = await jobLine(listingId);
    return <AccountBridge jobTitle={job.title} orgName={job.org} signInHref={signInUrl(path)} />;
  }
  return <ApplyFlow listingId={listingId} source={source} invite={invite} />;
}

async function jobLine(listingId: string): Promise<{ title: string; org: string }> {
  try {
    const detail = await loadListing(listingId, null, 'UTC');
    if (!detail) return { title: 'this job', org: 'The host' };
    const card = isClosed(detail) ? detail.card : detail;
    return { title: card.title, org: card.host.name };
  } catch {
    return { title: 'this job', org: 'The host' };
  }
}
