'use client';

// The end of flow C (Figma 43:13314, 43:13530): the listing is in review, not live. The words
// follow the review stage the server reports.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, ErrorState, Skeleton } from '@/ui/components';
import { CircleCheck } from '@/ui/icons';
import { ApiError, api, type EditorJson } from '../_lib/api';

function body(editor: EditorJson, orgName: string): { title: string; text: string } {
  const name = editor.listing.title ?? 'Your listing';
  if (editor.listing.state === 'active' && !editor.pending) {
    return { title: `${name} is live`, text: 'Guests can see it and apply.' };
  }
  switch (editor.listing.reviewStage) {
    case 'verification':
      return {
        title: `${name} is in review`,
        text: `We are checking ${orgName} because this is your first listing. You will get an email when the job is live.`,
      };
    case 'team_approval':
      return {
        title: `${name} is in review`,
        text: 'An Owner or Admin approves it first, then we check it. You will get an email when the job is live.',
      };
    default:
      return {
        title: `${name} is in review`,
        text: 'We check every new listing before guests see it. You will get an email when the job is live.',
      };
  }
}

type Loaded = { kind: 'ready'; editor: EditorJson } | { kind: 'error'; offline: boolean };

async function fetchEditor(listingId: string): Promise<Loaded> {
  try {
    return { kind: 'ready', editor: await api.getEditor(listingId) };
  } catch (err) {
    return { kind: 'error', offline: err instanceof ApiError && err.offline };
  }
}

export function InReviewScreen({
  base,
  listingId,
  orgName,
}: {
  base: string;
  listingId: string;
  orgName: string;
}) {
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; editor: EditorJson }
    | { kind: 'error'; offline: boolean }
  >({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    void fetchEditor(listingId).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [listingId]);

  const load = () => {
    setState({ kind: 'loading' });
    void fetchEditor(listingId).then(setState);
  };

  if (state.kind === 'loading') {
    return (
      <div role="status" aria-label="Loading" className="flex flex-col gap-4">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton shape="text" className="h-8 w-2/3" />
        <Skeleton shape="text" className="w-full" />
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <ErrorState
        title={state.offline ? 'You are offline' : 'We couldn’t load this listing'}
        description="Your listing is saved. Try again in a moment."
        action={<Button onClick={load}>Try again</Button>}
      />
    );
  }

  const { title, text } = body(state.editor, orgName);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-16 text-ink-2 md:hidden">{orgName}</p>
      <CircleCheck className="size-6 text-ink" />
      <h1 className="text-24 font-extrabold text-ink">{title}</h1>
      <p className="text-16 text-ink-2">{text}</p>
      <div className="flex flex-col gap-3 md:items-start">
        <Button asChild size="lg" className="max-md:w-full">
          <Link href={base}>Back to listings</Link>
        </Button>
        <Button asChild variant="secondary" size="lg" className="max-md:w-full">
          <Link href={`${base}/${listingId}`}>Edit listing</Link>
        </Button>
      </div>
    </div>
  );
}
