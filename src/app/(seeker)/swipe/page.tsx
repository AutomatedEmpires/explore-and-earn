import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { seekerNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Swipe · Explore&Earn' };

export default async function SwipePage() {
  notFoundInProd();
  await seekerPage('/swipe', { guests: true });
  return (
    <Placeholder
      title="Swipe"
      subProject={3}
      name="Discovery"
      icon={seekerNavIcons.swipe}
      description="Go through jobs one card at a time. Save the ones you like and skip the rest."
    />
  );
}
