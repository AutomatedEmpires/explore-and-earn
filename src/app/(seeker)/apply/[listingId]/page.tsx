// /apply/[listingId]: where Apply leads (from a card, the deck, the detail page and a returning
// guest's sign-in). A placeholder until SP4 replaces this file with the apply review; hidden in
// prod. SP3 links here with `?source=` for attribution (spec 8.7 and 8.12).
import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = {
  title: 'Apply · Explore&Earn',
  robots: { index: false, follow: false },
};

export default async function ApplyPage({ params }: PageProps<'/apply/[listingId]'>) {
  notFoundInProd();
  const { listingId } = await params;
  await seekerPage(`/apply/${encodeURIComponent(listingId)}`, { guests: false });
  return <Placeholder title="Apply" subProject={4} name="Seeker" />;
}
