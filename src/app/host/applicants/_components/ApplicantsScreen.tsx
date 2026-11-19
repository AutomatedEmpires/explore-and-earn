'use client';

// Applicants, the start of flow D (Figma 01 Host, section D: 45:13683 at 390, 45:13795 at 768,
// 45:13954 at 1440; Passed 45:14771 and 45:14862; offline 45:15000). Each applicant waiting on a
// reply is the system CandidateCard with Pass, Reply and Shortlist. Reply is a link to the reply
// step in Messages, so answering takes 2 taps (Reply, Send reply). Pass is 1 tap: the card leaves
// the list and a toast offers Undo for the 10 seconds the server holds the pass. A host the
// verified-host gate refuses (issue 199) sees the gate's refusal for its status in place of the
// list, as the reply step does.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ApplicantCardData } from '@/lib/hiring';
import { PASS_UNDO_MS } from '@/lib/hiring';
import {
  Button,
  CandidateCard,
  CardSkeleton,
  EmptyState,
  ErrorState,
  Toast,
  type ToastTone,
} from '@/ui/components';
import { Cloud, Lock, MessageSquare, Share } from '@/ui/icons';
import { verificationRefusal, type VerificationRefusal } from '../../messages/_lib/reply';
import { hiringApi, isOffline, isStatus, reasonOf } from '../_lib/api';
import {
  appliedDaysAgo,
  formatDate,
  fullName,
  locationLabel,
  replyHref,
  restoreAt,
  resumeHref,
  skillsCount,
  undoRemainingMs,
  waiting,
} from '../_lib/model';

/** `at` is when the list loaded, for "Applied today" and "Applied 3 days ago". */
type Loaded = { items: ApplicantCardData[]; nextCursor: string | null; at: number };
type ScreenState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Loaded }
  | { kind: 'error'; problem: 'offline' | 'denied' | 'failed' }
  | { kind: 'refused'; refusal: VerificationRefusal };

type PassToast = {
  id: number;
  kind: 'pass';
  item: ApplicantCardData;
  index: number;
  undoUntil: string;
};
type NoteToast = { id: number; kind: 'note'; title: string; description?: string; tone: ToastTone };
type ToastEntry = PassToast | NoteToast;

const NOTE_MS = 5_000;
const SECONDS = PASS_UNDO_MS / 1000;

async function load(cursor?: string | null): Promise<Loaded | ScreenState> {
  try {
    const page = await hiringApi.listWaiting(cursor);
    return { items: waiting(page.items), nextCursor: page.nextCursor, at: Date.now() };
  } catch (err) {
    const refusal = verificationRefusal(err);
    if (refusal) return { kind: 'refused', refusal };
    if (isOffline(err)) return { kind: 'error', problem: 'offline' };
    if (isStatus(err, 403)) return { kind: 'error', problem: 'denied' };
    return { kind: 'error', problem: 'failed' };
  }
}

function isLoaded(value: Loaded | ScreenState): value is Loaded {
  return 'items' in value;
}

/** Read when an Undo request fails: the toast comes back only while the window is open. */
function stillUndoable(entry: PassToast): boolean {
  return undoRemainingMs(entry.undoUntil, Date.now()) > 0;
}

/** A toast that closes on its own: a pass when its undo window ends, a note after 5 s. */
function TimedToast({ entry, onClose, onUndo }: {
  entry: ToastEntry;
  onClose: (id: number) => void;
  onUndo: (entry: PassToast) => void;
}) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // Each entry keeps its object while it is on screen, so this runs once per toast.
  useEffect(() => {
    const ms = entry.kind === 'pass' ? undoRemainingMs(entry.undoUntil, Date.now()) : NOTE_MS;
    const timer = setTimeout(() => close.current(entry.id), ms);
    return () => clearTimeout(timer);
  }, [entry]);

  if (entry.kind === 'note') {
    return (
      <Toast
        title={entry.title}
        description={entry.description}
        tone={entry.tone}
        onDismiss={() => onClose(entry.id)}
      />
    );
  }
  return (
    <Toast
      title={`${fullName(entry.item)} passed`}
      description={`${entry.item.card.firstName} won’t be told for ${SECONDS} seconds.`}
      action={{ label: 'Undo', onAction: () => onUndo(entry) }}
      onDismiss={() => onClose(entry.id)}
    />
  );
}

