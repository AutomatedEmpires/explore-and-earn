// The signed-in user's notifications (Foundation Task 17), newest first: the seeker's and the
// host's Notifications pages. Notifications belong to the user, not to a shell.
import type { NotificationItem } from '@/modules/notifications';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/components';
import type { IconComponent } from '@/ui/icons';

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
  // The title line is 44 px tall, a link or not, so the link is a full touch target and the dot
  // lines up with the title either way.
  const titleLine = 'inline-flex min-h-11 w-fit items-center';
  return (
    <div className="flex gap-3 px-4 py-3 sm:px-6">
      <span
        aria-hidden="true"
        className={cn('mt-4.5 size-2 shrink-0 rounded-full', unread ? 'bg-primary' : 'bg-line')}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
          {item.url ? (
            <a
              href={item.url}
              className={cn(titleLine, 'rounded-sm underline-offset-2 hover:underline')}
            >
              {title}
            </a>
          ) : (
            <span className={titleLine}>{title}</span>
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

export type NotificationListProps = {
  items: readonly NotificationItem[];
  icon: IconComponent;
  /** What will show up here, for the empty state. */
  emptyDescription: string;
};

export function NotificationList({ items, icon, emptyDescription }: NotificationListProps) {
  if (items.length === 0) {
    return (
      <section className="rounded-xl border border-line bg-surface shadow-card">
        <EmptyState
          icon={icon}
          title="No notifications yet"
          description={emptyDescription}
          className="max-w-md py-14"
        />
      </section>
    );
  }
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card">
      {items.map((item) => (
        <li key={item.id}>
          <NotificationRow item={item} />
        </li>
      ))}
    </ul>
  );
}
