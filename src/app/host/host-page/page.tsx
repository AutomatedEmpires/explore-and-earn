import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { Store } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Host page · Explore&Earn' };

export default async function HostPagePage() {
  notFoundInProd();
  await hostPage('/host/host-page');
  return (
    <Placeholder
      title="Host page"
      subProject={2}
      name="Host supply and billing"
      icon={Store}
      description="Your public page: photos, housing and meals, and what it is like to work with you."
    />
  );
}
