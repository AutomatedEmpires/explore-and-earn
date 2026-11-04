import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Analytics · Explore&Earn' };

export default async function AnalyticsPage() {
  notFoundInProd();
  await hostPage('/host/analytics');
  return (
    <Placeholder
      title="Analytics"
      subProject={5}
      name="Host hiring"
      icon={hostNavIcons.analytics}
      description="How your listings perform, from views to hires."
    />
  );
}
