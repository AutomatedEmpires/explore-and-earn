import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';
import { getEnv } from '@/lib/env';
import { hostAccess } from '@/server/shell';
import { HostShell } from '../../../_components/HostShell';
import { InReviewScreen } from '../../_components/InReviewScreen';
import { ListingBuilder } from '../../_components/ListingBuilder';
import { ListingsScreen } from '../../_components/ListingsScreen';
import { StartScreen } from '../../_components/StartScreen';
import { SAMPLE_DESTINATIONS, SAMPLE_IDS, SAMPLE_OCCUPATIONS, SAMPLE_ORG } from '../../_lib/sample';

export const metadata: Metadata = {
  title: 'Listings preview · Explore&Earn',
  robots: { index: false },
};

const BASE = '/host/listings/preview';

// Development only (APP_ENV=dev; 404 anywhere else). Flow C's real screens with the Figma sample
// organization, inside the host shell, without a signed-in host. Every screen still calls the
// real /api/v1 routes; tests/e2e/flow-c-first-listing.spec.ts answers them with contract-checked
// fixtures, because a keyless Clerk development instance has Organizations turned off (see
// tests/e2e/shells.spec.ts) and so can't sign a host in. Without those fixtures the API answers
// 401 and the screens show their error states.
export default async function ListingsPreviewPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  if (getEnv().APP_ENV !== 'dev') notFound();
  const { path = [] } = await params;
  const [first, second] = path;

  let screen: ReactNode;
  if (path.length === 0) {
    screen = <ListingsScreen base={BASE} />;
  } else if (first === 'new' && path.length === 1) {
    screen = <StartScreen base={BASE} orgName={SAMPLE_ORG} />;
  } else if (first && second === 'in-review' && path.length === 2) {
    screen = <InReviewScreen base={BASE} listingId={first} orgName={SAMPLE_ORG} />;
  } else if (first && path.length === 1) {
    screen = (
      <Suspense>
        <ListingBuilder
          listingId={first}
          base={BASE}
          viewerUserId={SAMPLE_IDS.viewer}
          orgName={SAMPLE_ORG}
          occupations={SAMPLE_OCCUPATIONS}
          destinations={SAMPLE_DESTINATIONS}
        />
      </Suspense>
    );
  } else {
    notFound();
  }

  // A signed-in host already has the shell from the host layout.
  if ((await hostAccess()).kind !== 'guest') return screen;
  return <HostShell org={{ clerkOrgId: 'org_preview', roleLabel: 'Owner' }}>{screen}</HostShell>;
}
