import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { House } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Home · Explore&Earn' };

export default async function HostHomePage() {
  notFoundInProd();
  await hostPage('/host');
  return (
    <Placeholder
      title="Home"
      subProject={5}
      name="Host hiring"
      icon={House}
      description="Today's applicants and interviews, unread messages, reminders and your listing quota."
    />
  );
}
