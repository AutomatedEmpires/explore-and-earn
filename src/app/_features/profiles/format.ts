// Display formatting for profile and application snapshots (SP4 plan Task 35). Client-safe and
// pure. Dates in snapshots are 'YYYY-MM' months and 'YYYY-MM-DD' days (plan, Date formats).
import type { ProfileSnapshotV1, VisaType, WorkAuthorization } from '@/lib/profiles';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2024-05' -> 'May 2024'. An unreadable value comes back unchanged. */
export function monthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const name = MONTHS[Number(month) - 1];
  return name && year ? `${name} ${year}` : ym;
}

function dayParts(iso: string): { month: string; day: number; year: string } | null {
  const [year, month, day] = iso.split('-');
  const name = MONTHS[Number(month) - 1];
  const date = Number(day);
  return name && year && date ? { month: name, day: date, year } : null;
}

/** '2027-06-01' -> 'Jun 1, 2027'. */
export function dayLabel(iso: string): string {
  const p = dayParts(iso);
  return p ? `${p.month} ${p.day}, ${p.year}` : iso;
}

/** 'May 15 to Sep 15, 2027', or with both years when they differ. */
export function dayRange(start: string | null, end: string | null): string | null {
  if (start && end) {
    const a = dayParts(start);
    const b = dayParts(end);
    if (a && b && a.year === b.year) return `${a.month} ${a.day} to ${dayLabel(end)}`;
    return `${dayLabel(start)} to ${dayLabel(end)}`;
  }
  if (start) return `Starts ${dayLabel(start)}`;
  if (end) return `Ends ${dayLabel(end)}`;
  return null;
}

/** 'May 2024 to Sep 2024', 'Nov 2024 to now'. */
export function monthRange(start: string | null, end: string | null, isCurrent = false): string {
  const from = start ? monthLabel(start) : null;
  const to = isCurrent ? 'now' : end ? monthLabel(end) : null;
  if (from && to) return `${from} to ${to}`;
  return from ?? to ?? '';
}

/** 'Juneau, AK', or the city alone. */
export function placeLabel(p: { city: string; region: string | null }): string {
  return p.region ? `${p.city}, ${p.region}` : p.city;
}

/** A US number in E.164 ('+14065550142') reads as '(406) 555-0142'; others stay as stored. */
export function phoneLabel(phone: string | null): string | null {
  if (!phone) return null;
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : phone;
}

/** Parts joined with ' · ', leaving out blanks. */
export function joinDot(parts: readonly (string | null | undefined)[]): string {
  return parts.filter((part): part is string => !!part && part.trim() !== '').join(' · ');
}

export const LANGUAGE_LEVELS: Record<ProfileSnapshotV1['languages'][number]['level'], string> = {
  basic: 'Basic',
  conversational: 'Conversational',
  fluent: 'Fluent',
  native: 'Native',
};

const VISA_LABELS: Record<VisaType, string | null> = {
  j1: 'J-1',
  h2a: 'H-2A',
  h2b: 'H-2B',
  // The neutral type a host read reduces every visa to: never named.
  other: null,
};

/**
 * The work authorization line. A host sees only the two answers (founder decision of
 * 2026-11-12, legal review 2.2): "Can work in the US now" or "Needs visa sponsorship", never a
 * visa type or end date, even from a snapshot stored before the server reduced it. The seeker
 * sees their own answer in full.
 */
export function workAuthorizationLine(wa: WorkAuthorization, audience: 'seeker' | 'host'): string {
  if (wa.status === 'authorized') return 'Can work in the US now';
  if (wa.status === 'has_visa') {
    if (audience === 'host') return 'Can work in the US now';
    const visa = VISA_LABELS[wa.visaType];
    return `Has a visa${visa ? ` (${visa})` : ''} until ${dayLabel(wa.endsOn)}`;
  }
  if (audience === 'host') return 'Needs visa sponsorship';
  const named = wa.visaTypes.map((t) => VISA_LABELS[t]).filter((v): v is string => v !== null);
  return named.length > 0
    ? `Needs visa sponsorship (${named.join(', ')})`
    : 'Needs visa sponsorship';
}

/** A portfolio address that is safe to link: http or https only. */
export function webHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}
