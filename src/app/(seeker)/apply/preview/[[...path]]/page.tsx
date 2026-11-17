// Development-only flow B screens (APP_ENV=dev; 404 elsewhere). The same components as
// /apply/[listingId] and the status page, inside the seeker shell, without a signed-in seeker.
// tests/e2e/flow-b-first-application.spec.ts answers the apply API. A keyless Clerk instance
// cannot finish a real seeker session, and profile reads are still the W0 stub (#134).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { signInUrl } from '@/server/shell';
import { ApplicationStatus } from '../../../profile/applications/_components/ApplicationStatus';
import { AccountBridge } from '../../[listingId]/_components/AccountBridge';
import { ApplyFlow } from '../../[listingId]/_components/ApplyFlow';
import {
  LISTING_ID,
  SAMPLE_JOB,
  SAMPLE_ORG,
  sampleReceipt,
} from '../../[listingId]/_lib/sample';

export const metadata: Metadata = {
  title: 'Apply preview · Explore&Earn',
  robots: { index: false },
};

const FALLBACK = { title: SAMPLE_JOB, orgName: SAMPLE_ORG };

export default async function ApplyPreviewPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  if (getEnv().APP_ENV !== 'dev') notFound();
  const { path = [] } = await params;
  const screen = path[0] ?? 'bridge';
  const signInHref = signInUrl(`/apply/${LISTING_ID}?source=other`);

  if (path.length > 1) notFound();
  if (screen === 'bridge') {
    return <AccountBridge jobTitle={SAMPLE_JOB} orgName={SAMPLE_ORG} signInHref={signInHref} />;
  }
  if (screen === 'status') return <ApplicationStatus receipt={sampleReceipt()} />;
  if (screen === 'sent') {
    return (
      <ApplyFlow
        listingId={LISTING_ID}
        source="other"
        invite={null}
        fallback={FALLBACK}
        initial={{ name: 'sent', receipt: sampleReceipt() }}
      />
    );
  }
  if (screen === 'error' || screen === 'offline') {
    return (
      <ApplyFlow
        listingId={LISTING_ID}
        source="other"
        invite={null}
        fallback={FALLBACK}
        initial={{ name: screen }}
      />
    );
  }
  if (screen === 'flow') {
    return <ApplyFlow listingId={LISTING_ID} source="other" invite={null} fallback={FALLBACK} />;
  }
  notFound();
}
