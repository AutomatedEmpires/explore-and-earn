import type { Metadata } from 'next';
import { NotificationList } from '@/app/_components/NotificationList';
import { getDb } from '@/lib/db';
import { listNotifications } from '@/modules/notifications';
import { hostPage } from '@/server/shell';
import { hostNavIcons } from '@/ui/nav-icons';

export const metadata: Metadata = { title: 'Notifications · Explore&Earn' };

// The host's Notifications (the phone top bar's bell, and the desktop sidebar's). They belong to
// the user, as on the seeker side, and already work (Foundation, Task 17), so this page is real.
export default async function HostNotificationsPage() {
  const { user } = await hostPage('/host/notifications');
  const { items } = await listNotifications(getDb(), user.id, { limit: 50 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">Notifications</h1>
      <NotificationList
        items={items}
        icon={hostNavIcons.notifications}
        emptyDescription="Updates on your listings, applicants and team will show up here."
      />
    </div>
  );
}
