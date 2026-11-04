import type { Metadata } from 'next';
import { notFoundInProd, seekerPage } from '@/server/shell';
import { User } from '@/ui/icons';
import { Placeholder } from '@/ui/patterns/Placeholder';
import { AccountPanel } from '../_components/AccountPanel';

export const metadata: Metadata = { title: 'Profile · Explore&Earn' };

export default async function ProfilePage() {
  notFoundInProd();
  const user = await seekerPage('/profile', { guests: false });
  return (
    <Placeholder
      title="Profile"
      subProject={4}
      name="Seeker"
      icon={User}
      description="Your profile and resume, when you are available, and who can see you."
    >
      <AccountPanel email={user.email} />
    </Placeholder>
  );
}
