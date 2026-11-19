'use client';

// NotificationList: the in-app notifications, newest first, with mark-read (SP4 spec 7; plan
// Task 35). It takes no role-specific props, so SP5 mounts it in the host shell as is.
//
// - Foundation's GET /api/v1/notifications?limit=&before= (20 a page, "Load more") and
//   POST /api/v1/notifications/read with `{ ids: [id] }` or `{ ids: 'all' }`.
// - Tapping an unread row marks it read, calls useCounts().refresh() so the top bar badge
//   updates at once, then opens the row's link when it has one.
//
// Design: the approved seeker inbox list (Figma 03 Hiring "Seeker inbox" 68:30941, 1440
// 68:31066): one card per item with a bold title and plain lines, plus EmptyState, ErrorState
// and Skeleton. Unread is a dot and the word "Unread" for screen readers, never color alone.
// Lead's designops rule 7 answer on #145.
import { useRouter } from 'next/navigation';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { Button, EmptyState, ErrorState, Notice, Skeleton } from '@/ui/components';
import { Bell } from '@/ui/icons';
import { apiFetch } from '../api';
import { useCounts } from '../counts/CountsProvider';
import { relativeTime } from './relative-time';

export type NotificationListProps = { pageSize?: number };

/** One row of GET /api/v1/notifications (Foundation's route contract). */
type Item = {
  id: string;
  type: string;
  category: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

type Page = { items: Item[]; nextBefore: string | null; unread: number };

type State =
  | { phase: 'loading' }
  | { phase: 'error' }
  | {
      phase: 'ready';
      items: Item[];
      nextBefore: string | null;
      unread: number;
      /** The clock the relative times read from: set on load, moved on each minute. */
      now: number;
    };

const MINUTE_MS = 60_000;

/** The row's link: the route's `url`, else `data.url`. Only site paths and web addresses. */
function destination(item: Item): string | null {
  const raw = item.url ?? (typeof item.data.url === 'string' ? item.data.url : null);
  if (!raw) return null;
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function markRead(items: Item[], ids: readonly string[] | 'all', at: string): Item[] {
  return items.map((item) =>
    item.readAt === null && (ids === 'all' || ids.includes(item.id))
      ? { ...item, readAt: at }
      : item,
  );
}

function ListSkeleton() {
  return (
    <div role="status" aria-label="Loading notifications" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-4">
          <Skeleton shape="text" className="h-5 w-1/2" />
          <Skeleton shape="text" className="w-5/6" />
          <Skeleton shape="text" className="w-1/4" />
        </div>
      ))}
    </div>
  );
}

function Row({ item, now, onOpen }: { item: Item; now: number; onOpen(item: Item): void }) {
  const unread = item.readAt === null;
  const href = destination(item);
  const content = (
    <>
      <span className="flex items-center gap-2">
        {unread ? (
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-primary" />
        ) : null}
        <span className="text-16 font-bold wrap-anywhere text-ink">{item.title}</span>
      </span>
      {item.body ? <span className="text-16 wrap-anywhere text-ink">{item.body}</span> : null}
      <time dateTime={item.createdAt} className="text-14 text-muted">
        {relativeTime(item.createdAt, now)}
      </time>
      {unread ? <span className="sr-only">Unread</span> : null}
    </>
  );
  const className =
    'flex w-full flex-col items-start gap-2 rounded-xl border border-line bg-surface p-4 text-left text-ink no-underline hover:bg-surface-2 motion-safe:transition-colors';
  if (href) {
    const open = (event: MouseEvent<HTMLAnchorElement>) => {
      // A new tab or window keeps the browser's own behaviour.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
        return;
      event.preventDefault();
      onOpen(item);
    };
    return (
      <a href={href} onClick={open} className={className}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(item)} className={className}>
      {content}
    </button>
  );
}

