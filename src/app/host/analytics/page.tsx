import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { ChartColumn } from '@/ui/icons';
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
      icon={ChartColumn}
      description="How your listings perform, from views to hires."
    />
  );
}
