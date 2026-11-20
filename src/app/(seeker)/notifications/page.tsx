import type { Metadata } from 'next';
import { NotificationList } from '@/app/_features/notifications/NotificationList';
import { seekerPage } from '@/server/shell';

export const metadata: Metadata = { title: 'Notifications · Explore&Earn' };

// The seeker's Notifications (issue 224): the W7 NotificationList (#145) under the heading. The
// list reads GET /api/v1/notifications itself, 20 a page with Load more, and marks rows read.
export default async function NotificationsPage() {
  await seekerPage('/notifications', { guests: false });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">Notifications</h1>
      <NotificationList />
    </div>
  );
}
