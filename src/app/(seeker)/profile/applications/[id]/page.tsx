import type { Metadata } from 'next';
import { seekerPage } from '@/server/shell';
import { ApplicationStatus } from '../_components/ApplicationStatus';

export const metadata: Metadata = {
  title: 'Application · Explore&Earn',
  robots: { index: false, follow: false },
};

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await seekerPage(`/profile/applications/${encodeURIComponent(id)}`, { guests: false });
  return <ApplicationStatus applicationId={id} />;
}
