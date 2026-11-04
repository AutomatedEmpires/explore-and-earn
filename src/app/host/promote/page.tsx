import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Promote · Explore&Earn' };

export default async function PromotePage() {
  notFoundInProd();
  await hostPage('/host/promote');
  return (
    <Placeholder
      title="Promote"
      subProject={6}
      name="Paid add-ons"
      icon={hostNavIcons.promote}
      description="Boosts, announcements and your credits."
    />
  );
}
