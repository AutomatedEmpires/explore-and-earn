'use client';

// The listing couldn't be loaded (Figma 178:16415) or the phone is offline (178:16539). The
// offline view follows the connection as it changes and tries again once the phone is back
// online. Next.js passes `retry` to error boundaries (Next 16).
import { WifiOff } from 'lucide-react'; // not in src/ui/icons yet; #111 adds the export
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Button, EmptyState, ErrorState } from '@/ui/components';

function subscribe(onChange: () => void): () => void {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** False only when the browser knows it has no connection. */
function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export default function ListingError({ retry }: { error: unknown; retry: () => void }) {
  const online = useOnline();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      retry();
    }
  }, [online, retry]);

  const tryAgain = (
    <Button variant="secondary" onClick={() => retry()}>
      Try again
    </Button>
  );

  // The page's metadata failed with it, so the boundary names the document itself (React hoists
  // <title> into <head>).
  if (!online) {
    return (
      <div role="alert">
        <title>You’re offline · Explore&amp;Earn</title>
        <EmptyState
          icon={WifiOff}
          titleAs="h1"
          title="You’re offline"
          description="We’ll load this job when you’re back online."
          action={tryAgain}
        />
      </div>
    );
  }
  return (
    <>
      <title>Couldn’t load this job · Explore&amp;Earn</title>
      <ErrorState
        titleAs="h1"
        title="Couldn’t load this job"
        description="Check your connection, then try again."
        action={tryAgain}
      />
    </>
  );
}
