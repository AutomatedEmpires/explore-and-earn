'use client';

// The reply step of flow D (Figma 01 Host, section D: Reply 45:14113 at 390, 45:14214 at 768,
// 45:14362 at 1440; Reply sent 45:14510 and 45:14617). The note is ready, so answering is one
// tap: Send reply. A reply that didn't send keeps its words and is retried with the same
// clientId, so the server stores it once.
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ReadOnlyReason } from '@/lib/messaging';
import { MESSAGES, READ_ONLY } from '@/lib/messaging';
import {
  Button,
  ErrorState,
  Notice,
  Skeleton,
  Textarea,
  Toast,
} from '@/ui/components';
import { Cloud } from '@/ui/icons';
import { hiringApi, isOffline, isStatus } from '../../applicants/_lib/api';
import {
  defaultReply,
  newClientId,
  readOnlyText,
  SEND_PROBLEM_COPY,
  sendProblem,
  type SendProblem,
} from '../_lib/reply';

type Loaded = {
  firstName: string;
  name: string;
  note: string;
  readOnly: ReadOnlyReason | null;
  canSend: boolean;
};
type ScreenState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: Loaded }
  | { kind: 'error'; problem: 'offline' | 'missing' | 'failed' };

async function load(threadId: string): Promise<ScreenState> {
  try {
    const view = await hiringApi.thread(threadId);
    const firstName = view.thread.seekerFirstName;
    let name = firstName;
    let startDate: string | null = null;
    // The applicant's full name and the listing start, for the title and the ready note. The
    // thread alone is enough to reply, so a failed lookup keeps the first name and a plain note.
    if (view.thread.applicationId) {
      try {
        const detail = await hiringApi.detail(view.thread.applicationId);
        name = `${detail.card.card.firstName} ${detail.card.card.lastName}`.trim() || firstName;
        startDate = detail.snapshot.listing.startDate;
      } catch {
        // Keep the first name.
      }
    }
    return {
      kind: 'ready',
      data: {
        firstName,
        name,
        note: defaultReply(startDate, new Date()),
        readOnly: view.readOnly,
        canSend: view.canSend,
      },
    };
  } catch (err) {
    if (isOffline(err)) return { kind: 'error', problem: 'offline' };
    if (isStatus(err, 404) || isStatus(err, 400)) return { kind: 'error', problem: 'missing' };
    return { kind: 'error', problem: 'failed' };
  }
}

function Loading() {
  return (
    <div role="status" aria-label="Loading the conversation" className="flex flex-col gap-4">
      <Skeleton shape="text" className="h-8 w-2/3" />
      <Skeleton shape="text" className="w-3/4" />
      <Skeleton className="h-36 rounded-lg" />
      <Skeleton className="h-12 rounded-full md:w-32" />
    </div>
  );
}

type SendState =
  | { kind: 'idle'; invalid: boolean }
  | { kind: 'sending' }
  | { kind: 'failed'; problem: Exclude<SendProblem, 'read_only'> }
  | { kind: 'sent' };

