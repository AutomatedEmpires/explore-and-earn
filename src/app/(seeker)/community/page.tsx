import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { Users } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Community · Explore&Earn' };

export default async function CommunityPage() {
  notFoundInProd();
  await seekerPage('/community', { guests: true });
  return (
    <Placeholder
      title="Community"
      subProject={7}
      name="Community"
      icon={Users}
      description="Photos and stories from people working these jobs, and the places they lead to."
    />
  );
}
