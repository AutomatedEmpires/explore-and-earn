// A local clock time in `tz`, as UTC. A spring-forward gap moves forward by the gap.
// An ambiguous fall-back time takes the earlier offset.
export function zonedLocalToUtc(local: string, tz: string): string {
  const [date, time] = local.split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = offsetMinutes(new Date(asUtc), tz);
  const utc1 = asUtc - off1 * 60_000;
  const off2 = offsetMinutes(new Date(utc1), tz);
  if (off2 === off1) return new Date(utc1).toISOString();
  const utc2 = asUtc - off2 * 60_000;
  const off3 = offsetMinutes(new Date(utc2), tz);
  if (off3 === off2) return new Date(Math.min(utc1, utc2)).toISOString();
  return new Date(utc1).toISOString();
}

function offsetMinutes(utc: Date, tz: string): number {
  const name =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(utc)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT(?:([+-])(\d{2}):(\d{2}))?/.exec(name);
  if (!match?.[1]) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

/** The calendar day `now` falls on in `tz`, as YYYY-MM-DD. */
export function todayInZone(tz: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `[from, to)` covering the local calendar day of `now` in `tz`. */
export function localDayRange(tz: string, now: Date): { from: Date; to: Date } {
  const day = todayInZone(tz, now);
  const [y, m, d] = day.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return {
    from: new Date(zonedLocalToUtc(`${day}T00:00`, tz)),
    to: new Date(zonedLocalToUtc(`${next}T00:00`, tz)),
  };
}

/** `Jun 12`, `10:00 AM`, or `Jun 12, 10:00 AM MDT`. */
export function formatInZone(iso: string, tz: string, style: 'date' | 'time' | 'datetime'): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    month: 'short',
    day: 'numeric',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  if (style === 'date') return day;
  if (style === 'time') return time;
  const zone =
    new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(date)
      .find((part) => part.type === 'timeZoneName')?.value ?? '';
  return `${day}, ${time} ${zone}`;
}
