import type { Metadata } from 'next';
import { NotificationList } from '@/app/_components/NotificationList';
import { getDb } from '@/lib/db';
import { listNotifications } from '@/modules/notifications';
import { seekerPage } from '@/server/shell';
import { seekerNavIcons } from '@/ui/nav-icons';

export const metadata: Metadata = { title: 'Notifications · Explore&Earn' };

// Notifications already work (Foundation, Task 17), so this page is real, not a placeholder.
export default async function NotificationsPage() {
  const user = await seekerPage('/notifications', { guests: false });
  const { items } = await listNotifications(getDb(), user.id, { limit: 50 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">Notifications</h1>
      <NotificationList
        items={items}
        icon={seekerNavIcons.notifications}
        emptyDescription="Updates on your applications, invites and messages will show up here."
      />
    </div>
  );
}
