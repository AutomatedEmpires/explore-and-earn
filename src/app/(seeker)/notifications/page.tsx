import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { listNotifications, type NotificationItem } from '@/modules/notifications';
import { seekerPage } from '@/server/shell';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/components';
import { Bell } from '@/ui/icons';

export const metadata: Metadata = { title: 'Notifications · Explore&Earn' };

const when = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

function NotificationRow({ item }: { item: NotificationItem }) {
  const unread = item.readAt === null;
  const title = (
    <span className={cn('text-15 text-ink', unread ? 'font-bold' : 'font-semibold')}>
      {item.title}
    </span>
  );
  return (
    <div className="flex gap-3 px-4 py-4 sm:px-6">
      <span
        aria-hidden="true"
        className={cn('mt-2 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-line')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          {item.url ? (
            <a href={item.url} className="rounded-sm underline-offset-2 hover:underline">
              {title}
            </a>
          ) : (
            title
          )}
          <time dateTime={item.createdAt.toISOString()} className="shrink-0 text-13 text-muted">
            {when.format(item.createdAt)}
          </time>
        </div>
        {item.body ? <p className="text-14 text-ink-2">{item.body}</p> : null}
        {unread ? <span className="sr-only">Unread</span> : null}
      </div>
    </div>
  );
}

// Notifications already work (Foundation, Task 17), so this page is real, not a placeholder.
export default async function NotificationsPage() {
  const user = await seekerPage('/notifications', { guests: false });
  const { items } = await listNotifications(getDb(), user.id, { limit: 50 });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-28 font-extrabold tracking-tight text-ink">Notifications</h1>
      {items.length === 0 ? (
        <section className="rounded-xl border border-line bg-surface shadow-card">
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="Updates on your applications, invites and messages will show up here."
            className="max-w-md py-14"
          />
        </section>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
