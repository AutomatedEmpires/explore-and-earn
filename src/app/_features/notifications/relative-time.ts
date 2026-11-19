// "Just now", "5 minutes ago", "yesterday", then a short date (SP4 spec 7, the notification
// row's relative time). Pure, so the list renders the same for a given `now`.
const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });
const sameYear = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const otherYear = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const seconds = Math.round((at - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'Just now';
  if (abs < HOUR) return relative.format(Math.round(seconds / MINUTE), 'minute');
  if (abs < DAY) return relative.format(Math.round(seconds / HOUR), 'hour');
  if (abs < 7 * DAY) return relative.format(Math.round(seconds / DAY), 'day');
  const date = new Date(at);
  return (date.getFullYear() === new Date(now).getFullYear() ? sameYear : otherYear).format(date);
}
