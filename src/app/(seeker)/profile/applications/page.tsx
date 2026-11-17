import type { Metadata } from 'next';
import { seekerPage } from '@/server/shell';
import { ApplicationList } from './_components/ApplicationList';

export const metadata: Metadata = {
  title: 'Applications · Explore&Earn',
  robots: { index: false, follow: false },
};

export default async function ApplicationsPage() {
  await seekerPage('/profile/applications', { guests: false });
  return <ApplicationList />;
}
