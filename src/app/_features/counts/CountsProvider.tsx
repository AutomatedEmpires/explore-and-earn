'use client';

// The signed-in user's top bar counts (SP4 plan Task 6): inbox, notifications and the Profile
// tab's "needs attention" dot, live from GET /api/v1/me/stream (event `counts`). refresh()
// reopens the stream, which sends the counts at once, so a screen that just marked a
// notification read updates the badge without waiting for the next event.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ShellCounts = { inbox: number; notifications: number; profileDot: boolean };

type CountsValue = { counts: ShellCounts | null; refresh(): void };

const CountsContext = createContext<CountsValue>({ counts: null, refresh: () => {} });

function isCounts(value: unknown): value is ShellCounts {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.inbox === 'number' && typeof v.notifications === 'number';
}

export function CountsProvider({
  enabled,
  initial = null,
  children,
}: {
  /** False for guests: nothing is opened. */
  enabled: boolean;
  initial?: ShellCounts | null;
  children: ReactNode;
}) {
  const [counts, setCounts] = useState<ShellCounts | null>(initial);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/v1/me/stream');
    source.addEventListener('counts', (event) => {
      try {
        const parsed: unknown = JSON.parse((event as MessageEvent<string>).data);
        if (isCounts(parsed)) {
          setCounts({ ...parsed, profileDot: parsed.profileDot === true });
        }
      } catch {
        // A malformed event is skipped; the next one carries the full counts again.
      }
    });
    return () => source.close();
  }, [enabled, generation]);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);
  const value = useMemo(() => ({ counts, refresh }), [counts, refresh]);
  return <CountsContext value={value}>{children}</CountsContext>;
}

/** The latest counts (null until the first event) and a way to ask for fresh ones. */
export function useCounts(): CountsValue {
  return useContext(CountsContext);
}
