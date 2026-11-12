import type { Metadata } from 'next';
import { hostPage } from '@/server/shell';
import { ListingsScreen } from './_components/ListingsScreen';

export const metadata: Metadata = { title: 'Listings · Explore&Earn' };

// The host's listings (Figma 01 Host, 37:2629): the start of flow C when there are none yet.
export default async function ListingsPage() {
  await hostPage('/host/listings');
  return <ListingsScreen base="/host/listings" />;
}
