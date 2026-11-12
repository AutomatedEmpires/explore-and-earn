// /jobs/view/[id]/[slug]: the listing page (issue #109, flow A; SP3 spec 8.9 and 8.11, plan
// Tasks 34 and 41). Guests see the whole deal with no login wall; Apply goes through sign-in
// (the account bridge) and returns to the apply step. The facts render on the server.
// - A wrong slug answers 308 to the canonical address, keeping `source`.
// - Unknown and removed listings are 404; a closed listing shows its closed view and noindex.
// - Active listings carry the JobPosting JSON-LD.
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { buildJobPostingJsonLd } from '@/modules/landing';
import { seekerPage, signInUrl } from '@/server/shell';
import { getPageViewer } from '@/server/viewer';
import { ClosedListing } from '../../_components/closed-listing';
import { ListingDetail } from '../../_components/listing-detail';
import { buildListingView } from '../../_lib/listing-view';
import {
  applyHref,
  canonicalPath,
  isClosed,
  loadListing,
  photoAlts,
  slugOf,
  sourceOf,
} from '../../_lib/load';

type JobParams = { id: string; slug: string };
type Search = Record<string, string | string[] | undefined>;

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

export default async function JobViewPage({
  params,
  searchParams,
}: {
  params: Promise<JobParams>;
  searchParams: Promise<Search>;
}) {
  const { id, slug } = await params;
  const path = `/jobs/view/${encodeURIComponent(id)}/${encodeURIComponent(slug)}`;
  const seeker = (await seekerPage(path, { guests: true })) !== null;
  const viewer = await getPageViewer();
  const detail = await loadListing(id, viewer.seekerId, viewer.tz);
  if (!detail) notFound();

  const source = sourceOf((await searchParams).source);
  const canonical = canonicalPath(detail);
  const here = source === 'other' ? canonical : `${canonical}?source=${source}`;

  if (isClosed(detail)) {
    return <ClosedListing card={detail.card} seeker={seeker} signInHref={signInUrl(here)} />;
  }
  if (slug !== slugOf(detail.href, detail.listingId)) permanentRedirect(here);

  const view = buildListingView(detail, await photoAlts(detail));
  return (
    <>
      <ListingDetail
        view={view}
        path={canonical}
        actions={{
          listingId: detail.listingId,
          title: detail.title,
          source,
          seeker,
          disposition: detail.viewer?.disposition ?? null,
          applied: detail.viewer?.applied ?? false,
          applyHref: applyHref(detail.listingId, source, seeker),
          signInHref: signInUrl(here),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: buildJobPostingJsonLd(detail, getEnv().APP_URL) }}
      />
    </>
  );
}
