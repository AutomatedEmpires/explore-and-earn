// The viewer's time zone (SP3 spec 8.3): "today" is computed in it. It comes from the `tz`
// param or the `ee_tz` cookie, either of which can be garbage (some browsers report
// `Etc/Unknown`), so anything unrecognized falls back to the default instead of failing.

export const DEFAULT_TZ = 'America/Chicago';

/** `tz` when it is a known IANA zone (in its canonical spelling), else America/Chicago. */
export function resolveTimeZone(tz: string | null | undefined): string {
  if (typeof tz !== 'string' || tz === '' || tz.length > 64 || tz === 'Etc/Unknown') {
    return DEFAULT_TZ;
  }
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return DEFAULT_TZ;
  }
}
