import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEnv } from '@/lib/env';
import { PREVIEW_SCREENS, W7Preview, type PreviewScreen } from '../_components/W7Preview';

export const metadata: Metadata = {
  title: 'Shared UI preview · Explore&Earn',
  robots: { index: false, follow: false },
};

// Development only (APP_ENV=dev; 404 anywhere else). SP4 W7's shared UI (ReportSheet and the
// /report form, BlockDialog, MuteToggle, ApplicationSnapshotView, CandidateProfileView and
// NotificationList) on the Figma sample content, without a signed-in user, for
// tests/e2e/w7-shared-ui.spec.ts. As in the flow C and D previews, every component still calls
// the real /api/v1 routes; the spec answers them with contract-checked fakes.
export default async function W7PreviewPage({ params }: { params: Promise<{ path?: string[] }> }) {
  if (getEnv().APP_ENV !== 'dev') notFound();
  const { path = [] } = await params;
  if (path.length > 1) notFound();
  const [name] = path;
  if (name !== undefined && !(PREVIEW_SCREENS as readonly string[]).includes(name)) notFound();
  return <W7Preview screen={(name as PreviewScreen | undefined) ?? null} />;
}