function ReplyForm({
  threadId,
  data,
  applicantsHref,
  onReadOnly,
}: {
  threadId: string;
  data: Loaded;
  applicantsHref: string;
  onReadOnly: () => void;
}) {
  const [text, setText] = useState(data.note);
  const [send, setSend] = useState<SendState>({ kind: 'idle', invalid: false });
  const [toastOpen, setToastOpen] = useState(true);
  // One id per reply: a retry of the same words carries the same one, so a send whose answer was
  // lost is stored once. Changed words are a new reply with a new id.
  const clientId = useRef<{ id: string; body: string } | null>(null);
  const sentHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (send.kind === 'sent') sentHeading.current?.focus();
  }, [send.kind]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (send.kind === 'sending') return;
    const body = text.trim();
    if (body === '' || [...body].length > MESSAGES.bodyMax) {
      setSend({ kind: 'idle', invalid: true });
      return;
    }
    const id = clientId.current?.body === body ? clientId.current.id : newClientId();
    clientId.current = { id, body };
    setSend({ kind: 'sending' });
    try {
      await hiringApi.sendReply(threadId, { clientId: id, body });
      setSend({ kind: 'sent' });
    } catch (err) {
      const problem = sendProblem(err);
      if (problem === 'read_only') {
        onReadOnly();
        return;
      }
      setSend({ kind: 'failed', problem });
    }
  };

  if (send.kind === 'sent') {
    return (
      <>
        {toastOpen ? (
          <div role="status">
            <Toast
              tone="success"
              title={`Reply sent to ${data.name}.`}
              onDismiss={() => setToastOpen(false)}
            />
          </div>
        ) : null}
        <h1 ref={sentHeading} tabIndex={-1} className="text-24 font-extrabold text-ink">
          {data.firstName} has your reply
        </h1>
        <p className="text-16 text-ink-2">
          {data.firstName} can answer in the app. You can write another note from{' '}
          {data.firstName}’s card.
        </p>
        <Button asChild size="lg" className="self-start">
          <Link href={applicantsHref}>Back to applicants</Link>
        </Button>
      </>
    );
  }

  const failure = send.kind === 'failed' ? SEND_PROBLEM_COPY[send.problem] : null;
  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="text-24 font-extrabold text-ink">Reply to {data.name}</h1>
        <p className="text-16 text-ink-2">This note is ready. Send it, or change the words first.</p>
      </header>
      <form noValidate onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
        {failure ? (
          <Notice tone="danger" announce="assertive" title={failure.title}>
            {failure.body}
          </Notice>
        ) : null}
        <Textarea
          label="Your reply"
          required
          rows={3}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (send.kind === 'idle' && send.invalid) setSend({ kind: 'idle', invalid: false });
          }}
          hint={`${data.firstName} sees this in the app.`}
          error={
            send.kind === 'idle' && send.invalid
              ? text.trim() === ''
                ? 'Write a reply first.'
                : `Keep it to ${MESSAGES.bodyMax.toLocaleString('en-US')} characters.`
              : undefined
          }
        />
        <Button
          type="submit"
          size="lg"
          loading={send.kind === 'sending'}
          className="w-full md:w-auto md:self-start"
        >
          Send reply
        </Button>
      </form>
    </>
  );
}

export function ReplyScreen({
  threadId,
  orgName,
  applicantsHref,
}: {
  threadId: string;
  orgName: string;
  applicantsHref: string;
}) {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    void load(threadId).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [threadId]);

  const retry = () => {
    setState({ kind: 'loading' });
    void load(threadId).then(setState);
  };

  const markReadOnly = useCallback(() => {
    setState((s) =>
      s.kind === 'ready'
        ? { kind: 'ready', data: { ...s.data, canSend: false, readOnly: s.data.readOnly } }
        : s,
    );
  }, []);

  const back = (
    <Button asChild variant="secondary">
      <Link href={applicantsHref}>Back to applicants</Link>
    </Button>
  );

  let body: ReactNode;
  if (state.kind === 'loading') {
    body = <Loading />;
  } else if (state.kind === 'error') {
    body =
      state.problem === 'offline' ? (
        <ErrorState
          icon={Cloud}
          titleAs="h1"
          title="You are offline"
          description="Your reply will open when you are back."
          action={<Button onClick={retry}>Try again</Button>}
          announce="none"
        />
      ) : state.problem === 'missing' ? (
        <ErrorState
          titleAs="h1"
          title="This conversation isn’t available"
          description="The applicant may have withdrawn, or the link is out of date."
          action={back}
          announce="none"
        />
      ) : (
        <ErrorState
          titleAs="h1"
          title="We couldn’t open this conversation"
          description="Check your connection, then try again."
          action={<Button onClick={retry}>Try again</Button>}
          announce="none"
        />
      );
  } else if (!state.data.canSend) {
    body = (
      <>
        <h1 className="text-24 font-extrabold text-ink">Reply to {state.data.name}</h1>
        <Notice title={READ_ONLY} action={back} announce="polite">
          {readOnlyText(state.data.readOnly, state.data.firstName)}
        </Notice>
      </>
    );
  } else {
    body = (
      <ReplyForm
        threadId={threadId}
        data={state.data}
        applicantsHref={applicantsHref}
        onReadOnly={markReadOnly}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-16 font-semibold text-ink-2 md:hidden">{orgName}</p>
      {body}
    </div>
  );
}
