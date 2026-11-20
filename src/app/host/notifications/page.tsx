import type { Metadata } from 'next';
import { NotificationList } from '@/app/_features/notifications/NotificationList';
import { hostPage } from '@/server/shell';

export const metadata: Metadata = { title: 'Notifications · Explore&Earn' };

// The host's Notifications (the phone top bar's bell, and the desktop sidebar's). They belong to
// the user, as on the seeker side, so the page mounts the same W7 NotificationList (#145; issue
// 224), which takes no role-specific props and reads GET /api/v1/notifications itself.
export default async function HostNotificationsPage() {
  await hostPage('/host/notifications');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">Notifications</h1>
      <NotificationList />
    </div>
  );
}
