'use client';

// My applications: every status the seeker can be in, newest first. Interviews and offers live
// on their own API views, so this page reads all three and shows them together.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ApplicationView, MyApplicationRow } from '@/lib/applications';
import { Button, EmptyState, ErrorState, OrgLogo } from '@/ui/components';
import { Briefcase, WifiOff } from '@/ui/icons';
import { ApplicationChrome, replyLine } from '../../../apply/[listingId]/_components/ApplicationChrome';
import { formatDay, screenStatus } from '../../../apply/[listingId]/_lib/flow';

const VIEWS: readonly ApplicationView[] = ['applied', 'interviews', 'offers'];

async function loadAll(): Promise<MyApplicationRow[]> {
  const pages = await Promise.all(
    VIEWS.map(async (view) => {
      const response = await fetch(`/api/v1/me/applications?view=${view}`);
      if (!response.ok) throw new Error(String(response.status));
      const body = (await response.json()) as { items: MyApplicationRow[] };
      return body.items;
    }),
  );
  return pages.flat().sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
}

export function ApplicationList() {
  const [rows, setRows] = useState<MyApplicationRow[] | null>(null);
  const [problem, setProblem] = useState<'offline' | 'error' | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancel = false;
    const run = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancel) setProblem('offline');
        return;
      }
      try {
        const items = await loadAll();
        if (!cancel) {
          setRows(items);
          setProblem(null);
        }
      } catch {
        if (!cancel) setProblem(navigator.onLine === false ? 'offline' : 'error');
      }
    };
    void run();
    return () => {
      cancel = true;
    };
  }, [attempt]);

  if (problem === 'offline') {
    return (
      <ErrorState
        icon={WifiOff}
        title="You're offline"
        action={<Button onClick={() => { setProblem(null); setAttempt((n) => n + 1); }}>Try again</Button>}
      />
    );
  }
  if (problem === 'error') {
    return (
      <ErrorState
        title="We couldn't load your applications"
        action={<Button onClick={() => { setProblem(null); setAttempt((n) => n + 1); }}>Try again</Button>}
      />
    );
  }
  if (!rows) {
    return (
      <p role="status" className="text-16 text-muted">
        Loading your applications.
      </p>
    );
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-24 font-extrabold text-ink">Applications</h1>
        <ApplicationChrome
          orgName={rows[0]?.orgName ?? 'A host'}
          status={rows[0] ? screenStatus(rows[0].seekerStatus) : 'None yet'}
        />
      </header>
      {rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="You haven't applied yet."
          action={
            <Button asChild>
              <Link href="/">Find a job</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.applicationId}>
              <Link
                href={`/profile/applications/${row.applicationId}`}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4"
              >
                <OrgLogo name={row.orgName} />
                <span className="min-w-0 flex-1">
                  <span className="block text-16 font-bold text-ink">{row.title}</span>
                  <span className="block text-14 text-muted">
                    {row.orgName} · {formatDay(row.submittedAt)}
                  </span>
                  <span className="block text-14 text-ink-2">{replyLine(row.orgName)}</span>
                </span>
                <span className="text-14 font-semibold text-ink">{screenStatus(row.seekerStatus)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
