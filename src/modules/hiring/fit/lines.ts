// The fit explanation lines (SP5 plan Task 12). Each line is fixed text from the listing's
// own facts and the seeker's dates. A line never contains an amount, the seeker's other
// preferred states, their own state, a visa type or a visa end date (spec 8.2 and 10).
import { stateByCode } from '@/lib/discovery';
import { formatInZone } from '@/lib/hiring';
import type { Category } from '@/lib/taxonomy';

const CATEGORY_LABELS: Record<Category, string> = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
};

/** `Jun 10` for a calendar date, the same in every zone. */
function shortDate(day: string): string {
  return formatInZone(`${day}T12:00:00.000Z`, 'UTC', 'date');
}

function stateName(code: string): string {
  return stateByCode(code)?.name ?? code;
}

export const LINES = {
  occupation: (label: string) => `Interested in ${label}`,
  category: (category: Category) => `Interested in ${CATEGORY_LABELS[category]} jobs`,
  noOccupation: "Hasn't listed this occupation",

  fullDates: 'Available for your full dates',
  byStart: 'Available by your start date',
  late: (day: string, daysLate: number) =>
    `Available from ${shortDate(day)}, ${daysLate} ${daysLate === 1 ? 'day' : 'days'} after your start`,
  afterEnd: (day: string) => `Available from ${shortDate(day)}, after your end date`,

  skills: (k: number, n: number) => `${k} of ${n} listed skills`,
  certifications: (k: number, n: number) => `Lists ${k} of ${n} required certifications`,

  authorized: 'Authorized to work in the US (self-reported)',
  sponsorshipOffered: 'Needs visa sponsorship, which you offer',
  sponsorshipNotOffered: "Needs visa sponsorship you don't offer",

  payMeets: 'Pay meets their expectations',
  payJustBelow: 'Pay is just below their stated minimum',
  payBelow: 'Pay is below their stated minimum',

  relocate: 'Willing to relocate',
  prefers: (state: string) => `Prefers jobs in ${stateName(state)}`,
  notRelocating: (state: string) => `Hasn't said they'd relocate to ${stateName(state)}`,
  livesIn: 'Lives in a state you hire from',
  livesOutside: 'Lives outside the states you hire from',
};
