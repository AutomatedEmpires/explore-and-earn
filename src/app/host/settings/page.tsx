import type { Metadata } from 'next';
import { hostPage, notFoundInProd } from '@/server/shell';
import { Settings } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';

export const metadata: Metadata = { title: 'Settings · Explore&Earn' };

export default async function SettingsPage() {
  notFoundInProd();
  await hostPage('/host/settings');
  return (
    <Placeholder
      title="Settings"
      subProject={2}
      name="Host supply and billing"
      icon={Settings}
      description="Your organization's details and preferences."
    />
  );
}
