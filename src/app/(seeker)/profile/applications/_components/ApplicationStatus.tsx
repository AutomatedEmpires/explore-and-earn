'use client';

// The application status frame: status, usual reply time, the trust line, the receipt, and
// withdraw. ApplicationSnapshotView fills in the frozen profile when that screen lands (#145);
// until then it renders nothing and this page still shows the job.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApplicationSnapshotView } from '@/app/_features/applications/ApplicationSnapshotView';
import {
  ADDITIONAL_STEP_DONE,
  WITHDRAW_REASON_LABELS,
  type ReceiptDto,
  type WithdrawReason,
} from '@/lib/applications';
import { Button, Checkbox, Dialog, ErrorState, OrgLogo, Select } from '@/ui/components';
import { WifiOff } from '@/ui/icons';
import { ApplicationChrome } from '../../../apply/[listingId]/_components/ApplicationChrome';
import { formatDay, screenStatus } from '../../../apply/[listingId]/_lib/flow';

const REASONS = Object.keys(WITHDRAW_REASON_LABELS) as WithdrawReason[];

export function ApplicationStatus({
  receipt: given,
  applicationId,
}: {
  receipt?: ReceiptDto;
  applicationId?: string;
}) {
  const [receipt, setReceipt] = useState<ReceiptDto | null>(given ?? null);
  const [problem, setProblem] = useState<'offline' | 'error' | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [reason, setReason] = useState<WithdrawReason>('not_interested');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (given || !applicationId) return;
    let cancel = false;
    const run = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancel) setProblem('offline');
        return;
      }
      try {
        const response = await fetch(`/api/v1/me/applications/${encodeURIComponent(applicationId)}`);
        if (cancel) return;
        if (!response.ok) {
          setProblem('error');
          return;
        }
        setReceipt((await response.json()) as ReceiptDto);
        setProblem(null);
      } catch {
        if (!cancel) setProblem(navigator.onLine === false ? 'offline' : 'error');
      }
    };
    void run();
    return () => {
      cancel = true;
    };
  }, [applicationId, attempt, given]);

  async function tick(completed: boolean) {
    if (!receipt) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/me/applications/${encodeURIComponent(receipt.applicationId)}/additional-step`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: receipt.applicationId, completed }),
        },
      );
      if (!response.ok) {
        setProblem('error');
        return;
      }
      setReceipt((await response.json()) as ReceiptDto);
    } catch {
      setProblem(navigator.onLine === false ? 'offline' : 'error');
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!receipt) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/v1/me/applications/${encodeURIComponent(receipt.applicationId)}/withdraw`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: receipt.applicationId, reason }),
        },
      );
      if (!response.ok) {
        setProblem('error');
        return;
      }
      setReceipt((await response.json()) as ReceiptDto);
      setWithdrawOpen(false);
    } catch {
      setProblem(navigator.onLine === false ? 'offline' : 'error');
    } finally {
      setBusy(false);
    }
  }

  if (problem === 'offline') {
    return (
      <ErrorState
        icon={WifiOff}
        title="You're offline"
        description="Your application is still saved. Try again when you're back online."
        action={<Button onClick={() => { setProblem(null); setAttempt((n) => n + 1); }}>Try again</Button>}
      />
    );
  }
  if (problem === 'error' && !receipt) {
    return (
      <ErrorState
        title="We couldn't load this application"
        action={<Button onClick={() => { setProblem(null); setAttempt((n) => n + 1); }}>Try again</Button>}
      />
    );
  }
  if (!receipt) {
    return (
      <p role="status" className="text-16 text-muted">
        Loading your application.
      </p>
    );
  }

  const listing = receipt.snapshot.listing;
  const status = screenStatus(receipt.seekerStatus);
  const step = listing.additionalStep;

  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex items-center gap-3">
        <OrgLogo name={listing.orgName} size="lg" />
        <div className="min-w-0">
          <p className="text-14 font-semibold text-muted">{listing.orgName}</p>
          <h1 className="text-24 font-extrabold text-ink">{listing.title}</h1>
        </div>
      </header>
      <ApplicationChrome orgName={listing.orgName} status={status} />
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-15">
        <dt className="text-muted">Status</dt>
        <dd className="font-semibold text-ink">{status}</dd>
        <dt className="text-muted">Sent</dt>
        <dd className="font-semibold text-ink">{formatDay(receipt.submittedAt)}</dd>
        <dt className="text-muted">Where</dt>
        <dd className="font-semibold text-ink">{listing.locationLabel}</dd>
        <dt className="text-muted">Dates</dt>
        <dd className="font-semibold text-ink">
          {formatDay(listing.startDate)} to {formatDay(listing.endDate)}
        </dd>
      </dl>
      <ol className="flex flex-col gap-2">
        {receipt.events.map((event) => (
          <li key={`${event.type}-${event.at}`} className="text-15 text-ink">
            <span className="font-semibold">{screenStatus(event.seekerStatus)}</span>
            <span className="text-muted"> · {formatDay(event.at)}</span>
          </li>
        ))}
      </ol>
      <ApplicationSnapshotView
        snapshot={receipt.snapshot}
        audience="seeker"
        resumeHref={`/api/v1/me/applications/${receipt.applicationId}/resume.pdf`}
      />
      {step ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-17 font-bold text-ink">One more step from the host</h2>
          <p className="text-15 text-ink-2">{step.note}</p>
          <Link href={step.url} className="text-15 font-semibold text-ink underline">
            Open the employer&apos;s form
          </Link>
          {receipt.canTickAdditionalStep ? (
            <Checkbox
              label={ADDITIONAL_STEP_DONE}
              checked={receipt.additionalStepCompletedAt !== null}
              disabled={busy}
              onChange={(event) => void tick(event.target.checked)}
            />
          ) : null}
        </section>
      ) : null}
      {receipt.canWithdraw ? (
        <Button variant="secondary" onClick={() => setWithdrawOpen(true)}>
          Withdraw
        </Button>
      ) : null}
      {problem === 'error' ? (
        <p role="alert" className="text-15 font-semibold text-danger">
          That didn&apos;t save. Try again.
        </p>
      ) : null}
      <Dialog
        open={withdrawOpen}
        onOpenChange={setWithdrawOpen}
        title="Withdraw this application?"
        footer={
        <Button loading={busy} onClick={() => void withdraw()}>
          Withdraw application
        </Button>
        }
      >
        <Select
          label="Reason"
          value={reason}
          onValueChange={setReason}
          options={REASONS.map((value) => ({ value, label: WITHDRAW_REASON_LABELS[value] }))}
        />
      </Dialog>
    </article>
  );
}
