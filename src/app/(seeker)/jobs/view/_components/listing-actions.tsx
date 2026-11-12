'use client';

// The listing page's client parts (issue #109): the Skip · Apply · Save bar, Share and the view
// beacon. One provider holds the save and skip state, so the inline bar (768) and the pinned
// bar (390 and the 1440 panel) always agree.
//
// - Guests: Apply is a plain link through sign-in to the apply step (it works before scripts
//   load). Save and Skip need an account, so they open sign-in and come back to this listing.
// - Seekers: Save and Skip call /api/v1/me/dispositions. Skip offers Undo for 10 seconds.
// - The view (on mount) and each share are posted to /api/v1/listings/[id]/events. The API drops
//   repeats, bots and failures quietly, so the page never waits on it.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { DiscoverySource, DispositionState } from '@/lib/discovery';
import { Button, IconButton, ToastProvider, useToast } from '@/ui/components';
import { cn } from '@/ui/cn';
import { Bookmark, Check, Share, X } from '@/ui/icons';

export type ListingActionsInit = {
  listingId: string;
  title: string;
  source: DiscoverySource;
  /** A signed-in seeker; everyone else on this page is a guest. */
  seeker: boolean;
  disposition: DispositionState | null;
  applied: boolean;
  applyHref: string;
  /** Sign-in that returns to this listing. */
  signInHref: string;
};

type Actions = ListingActionsInit & {
  pending: boolean;
  toggle(target: DispositionState): Promise<void>;
};

const ActionsContext = createContext<Actions | null>(null);

function useActions(): Actions {
  const actions = useContext(ActionsContext);
  if (!actions) throw new Error('ListingActionsProvider is missing');
  return actions;
}

function postEvent(listingId: string, type: 'view' | 'share', source: DiscoverySource): void {
  void fetch(`/api/v1/listings/${encodeURIComponent(listingId)}/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, source }),
    keepalive: true,
  }).catch(() => undefined);
}

type Outcome = { ok: true } | { ok: false; status: number; message: string | null };

async function sendDisposition(
  listingId: string,
  next: DispositionState | null,
  current: DispositionState | null,
  source: DiscoverySource,
): Promise<Outcome> {
  const url = `/api/v1/me/dispositions/${encodeURIComponent(listingId)}`;
  const body =
    next === null
      ? current
        ? { expectedState: current }
        : {}
      : { state: next, source, expectedState: current };
  try {
    const res = await fetch(url, {
      method: next === null ? 'DELETE' : 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const json: unknown = await res.json().catch(() => null);
    const message =
      typeof json === 'object' &&
      json !== null &&
      'error' in json &&
      typeof json.error === 'object' &&
      json.error !== null &&
      'message' in json.error &&
      typeof json.error.message === 'string'
        ? json.error.message
        : null;
    return { ok: false, status: res.status, message };
  } catch {
    return { ok: false, status: 0, message: null };
  }
}

function failureTitle(o: Extract<Outcome, { ok: false }>): string {
  if (o.status === 404) return 'This job just closed.';
  if (o.status === 409 && o.message) return o.message;
  if (o.status === 0) return 'You’re offline. Try again when you’re back online.';
  return 'Something went wrong. Try again.';
}

function ActionsState({ init, children }: { init: ListingActionsInit; children: ReactNode }) {
  const router = useRouter();
  const { toast } = useToast();
  const [disposition, setDisposition] = useState(init.disposition);
  const [pending, setPending] = useState(false);
  const viewed = useRef(false);

  const { listingId, source } = init;
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    postEvent(listingId, 'view', source);
  }, [listingId, source]);

  const change = useCallback(
    async (next: DispositionState | null, from: DispositionState | null): Promise<boolean> => {
      setPending(true);
      const outcome = await sendDisposition(listingId, next, from, source);
      setPending(false);
      if (outcome.ok) {
        setDisposition(next);
        return true;
      }
      if (outcome.status === 401) {
        router.push(init.signInHref);
        return false;
      }
      toast({ title: failureTitle(outcome), tone: 'danger' });
      return false;
    },
    [init.signInHref, listingId, router, source, toast],
  );

  const toggle = useCallback(
    async (target: DispositionState) => {
      if (!init.seeker) {
        router.push(init.signInHref);
        return;
      }
      if (pending) return;
      const from = disposition;
      const next = from === target ? null : target;
      if (!(await change(next, from))) return;
      if (next === 'saved') toast({ title: 'Saved', tone: 'success' });
      else if (next === 'skipped') {
        toast({
          title: 'Skipped',
          action: { label: 'Undo', onAction: () => void change(from, 'skipped') },
        });
      } else toast({ title: from === 'saved' ? 'Removed from saved' : 'No longer skipped' });
    },
    [change, disposition, init.seeker, init.signInHref, pending, router, toast],
  );

  const value = useMemo(
    () => ({ ...init, disposition, pending, toggle }),
    [disposition, init, pending, toggle],
  );
  return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

/** Wraps the listing so its bars share one state and one toast region. */
export function ListingActionsProvider({
  init,
  children,
}: {
  init: ListingActionsInit;
  children: ReactNode;
}) {
  return (
    <ToastProvider>
      <ActionsState init={init}>{children}</ActionsState>
    </ToastProvider>
  );
}

/** Skip · Apply · Save (Figma 176:13673). */
export function ActionBar({ className, style }: { className?: string; style?: CSSProperties }) {
  const a = useActions();
  // Each bar has its own hint id: the inline and pinned bars are both in the document.
  const hintId = useId();
  const guestHint = a.seeker ? undefined : hintId;
  return (
    <div
      role="group"
      aria-label={`Actions for ${a.title}`}
      className={cn('flex items-center gap-2.5', className)}
      style={style}
    >
      <IconButton
        icon={X}
        label="Skip"
        variant="outline"
        size="lg"
        aria-pressed={a.seeker ? a.disposition === 'skipped' : undefined}
        aria-describedby={guestHint}
        aria-busy={a.pending || undefined}
        onClick={() => void a.toggle('skipped')}
      />
      {a.applied ? (
        <Button asChild variant="secondary" size="lg" className="min-w-0 flex-1">
          <Link href={a.applyHref}>
            <Check className="size-5" />
            Applied
          </Link>
        </Button>
      ) : (
        <Button asChild size="lg" className="min-w-0 flex-1">
          <Link href={a.applyHref} prefetch={false}>
            Apply
          </Link>
        </Button>
      )}
      <IconButton
        icon={Bookmark}
        label="Save"
        variant="outline"
        size="lg"
        aria-pressed={a.seeker ? a.disposition === 'saved' : undefined}
        aria-describedby={guestHint}
        aria-busy={a.pending || undefined}
        onClick={() => void a.toggle('saved')}
      />
      {guestHint ? (
        <span id={guestHint} className="sr-only">
          Sign in to save or skip jobs.
        </span>
      ) : null}
    </div>
  );
}

/** Share: the phone's share sheet where there is one, else the link is copied. */
export function ShareButton({ url }: { url: string }) {
  const a = useActions();
  const { toast } = useToast();
  const share = async () => {
    const absolute = new URL(url, window.location.origin).toString();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: a.title, url: absolute });
      } else {
        await navigator.clipboard.writeText(absolute);
        toast({ title: 'Link copied', tone: 'success' });
      }
      postEvent(a.listingId, 'share', a.source);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast({ title: 'Couldn’t share this job. Copy the address from your browser.', tone: 'danger' });
    }
  };
  return (
    <Button variant="ghost" icon={Share} onClick={() => void share()}>
      Share
    </Button>
  );
}