export function NotificationList({ pageSize = 20 }: NotificationListProps): ReactNode {
  const router = useRouter();
  const { refresh } = useCounts();
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [marking, setMarking] = useState<'idle' | 'sending' | 'failed'>('idle');

  useEffect(() => {
    let live = true;
    apiFetch<Page>(`/api/v1/notifications?limit=${pageSize}`).then(
      (page) => {
        if (live) setState({ phase: 'ready', ...page, now: Date.now() });
      },
      () => {
        if (live) setState({ phase: 'error' });
      },
    );
    return () => {
      live = false;
    };
  }, [pageSize, attempt]);

  // "5 minutes ago" keeps up while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => {
      setState((s) => (s.phase === 'ready' ? { ...s, now: Date.now() } : s));
    }, MINUTE_MS);
    return () => clearInterval(timer);
  }, []);

  function retry() {
    setState({ phase: 'loading' });
    setAttempt((n) => n + 1);
  }

  async function loadMore() {
    if (state.phase !== 'ready' || !state.nextBefore) return;
    setMore('loading');
    try {
      const before = encodeURIComponent(state.nextBefore);
      const page = await apiFetch<Page>(`/api/v1/notifications?limit=${pageSize}&before=${before}`);
      setState((s) => {
        if (s.phase !== 'ready') return s;
        const seen = new Set(s.items.map((i) => i.id));
        return {
          ...s,
          items: [...s.items, ...page.items.filter((i) => !seen.has(i.id))],
          nextBefore: page.nextBefore,
        };
      });
      setMore('idle');
    } catch {
      setMore('failed');
    }
  }

  function go(href: string) {
    if (href.startsWith('/')) router.push(href);
    else window.location.assign(href);
  }

  async function open(item: Item) {
    if (item.readAt === null) {
      const at = new Date().toISOString();
      setState((s) =>
        s.phase === 'ready'
          ? { ...s, items: markRead(s.items, [item.id], at), unread: Math.max(0, s.unread - 1) }
          : s,
      );
      try {
        await apiFetch('/api/v1/notifications/read', { method: 'POST', json: { ids: [item.id] } });
      } catch {
        // The row reads as read here; the next load shows what the server kept.
      }
      refresh();
    }
    const href = destination(item);
    if (href) go(href);
  }

  async function markAll() {
    setMarking('sending');
    try {
      await apiFetch('/api/v1/notifications/read', { method: 'POST', json: { ids: 'all' } });
      const at = new Date().toISOString();
      setState((s) =>
        s.phase === 'ready' ? { ...s, items: markRead(s.items, 'all', at), unread: 0 } : s,
      );
      setMarking('idle');
      refresh();
    } catch {
      setMarking('failed');
    }
  }

  if (state.phase === 'loading') return <ListSkeleton />;
  if (state.phase === 'error') {
    return (
      <ErrorState
        title="We couldn't load your notifications"
        description="Check your connection and try again."
        action={
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        }
      />
    );
  }

  const { now } = state;
  const anyUnread = state.unread > 0 || state.items.some((i) => i.readAt === null);
  return (
    <div className="flex flex-col gap-4">
      {anyUnread ? (
        <div className="flex justify-end">
          <Button
            variant="secondary"
            loading={marking === 'sending'}
            onClick={() => void markAll()}
          >
            Mark all as read
          </Button>
        </div>
      ) : null}
      {marking === 'failed' ? (
        <Notice tone="danger" title="We couldn't mark them read. Try again." announce="assertive" />
      ) : null}
      {state.items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications yet." />
      ) : (
        <ul className="flex flex-col gap-3">
          {state.items.map((item) => (
            <li key={item.id}>
              <Row item={item} now={now} onOpen={(i) => void open(i)} />
            </li>
          ))}
        </ul>
      )}
      {more === 'failed' ? (
        <Notice tone="danger" title="We couldn't load more. Try again." announce="assertive" />
      ) : null}
      {state.nextBefore ? (
        <Button
          variant="secondary"
          size="lg"
          fullWidth
          loading={more === 'loading'}
          onClick={() => void loadMore()}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
