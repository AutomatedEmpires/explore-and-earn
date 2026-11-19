// /report?subject=<type>:<id> (SP4 spec 7; plan Task 33): the full-page report form SP3 links to.
// Any signed-in account may report (POST /reports decides what a host may report); a guest is
// sent to sign in and back to the same report. An unreadable subject shows ErrorState.
//
// Design: the report form from the approved Filters sheet pattern (Figma 02 Seeker 175:14419)
// on a single centered column, with the signed-out top bar's wordmark (00 System, top bar A).
// Lead's designops rule 7 answer on #145.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppError } from '@/lib/errors';
import { requireUser, type CurrentUser } from '@/server/guards';
import { ReportScreen } from './_components/ReportScreen';
import { parseReportSubject } from './_lib/subject';

export const metadata: Metadata = {
  title: 'Report · Explore&Earn',
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined): string | null {
  const picked = Array.isArray(value) ? value[0] : value;
  return picked && picked.length > 0 ? picked : null;
}

/** Where the wordmark goes: the host workspace for a host, the seeker home otherwise. */
function homeHref(accountType: CurrentUser['accountType']): string {
  return accountType === 'host' ? '/host' : '/';
}

/** The signed-in user; a guest goes to sign in and comes back here (as `signInUrl` does). */
async function viewer(returnTo: string): Promise<CurrentUser> {
  try {
    return await requireUser();
  } catch (err) {
    if (err instanceof AppError && err.code === 'unauthorized') {
      redirect(`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`);
    }
    throw err;
  }
}

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<ReactNode> {
  const raw = one((await searchParams).subject);
  const subject = parseReportSubject(raw);
  const returnTo = subject
    ? `/report?subject=${subject.type}:${subject.id}`
    : raw
      ? `/report?subject=${encodeURIComponent(raw)}`
      : '/report';
  const user = await viewer(returnTo);
  return <ReportScreen subject={subject} home={homeHref(user.accountType)} />;
}
