// The /report page body, shared with the development preview: a single centered column under
// the signed-out top bar's wordmark, then the form for the subject or ErrorState when the
// subject can't be read (SP4 plan Task 33).
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button, ErrorState, Wordmark } from '@/ui/components';
import {
  REPORT_BAD_SUBJECT,
  REPORT_BAD_SUBJECT_HINT,
  REPORT_TITLES,
} from '../../_features/safety/copy';
import { ReportForm } from '../../_features/safety/ReportForm';
import type { ReportSubject } from '../_lib/subject';

export function ReportFrame({ home, children }: { home: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="mx-auto flex h-14 w-full max-w-xl items-center px-4">
        <Wordmark href={home} />
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pb-12">
        {children}
      </main>
    </div>
  );
}

export function ReportScreen({ subject, home }: { subject: ReportSubject | null; home: string }) {
  return (
    <ReportFrame home={home}>
      {subject ? (
        <>
          <h1 className="text-24 font-extrabold text-ink">{REPORT_TITLES[subject.type]}</h1>
          <ReportForm subject={subject} />
        </>
      ) : (
        <ErrorState
          titleAs="h1"
          announce="none"
          title={REPORT_BAD_SUBJECT}
          description={REPORT_BAD_SUBJECT_HINT}
          action={
            <Button asChild variant="secondary">
              <Link href={home}>Back to Explore&amp;Earn</Link>
            </Button>
          }
        />
      )}
    </ReportFrame>
  );
}
