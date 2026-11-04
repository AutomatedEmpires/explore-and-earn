import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';
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
      icon={hostNavIcons.team}
      description="Invite your team and choose what each person can do."
    />
  );
}
