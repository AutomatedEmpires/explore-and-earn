import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { Briefcase } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Listings · Explore&Earn' };

export default async function ListingsPage() {
  notFoundInProd();
  await hostPage('/host/listings');
  return (
    <Placeholder
      title="Listings"
      subProject={2}
      name="Host supply and billing"
      icon={Briefcase}
      description="Build, publish and repost your listings: active, drafts and your library."
    />
  );
}
