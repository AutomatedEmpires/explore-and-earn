import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { Users } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Team · Explore&Earn' };

export default async function TeamPage() {
  notFoundInProd();
  await hostPage('/host/team');
  return (
    <Placeholder
      title="Team"
      subProject={2}
      name="Host supply and billing"
      icon={Users}
      description="Invite your team and choose what each person can do."
    />
  );
}
