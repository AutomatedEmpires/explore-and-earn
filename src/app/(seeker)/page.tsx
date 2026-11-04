import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { Search } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Seek · Explore&Earn' };

export default async function SeekPage() {
  notFoundInProd();
  await seekerPage('/', { guests: true });
  return (
    <Placeholder
      title="Seek"
      subProject={3}
      name="Discovery"
      icon={Search}
      description="Search seasonal, maritime, farm and remote jobs, and filter for the ones with housing and meals."
    />
  );
}
