'use client';

// Listings (Figma 37:2629 Empty, 171:23118 Loading): the org's active listings and drafts, or the
// empty state that starts flow C. Loading is a skeleton; a failed load says so and retries.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, ErrorState, Skeleton } from '@/ui/components';
import {
  CircleCheck,
  Clock,
  Cloud,
  Pencil,
  Plus,
  SquarePlus,
  type IconComponent,
} from '@/ui/icons';
import { ApiError, api, type ListingRowJson } from '../_lib/api';

type Loaded = {
  active: ListingRowJson[];
  drafts: ListingRowJson[];
  slots: { used: number; limit: number };
};

const STATUS: Record<
  string,
  { label: string; tone: 'neutral' | 'warning' | 'success'; icon: IconComponent }
> = {
  draft: { label: 'Draft', tone: 'neutral', icon: Pencil },
  in_review: { label: 'In review', tone: 'warning', icon: Clock },
  active: { label: 'Live', tone: 'success', icon: CircleCheck },
};

function RowSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <Skeleton shape="text" className="h-6 w-1/2" />
      <Skeleton shape="text" className="h-6 w-2/3" />
      <Skeleton shape="text" className="w-3/4" />
      <Skeleton shape="text" className="w-1/2" />
      <Skeleton className="mt-2 h-11 w-1/2 rounded-full" />
    </div>
  );
}

function Row({ row, base }: { row: ListingRowJson; base: string }) {
  const status = STATUS[row.state] ?? { label: 'Closed', tone: 'neutral' as const, icon: Clock };
  const href = row.state === 'in_review' ? `${base}/${row.id}/in-review` : `${base}/${row.id}`;
  const action =
    row.state === 'in_review' ? 'See where it stands' : row.state === 'draft' ? 'Continue' : 'Edit';
  const name = row.title ?? 'Untitled draft';
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-16 font-bold text-ink">{name}</h3>
        <Badge tone={status.tone} icon={status.icon}>
          {status.label}
        </Badge>
      </div>
      {row.state === 'in_review' ? (
        <p className="text-16 text-ink-2">
          We are checking it. You will get an email when it is live.
        </p>
      ) : row.state === 'draft' ? (
        <p className="text-16 text-ink-2">Not published yet. Your answers are saved.</p>
      ) : row.hasUnpublishedChanges ? (
        <p className="text-16 text-ink-2">You have changes that are not published.</p>
      ) : row.stats ? (
        <p className="text-16 text-ink-2">
          {row.stats.views} views · {row.stats.saves} saves · {row.stats.applications} applications
        </p>
      ) : null}
      <Button asChild variant="secondary" className="self-start">
        <Link href={href} aria-label={`${action}: ${name}`}>
          {action}
        </Link>
      </Button>
    </li>
  );
}

type ScreenState = { kind: 'ready'; data: Loaded } | { kind: 'error'; offline: boolean };

async function fetchListings(): Promise<ScreenState> {
  try {
    const [active, drafts] = await Promise.all([
      api.listListings('active'),
      api.listListings('drafts'),
    ]);
    return {
      kind: 'ready',
      data: { active: active.items, drafts: drafts.items, slots: active.slots },
    };
  } catch (err) {
    return { kind: 'error', offline: err instanceof ApiError && err.offline };
  }
}

export function ListingsScreen({ base }: { base: string }) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ready'; data: Loaded } | { kind: 'error'; offline: boolean }
  >({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    void fetchListings().then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, []);

  const load = () => {
    setState({ kind: 'loading' });
    void fetchListings().then(setState);
  };

  const empty =
    state.kind === 'ready' && state.data.active.length === 0 && state.data.drafts.length === 0;
  const newListing = (
    <Button asChild size="lg" icon={empty ? undefined : Plus}>
      <Link href={`${base}/new`}>New listing</Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-24 font-extrabold text-ink md:text-28">Listings</h1>
          {state.kind === 'ready' && !empty ? newListing : null}
        </div>
        <p className="text-16 text-ink-2">
          Post a job when you are ready. Guests see the pay, dates, housing, and meals before they
          apply.
        </p>
      </header>

      {state.kind === 'loading' ? (
        <div role="status" aria-label="Loading your listings" className="flex flex-col gap-4">
          <RowSkeleton />
          <RowSkeleton />
        </div>
      ) : state.kind === 'error' ? (
        state.offline ? (
          <ErrorState
            icon={Cloud}
            title="You are offline"
            description="Your listings show here when you are back online."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : (
          <ErrorState
            title="We couldn’t load your listings"
            description="Nothing is lost. Try again in a moment."
            action={<Button onClick={load}>Try again</Button>}
          />
        )
      ) : empty ? (
        <EmptyState
          icon={SquarePlus}
          title="No listings yet"
          description="Your first listing takes a few minutes. A draft saves itself while you work."
          action={newListing}
        />
      ) : (
        <>
          {state.data.active.length > 0 ? (
            <section aria-labelledby="listings-active" className="flex flex-col gap-3">
              <h2 id="listings-active" className="text-16 font-bold text-ink">
                Active
              </h2>
              <ul className="flex flex-col gap-3">
                {state.data.active.map((row) => (
                  <Row key={row.id} row={row} base={base} />
                ))}
              </ul>
            </section>
          ) : null}
          {state.data.drafts.length > 0 ? (
            <section aria-labelledby="listings-drafts" className="flex flex-col gap-3">
              <h2 id="listings-drafts" className="text-16 font-bold text-ink">
                Drafts
              </h2>
              <ul className="flex flex-col gap-3">
                {state.data.drafts.map((row) => (
                  <Row key={row.id} row={row} base={base} />
                ))}
              </ul>
            </section>
          ) : null}
          <p className="text-14 text-muted">
            {state.data.slots.used} of {state.data.slots.limit} listing slots in use.
          </p>
        </>
      )}
    </div>
  );
}
