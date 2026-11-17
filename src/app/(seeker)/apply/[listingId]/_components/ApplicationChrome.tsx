// The lines every application screen shows (approved page 02 frames): the status, the host's
// usual reply time, and the trust line. The apply steps also say the draft is on the phone.
// Reply time is the frame's sentence. The apply context does not carry a measured reply time yet.
import { Badge, type BadgeProps } from '@/ui/components';
import { Send, ShieldCheck } from '@/ui/icons';

export function replyLine(orgName: string): string {
  return `${orgName} usually replies within a day.`;
}

export const TRUST_LINE = 'You never pay to get a job.';
export const SAVED_LINE = 'Saved on this phone.';

function tone(status: string): NonNullable<BadgeProps['tone']> {
  if (status === 'Sent' || status === 'Hired' || status === 'Offer') return 'success';
  if (status === 'Interviewing') return 'warning';
  if (status === 'Not selected' || status === 'Withdrawn' || status === 'Offer declined') {
    return 'danger';
  }
  return 'neutral';
}

export function ApplicationChrome({
  orgName,
  status,
  saved = false,
}: {
  orgName: string;
  status: string;
  saved?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Badge tone={tone(status)} icon={status === 'Sent' ? Send : undefined}>
        {status}
      </Badge>
      <p className="text-15 text-ink">{replyLine(orgName)}</p>
      <p className="flex items-start gap-2.5 text-16 text-ink">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        {TRUST_LINE}
      </p>
      {saved ? <p className="text-14 font-semibold text-muted">{SAVED_LINE}</p> : null}
    </div>
  );
}
