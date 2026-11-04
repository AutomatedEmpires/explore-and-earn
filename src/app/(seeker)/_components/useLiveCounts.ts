'use client';

import { useEffect, useState } from 'react';

export type Counts = { inbox: number; notifications: number };

const POLL_MS = 30_000;

function isCounts(value: unknown): value is Counts {
  return (
    typeof value === 'object' &&
    value !== null &&
    'inbox' in value &&
    'notifications' in value &&
    typeof value.inbox === 'number' &&
    typeof value.notifications === 'number'
  );
}

/**
 * The top bar's unread counts, live from GET /api/v1/me/stream (event "counts", foundation spec
 * section 4). Where streaming isn't available, or the server refuses the stream, it polls the
 * notifications count every 30 seconds instead.
 */
export function useLiveCounts(enabled: boolean, initial: Counts): Counts {
  const [counts, setCounts] = useState(initial);

  useEffect(() => {
    if (!enabled) return;
    let poll: ReturnType<typeof setInterval> | undefined;

    const startPolling = () => {
      if (poll) return;
      const tick = async () => {
        try {
          const res = await fetch('/api/v1/notifications?limit=1');
          if (!res.ok) return;
          const body: unknown = await res.json();
          if (typeof body === 'object' && body !== null && 'unread' in body) {
            const unread = body.unread;
            if (typeof unread === 'number') setCounts((c) => ({ ...c, notifications: unread }));
          }
        } catch {
          // Offline; the next tick tries again.
        }
      };
      void tick();
      poll = setInterval(() => void tick(), POLL_MS);
    };

    if (typeof EventSource === 'undefined') {
      startPolling();
      return () => clearInterval(poll);
    }

    const source = new EventSource('/api/v1/me/stream');
    source.addEventListener('counts', (event) => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (isCounts(parsed)) setCounts(parsed);
      } catch {
        // A malformed event; keep the last counts.
      }
    });
    // EventSource reconnects by itself; it stays closed only when the server refuses it.
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) startPolling();
    });
    return () => {
      source.close();
      clearInterval(poll);
    };
  }, [enabled]);

  return counts;
}
