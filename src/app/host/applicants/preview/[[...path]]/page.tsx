import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getEnv } from '@/lib/env';
import { hostAccess } from '@/server/shell';
import { HostShell } from '../../../_components/HostShell';
import { ReplyScreen } from '../../../messages/_components/ReplyScreen';
import { ApplicantsScreen } from '../../_components/ApplicantsScreen';
import { SAMPLE_ORG } from '../../_lib/sample';

export const metadata: Metadata = {
  title: 'Applicants preview · Explore&Earn',
  robots: { index: false },
};

const BASE = '/host/applicants/preview';

// Development only (APP_ENV=dev; 404 anywhere else). Flow D's real screens with the Figma sample
// organization, inside the host shell, without a signed-in host: Applicants at the base path and
// the reply step at `messages/<threadId>/reply`. Every screen still calls the real /api/v1
// routes; tests/e2e/flow-d-answer-applicant.spec.ts answers them with contract-checked fixtures,
// because a keyless Clerk development instance has Organizations turned off (see
// tests/e2e/shells.spec.ts) and so can't sign a host in. Without those fixtures the API answers
// 401 and the screens show their error states.
export default async function ApplicantsPreviewPage({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  if (getEnv().APP_ENV !== 'dev') notFound();
  const { path = [] } = await params;
  const [first, threadId, last] = path;

  let screen: ReactNode;
  if (path.length === 0) {
    screen = <ApplicantsScreen orgName={SAMPLE_ORG} replyBase={`${BASE}/messages`} />;
  } else if (first === 'messages' && threadId && last === 'reply' && path.length === 3) {
    screen = <ReplyScreen threadId={threadId} orgName={SAMPLE_ORG} applicantsHref={BASE} />;
  } else {
    notFound();
  }

  // A signed-in host already has the shell from the host layout.
  if ((await hostAccess()).kind !== 'guest') return screen;
  return <HostShell org={{ clerkOrgId: 'org_preview', roleLabel: 'Owner' }}>{screen}</HostShell>;
}