export function ApplicantsScreen({ orgName, replyBase }: { orgName: string; replyBase: string }) {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  // The listing of the last applicant passed, for "No one else is waiting on a reply for …".
  const [caughtUpFor, setCaughtUpFor] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const nextToast = useRef(0);

  const apply = useCallback((next: Loaded | ScreenState) => {
    setState(isLoaded(next) ? { kind: 'ready', data: next } : next);
  }, []);

  useEffect(() => {
    let live = true;
    void load().then((next) => live && apply(next));
    return () => {
      live = false;
    };
  }, [apply]);

  const retry = () => {
    setState({ kind: 'loading' });
    void load().then(apply);
  };

  const more = async (cursor: string) => {
    setLoadingMore(true);
    const next = await load(cursor);
    setLoadingMore(false);
    if (!isLoaded(next)) {
      // The gate refused the host since the list loaded: no page loads until it is verified.
      if (next.kind === 'refused') {
        setState(next);
        return;
      }
      note('We couldn’t load more applicants', 'danger', 'Check your connection, then try again.');
      return;
    }
    setState((s) =>
      s.kind === 'ready'
        ? {
            kind: 'ready',
            data: {
              items: [
                ...s.data.items,
                ...next.items.filter(
                  (i) => !s.data.items.some((have) => have.applicationId === i.applicationId),
                ),
              ],
              nextCursor: next.nextCursor,
              at: s.data.at,
            },
          }
        : s,
    );
  };

  const updateItems = (fn: (items: ApplicantCardData[]) => ApplicantCardData[]) =>
    setState((s) =>
      s.kind === 'ready' ? { kind: 'ready', data: { ...s.data, items: fn(s.data.items) } } : s,
    );

  const pushToast = (entry: Omit<PassToast, 'id'> | Omit<NoteToast, 'id'>) => {
    nextToast.current += 1;
    const id = nextToast.current;
    // Newest last; at most three on screen.
    setToasts((list) => [...list, { ...entry, id } as ToastEntry].slice(-3));
  };
  const closeToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);
  const note = (title: string, tone: ToastTone, description?: string) =>
    pushToast({ kind: 'note', title, tone, description });

  const pass = async (item: ApplicantCardData, index: number) => {
    updateItems((items) => items.filter((i) => i.applicationId !== item.applicationId));
    setCaughtUpFor(item.listingTitle);
    try {
      const { undoUntil } = await hiringApi.pass(item.applicationId);
      pushToast({ kind: 'pass', item, index, undoUntil });
    } catch (err) {
      updateItems((items) => restoreAt(items, item, index));
      note(
        `Couldn’t pass ${fullName(item)}`,
        'danger',
        isOffline(err) ? 'You are offline. Try again when you are back.' : 'Try again.',
      );
    }
  };

  const undo = async (entry: PassToast) => {
    closeToast(entry.id);
    try {
      await hiringApi.undoPass(entry.item.applicationId);
      updateItems((items) => restoreAt(items, entry.item, entry.index));
      note(`${fullName(entry.item)} is back on your list`, 'success');
    } catch (err) {
      if (reasonOf(err) === 'undo_expired') {
        note('Too late to undo', 'default', `${entry.item.card.firstName} was passed.`);
        return;
      }
      if (stillUndoable(entry)) pushToast(entry);
      note(
        'Couldn’t undo',
        'danger',
        isOffline(err) ? 'You are offline. Try again when you are back.' : 'Try again.',
      );
    }
  };

  const shortlist = async (item: ApplicantCardData) => {
    const on = item.status !== 'shortlisted';
    const set = (status: ApplicantCardData['status']) =>
      updateItems((items) =>
        items.map((i) => (i.applicationId === item.applicationId ? { ...i, status } : i)),
      );
    set(on ? 'shortlisted' : 'new');
    try {
      await hiringApi.shortlist(item.applicationId, on);
    } catch {
      set(item.status);
      note('Couldn’t update your shortlist', 'danger', 'Try again.');
    }
  };

  // Offline and the gate's refusal bring their own h1, so the page title steps aside.
  const ownHeading =
    state.kind === 'refused' || (state.kind === 'error' && state.problem === 'offline');
  const shareListing = (
    <Button asChild variant="secondary">
      <Link href="/host/listings">
        <Share className="size-5" />
        Share listing
      </Link>
    </Button>
  );

  let body: ReactNode;
  if (state.kind === 'loading') {
    body = (
      <div
        role="status"
        aria-label="Loading applicants"
        className="flex flex-col gap-4 md:flex-row md:flex-wrap"
      >
        <CardSkeleton className="md:w-sm" />
        <CardSkeleton className="hidden md:block md:w-sm" />
      </div>
    );
  } else if (state.kind === 'refused') {
    // The access refusal (ErrorState with Lock) the reply step shows, announced: it replaces the
    // loading status or the list. Its copy is the 409's own, which names the next step. Trying
    // again changes nothing until the business is verified. Only an unverified host's next step,
    // publishing a listing, has a screen today, so only it gets a link.
    body = (
      <ErrorState
        icon={Lock}
        titleAs="h1"
        title="You can see applicants once your business is verified"
        description={state.refusal.copy}
        action={
          state.refusal.status === 'unverified' ? (
            <Button asChild>
              <Link href="/host/listings">Go to listings</Link>
            </Button>
          ) : undefined
        }
        announce="alert"
      />
    );
  } else if (state.kind === 'error') {
    body =
      state.problem === 'offline' ? (
        <ErrorState
          icon={Cloud}
          titleAs="h1"
          title="You are offline"
          description="Applicants will load when you are back."
          action={<Button onClick={retry}>Try again</Button>}
          announce="none"
        />
      ) : state.problem === 'denied' ? (
        <ErrorState
          icon={Lock}
          title="Applicants are hidden for your role"
          description="Ask an Owner or Admin on your team if you need to see them."
          announce="none"
        />
      ) : (
        <ErrorState
          title="We couldn’t load applicants"
          description="Check your connection, then try again."
          action={<Button onClick={retry}>Try again</Button>}
          announce="none"
        />
      );
  } else if (state.data.items.length === 0) {
    body = caughtUpFor ? (
      <EmptyState
        title="You’re caught up"
        description={`No one else is waiting on a reply for ${caughtUpFor}.`}
        action={shareListing}
      />
    ) : (
      // EMPTY.applicants, split into the state's title and its next step.
      <EmptyState
        title="No applicants yet"
        description="Share your listing or invite candidates."
        action={shareListing}
      />
    );
  } else {
    const { items, nextCursor } = state.data;
    const now = new Date(state.data.at);
    body = (
      <>
        <ul className="flex flex-col gap-4 md:flex-row md:flex-wrap" aria-label="Waiting on a reply">
          {items.map((item, index) => {
            const name = fullName(item);
            return (
              <li key={item.applicationId} className="md:w-sm">
                <CandidateCard
                  variant="applicant"
                  titleAs="h2"
                  href={resumeHref(item.applicationId)}
                  firstName={item.card.firstName}
                  lastName={item.card.lastName}
                  location={locationLabel(item)}
                  avatarSrc={item.avatarUrl}
                  showPhoto={item.avatarUrl !== null}
                  cover={item.coverUrl ? { src: item.coverUrl, alt: '' } : null}
                  interests={[]}
                  availableFrom={
                    item.card.availabilityDate ? formatDate(item.card.availabilityDate) : undefined
                  }
                  resume={{ summary: 'PDF' }}
                  fit={item.fitScore === null ? null : { score: item.fitScore }}
                  skills={{ count: skillsCount(item) }}
                  appliedDaysAgo={appliedDaysAgo(item.appliedAt, now)}
                  appliedFor={item.listingTitle}
                  shortlisted={item.status === 'shortlisted'}
                  onPass={() => void pass(item, index)}
                  onShortlist={() => void shortlist(item)}
                  primaryAction={
                    item.threadId
                      ? { label: 'Reply', icon: MessageSquare, href: replyHref(replyBase, item.threadId) }
                      : { label: 'Reply', icon: MessageSquare }
                  }
                  onInterview={() =>
                    note(
                      `${name}’s conversation isn’t ready yet`,
                      'default',
                      'Try again in a minute.',
                    )
                  }
                />
              </li>
            );
          })}
        </ul>
        {nextCursor ? (
          <Button
            variant="secondary"
            className="self-start"
            loading={loadingMore}
            onClick={() => void more(nextCursor)}
          >
            Show more applicants
          </Button>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-16 font-semibold text-ink-2 md:hidden">{orgName}</p>
      {ownHeading ? null : (
        <header className="flex flex-col gap-4">
          <h1 className="text-24 font-extrabold text-ink">Applicants</h1>
          <p className="text-16 text-ink-2">Answer within a day to keep your reply time short.</p>
        </header>
      )}
      {body}
      {/* Above the phone's bottom tabs while the list scrolls; in the flow below a short list. */}
      <div
        role="status"
        aria-live="polite"
        className="sticky bottom-24 z-20 flex flex-col gap-2 md:bottom-6 md:max-w-sm"
      >
        {toasts.map((entry) => (
          <TimedToast
            key={entry.id}
            entry={entry}
            onClose={closeToast}
            onUndo={(e) => void undo(e)}
          />
        ))}
      </div>
    </div>
  );
}
