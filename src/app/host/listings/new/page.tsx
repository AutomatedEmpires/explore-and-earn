import type { Metadata } from 'next';
import { hostPage } from '@/server/shell';
import { StartScreen } from '../_components/StartScreen';
import { orgName } from '../_server/context';

export const metadata: Metadata = { title: 'New listing · Explore&Earn' };

// Start a listing (Figma 01 Host, 43:10808): blank, a copy, or a pasted job post.
export default async function NewListingPage() {
  const host = await hostPage('/host/listings/new');
  return <StartScreen base="/host/listings" orgName={await orgName(host.orgId)} />;
}
