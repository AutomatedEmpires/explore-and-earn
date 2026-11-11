// Listing page metadata and JobPosting JSON-LD only (SP3 spec 8.11, plan Task 41).
// The page body stays with the listing screen; this file adds the head and the script.
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { getEnv } from '@/lib/env';
import type { JobCardData, ListingDetail } from '@/lib/discovery';
import { getListingDetail } from '@/modules/discovery';
import { buildJobPostingJsonLd } from '@/modules/landing';
import { seekerPage } from '@/server/shell';
import { getPageViewer } from '@/server/viewer';

type JobParams = { id: string; slug: string };

const loadListing = cache(async (id: string, viewerUserId: string | null, tz: string) =>
  getListingDetail(getDb(), { listingId: id, viewerUserId, tz }),
);

function isClosed(
  detail: ListingDetail | { status: 'closed'; card: JobCardData },
): detail is { status: 'closed'; card: JobCardData } {
  return !('content' in detail);
}

function canonicalPath(detail: ListingDetail): string {
  const slug = (detail.href.split('?')[0] ?? '').split('/').pop() || detail.listingId;
  return `/jobs/view/${detail.listingId}/${slug}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<JobParams>;
}): Promise<Metadata> {
  const viewer = await getPageViewer();
  const detail = await loadListing((await params).id, viewer.seekerId, viewer.tz);
  if (!detail) notFound();
  if (isClosed(detail)) return { title: detail.card.title, robots: { index: false } };

  const canonical = canonicalPath(detail);
  const description = detail.content.job.description;
  const image = detail.cover?.src[1280];
  const images = image ? [{ url: image, alt: detail.cover?.alt ?? detail.title }] : undefined;
  return {
    title: detail.title,
    description,
    alternates: { canonical },
    openGraph: { title: detail.title, description, url: canonical, images },
    twitter: {
      card: image ? 'summary_large_image' : 'summary',
      title: detail.title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function JobViewPage({ params }: { params: Promise<JobParams> }) {
  const { id, slug } = await params;
  await seekerPage(`/jobs/view/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`, {
    guests: true,
  });
  const viewer = await getPageViewer();
  const detail = await loadListing(id, viewer.seekerId, viewer.tz);
  if (!detail) notFound();
  if (isClosed(detail)) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: buildJobPostingJsonLd(detail, getEnv().APP_URL) }}
    />
  );
}
