'use client';

// ReportForm: the reason Radio list, details Textarea and the thanks line, shared by ReportSheet
// and /report (SP4 spec 7 and 8.7; plan Task 33). Built from the approved Filters sheet pattern
// (Figma 02 Seeker 175:14419: RadioGroup, a field, one primary button) under the lead's
// designops rule 7 answer on #145.
//
// Privacy: the form says that reports are private. The reporter's identity and reason never
// reach the reported party; POST /reports only opens a review item.
import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  REPORT_REASON_LABELS,
  REPORT_THANKS,
  SAFETY_LIMITS,
  SAFETY_REPORT_REASONS,
  type ReportSubjectType,
  type SafetyReportReason,
} from '@/lib/safety';
import { Button, Notice, Radio, RadioGroup, Textarea } from '@/ui/components';
import { apiFetch, ApiError } from '../api';
import {
  detailsCounter,
  REPORT_DETAILS_LABEL,
  REPORT_FAILED,
  REPORT_NOT_FOUND,
  REPORT_PRIVACY,
  REPORT_RATE_LIMITED,
  REPORT_REASON_LEGEND,
  REPORT_SIGN_IN,
  REPORT_SUBMIT,
} from './copy';

export type ReportFormProps = {
  subject: { type: ReportSubjectType; id: string };
  /** After the report is sent and the thanks line shows. */
  onSubmitted?(reportId: string): void;
};

type Failure = { message: string; signIn?: boolean };

type Status =
  | { name: 'editing'; failure: Failure | null }
  | { name: 'sending' }
  | { name: 'sent'; reportId: string };

function failureOf(err: unknown): Failure {
  if (!(err instanceof ApiError)) return { message: REPORT_FAILED };
  if (err.status === 429) return { message: REPORT_RATE_LIMITED };
  if (err.status === 401) return { message: REPORT_SIGN_IN, signIn: true };
  if (err.status === 404) return { message: REPORT_NOT_FOUND };
  // 403 `not_allowed` (a host reporting a listing) carries its own plain message.
  if (err.status === 403 && err.reason === 'not_allowed') return { message: err.message };
  return { message: REPORT_FAILED };
}

/** The sign-in page, back to the full-page form for the same subject. */
function signInHref(subject: ReportFormProps['subject']): string {
  const back = `/report?subject=${subject.type}:${subject.id}`;
  return `/sign-in?redirect_url=${encodeURIComponent(back)}`;
}

/** The form's state and actions, shared by the page form and the sheet. */
export function useReport(
  subject: ReportFormProps['subject'],
  onSubmitted?: (reportId: string) => void,
) {
  const [reason, setReason] = useState<SafetyReportReason | null>(null);
  const [details, setDetailsRaw] = useState('');
  const [status, setStatus] = useState<Status>({ name: 'editing', failure: null });

  const setDetails = (value: string) => setDetailsRaw(value.slice(0, SAFETY_LIMITS.detailsMax));

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!reason || status.name !== 'editing') return;
    setStatus({ name: 'sending' });
    const trimmed = details.trim();
    try {
      const { reportId } = await apiFetch<{ reportId: string }>('/api/v1/reports', {
        method: 'POST',
        json: {
          subjectType: subject.type,
          subjectId: subject.id,
          reason,
          ...(trimmed === '' ? {} : { details: trimmed }),
        },
      });
      setStatus({ name: 'sent', reportId });
      onSubmitted?.(reportId);
    } catch (err) {
      setStatus({ name: 'editing', failure: failureOf(err) });
    }
  }

  function reset() {
    setReason(null);
    setDetailsRaw('');
    setStatus({ name: 'editing', failure: null });
  }

  return { subject, reason, setReason, details, setDetails, status, submit, reset };
}

export type ReportController = ReturnType<typeof useReport>;

/** The privacy line, any failure, the reasons and the details, inside the form element. */
export function ReportFields({
  report,
  formId,
  children,
}: {
  report: ReportController;
  formId: string;
  /** The inline Submit, on the full page. The sheet pins it in its footer instead. */
  children?: ReactNode;
}) {
  const name = useId();
  const failure = report.status.name === 'editing' ? report.status.failure : null;
  const max = SAFETY_LIMITS.detailsMax;
  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => void report.submit(event)}
      className="flex flex-col gap-4"
    >
      <p className="text-16 text-ink-2">{REPORT_PRIVACY}</p>
      {failure ? (
        <Notice
          tone="danger"
          title={failure.message}
          announce="assertive"
          action={
            failure.signIn ? (
              <Button asChild variant="secondary">
                <Link href={signInHref(report.subject)}>Sign in</Link>
              </Button>
            ) : null
          }
        />
      ) : null}
      <RadioGroup legend={REPORT_REASON_LEGEND}>
        {SAFETY_REPORT_REASONS.map((value) => (
          <Radio
            key={value}
            name={name}
            value={value}
            label={REPORT_REASON_LABELS[value]}
            checked={report.reason === value}
            onChange={() => report.setReason(value)}
          />
        ))}
      </RadioGroup>
      <Textarea
        label={REPORT_DETAILS_LABEL}
        value={report.details}
        maxLength={max}
        hint={detailsCounter(report.details.length, max)}
        onChange={(event) => report.setDetails(event.target.value)}
      />
      {children}
    </form>
  );
}

/** Send report. Disabled until a reason is chosen; `form` ties it to the fields when pinned. */
export function ReportSubmit({ report, formId }: { report: ReportController; formId: string }) {
  return (
    <Button
      type="submit"
      form={formId}
      size="lg"
      fullWidth
      disabled={report.reason === null}
      loading={report.status.name === 'sending'}
    >
      {REPORT_SUBMIT}
    </Button>
  );
}

/** "Thanks. We review every report." Takes focus, so it isn't lost with the removed button. */
export function ReportThanks() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.focus();
  }, []);
  return (
    <div ref={box} tabIndex={-1} className="rounded-lg">
      <Notice tone="success" title={REPORT_THANKS} announce="polite" />
    </div>
  );
}

export function ReportForm({ subject, onSubmitted }: ReportFormProps): ReactNode {
  const report = useReport(subject, onSubmitted);
  const formId = useId();
  if (report.status.name === 'sent') return <ReportThanks />;
  return (
    <ReportFields report={report} formId={formId}>
      <ReportSubmit report={report} formId={formId} />
    </ReportFields>
  );
}
