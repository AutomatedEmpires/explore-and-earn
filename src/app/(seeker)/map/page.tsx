import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { seekerNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Map · Explore&Earn' };

export default async function MapPage() {
  notFoundInProd();
  await seekerPage('/map', { guests: true });
  return (
    <Placeholder
      title="Map"
      subProject={3}
      name="Discovery"
      icon={seekerNavIcons.map}
      description="See jobs on the map and explore by state, region and town."
    />
  );
}
