import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { seekerNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Inbox · Explore&Earn' };

export default async function InboxPage() {
  notFoundInProd();
  await seekerPage('/inbox', { guests: false });
  return (
    <Placeholder
      title="Inbox"
      subProject={4}
      name="Seeker"
      icon={seekerNavIcons.inbox}
      description="Messages from hosts, job invites and interview invites, all in one place."
    />
  );
}
