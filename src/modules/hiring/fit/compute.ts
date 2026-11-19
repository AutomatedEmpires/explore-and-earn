// The fit score (SP5 spec 8.3, E3). Pure: it reads SP4's FitInputs and the listing only, and
// never writes. A factor whose data is missing on either side is left out and the remaining
// weights are rescaled. The weights are the listing's primary category's.
//
// Work authorization is read as the two answers a host may see (founder line of 2026-11-12,
// spec 8.2; issue 116 Terms draft section 11): a held visa counts as authorized, and a seeker
// who needs sponsorship fits when the listing offers sponsorship. The visa type and end date
// stay with the seeker and never change a score or a line.
import type { FitFactor, FitLine, FitListing, FitResult, FitWeights } from '@/lib/hiring';
import type { FitInputs } from '@/modules/profiles';
import { LINES } from './lines';

type Part = { value: number; text: string };

const FACTORS: readonly FitFactor[] = [
  'occupation',
  'availability',
  'skills',
  'certifications',
  'work_authorization',
  'pay',
  'location',
];

const DAY_MS = 86_400_000;
const ONGOING_FADE_DAYS = 90;

/** Whole days from `a` to `b` (both YYYY-MM-DD); negative when `b` is earlier. */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function occupation(i: FitInputs, l: FitListing): Part | null {
  if (i.occupationCodes.length === 0 && i.categories.length === 0) return null;
  if (i.occupationCodes.includes(l.occupation)) {
    return { value: 1, text: LINES.occupation(l.occupationLabel) };
  }
  const category = i.categories.includes(l.category)
    ? l.category
    : l.secondCategory !== null && i.categories.includes(l.secondCategory)
      ? l.secondCategory
      : null;
  if (category) return { value: 0.6, text: LINES.category(category) };
  return { value: 0, text: LINES.noOccupation };
}

function availability(i: FitInputs, l: FitListing): Part | null {
  const day = i.availabilityDate;
  if (day === null) return null;
  const late = daysBetween(l.startDate, day);
  if (l.endDate !== null) {
    if (late <= 0) return { value: 1, text: LINES.fullDates };
    if (day > l.endDate) return { value: 0, text: LINES.afterEnd(day) };
    const total = daysBetween(l.startDate, l.endDate);
    const value = total > 0 ? daysBetween(day, l.endDate) / total : 0;
    return { value, text: LINES.late(day, late) };
  }
  if (late <= 0) return { value: 1, text: LINES.byStart };
  return { value: Math.max(0, 1 - late / ONGOING_FADE_DAYS), text: LINES.late(day, late) };
}

function skills(i: FitInputs, l: FitListing): Part | null {
  const n = l.skillKeys.length;
  if (n === 0) return null;
  const mine = new Set(i.skillKeys);
  const k = l.skillKeys.filter((key) => mine.has(key)).length;
  return { value: k / n, text: LINES.skills(k, n) };
}

function certifications(i: FitInputs, l: FitListing): Part | null {
  const n = l.requiredCertificationKeys.length;
  if (n === 0) return null;
  const current = new Set(
    i.certifications
      .filter((c) => c.expiresOn === null || c.expiresOn >= l.startDate)
      .map((c) => c.key),
  );
  const k = l.requiredCertificationKeys.filter((key) => current.has(key)).length;
  return { value: k / n, text: LINES.certifications(k, n) };
}

function workAuthorization(i: FitInputs, l: FitListing): Part | null {
  const wa = i.workAuthorization;
  if (wa === null) return null;
  if (wa.status !== 'needs_sponsorship') return { value: 1, text: LINES.authorized };
  return l.sponsorship !== 'none'
    ? { value: 1, text: LINES.sponsorshipOffered }
    : { value: 0, text: LINES.sponsorshipNotOffered };
}

/** The seeker's minimum in cents per hour, or null when it can't be converted. */
function minimumPerHour(i: FitInputs, l: FitListing): number | null {
  const pay = i.minPay;
  if (pay === null) return null;
  if (pay.unit === 'hour') return pay.cents;
  if (pay.unit === 'day') return pay.cents / 8;
  return l.weeklyHours > 0 ? pay.cents / 52 / l.weeklyHours : null;
}

function pay(i: FitInputs, l: FitListing): Part | null {
  const max = l.maxPayHourlyCents;
  const minimum = minimumPerHour(i, l);
  if (max === null || minimum === null) return null;
  if (max >= minimum) return { value: 1, text: LINES.payMeets };
  if (max >= 0.9 * minimum) return { value: 0.5, text: LINES.payJustBelow };
  return { value: 0, text: LINES.payBelow };
}

function location(i: FitInputs, l: FitListing): Part | null {
  const remote = l.remoteStates !== null || l.category === 'remote';
  if (remote) {
    const states = l.remoteStates;
    if (states === null) return null;
    const region = i.countryCode === 'US' ? i.region : null;
    const inside = region !== null && (states === 'all_us' || states.includes(region));
    return inside ? { value: 1, text: LINES.livesIn } : { value: 0, text: LINES.livesOutside };
  }
  // On-site: the seeker's own state is never read.
  if (i.willingToRelocate) return { value: 1, text: LINES.relocate };
  if (l.state === null) return null;
  if (i.preferredStates.includes(l.state)) return { value: 1, text: LINES.prefers(l.state) };
  return { value: 0.3, text: LINES.notRelocating(l.state) };
}

const PARTS: Record<FitFactor, (i: FitInputs, l: FitListing) => Part | null> = {
  occupation,
  availability,
  skills,
  certifications,
  work_authorization: workAuthorization,
  pay,
  location,
};

export function computeFit(i: FitInputs, l: FitListing, w: FitWeights, version: string): FitResult {
  const weights = w[l.category];
  const lines: FitLine[] = [];
  for (const factor of FACTORS) {
    const part = PARTS[factor](i, l);
    if (part) lines.push({ factor, weight: weights[factor], value: part.value, text: part.text });
  }
  const total = lines.reduce((sum, line) => sum + line.weight, 0);
  if (total === 0) return { score: 0, weightsVersion: version, lines: [] };
  const earned = lines.reduce((sum, line) => sum + line.weight * line.value, 0);
  const score = Math.min(100, Math.max(0, Math.round((100 * earned) / total)));
  return { score, weightsVersion: version, lines };
}
