// The listing page's view of a ListingDetail (issue #109; Figma page 02 Seeker, "Detail · guest"
// 45:7496, 176:13308, 45:7566 and 45:7615). Every fact line uses the frames' grammar ("Cabin,
// $12 a night, taken from pay") and only what the host entered. Pure: the page builds the view
// on the server and hands plain strings to its client parts.
//
// No pay estimate is drawn. The legal review's section 9 line ("About $X a week after housing and
// meals") must store its inputs and formula version with each revision, so it is computed and
// added to ListingDetail by #127; until then the page shows the host's gross pay line only.
import { formatDollars, seasonLabel, type ListingDetail } from '@/lib/discovery';
import { PERKS } from '@/lib/taxonomy';
import type { ListingContent } from '@/modules/listings';

type Pay = ListingContent['pay'];
type When = ListingContent['when'];
type Housing = ListingContent['housing'];
type Meals = ListingContent['meals'];
type Cost = Extract<Housing, { provided: true }>['cost'];
type Job = ListingContent['job'];

/** Host-written alt text by media id (null or missing: use the photo's slot name). */
export type PhotoAlts = ReadonlyMap<string, string | null>;

export type PhotoRef = { src: string; srcSet: string; alt: string };

export type ListingView = {
  listingId: string;
  title: string;
  category: ListingDetail['category'];
  cover: PhotoRef | null;
  /** The photos on this page: the cover, and the housing and meal strips. */
  photoCount: number;
  host: {
    name: string;
    href: string;
    logoSrc: string | null;
    location: string;
    /** "Active Explore&Earn host since May 2026", or null for a host without a plan. */
    since: string | null;
  };
  deal: {
    pay: string;
    dates: string;
    housing: string;
    meals: string;
    couples: string | null;
    freshness: string;
  };
  pay: { headline: string; notes: string; otherDeductions: string };
  housing: { photos: PhotoRef[]; line: string; finePrint: string | null } | null;
  meals: { photos: PhotoRef[]; line: string; note: string | null } | null;
  datesAndHours: string;
  about: { description: string; responsibilities: string[] };
  typicalDay: string | null;
  qualifications: string | null;
  perks: string | null;
  /** The category's own facts (vessel type, home port, ...); staff perks join Perks. */
  details: { label: string; value: string }[];
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dateParts(d: string): { y: number; m: string; day: number } {
  const [y = 0, m = 1, day = 1] = d.split('-').map(Number);
  return { y, m: MONTHS[m - 1] ?? '', day };
}

/** "May 15, 2027". */
function longDate(d: string): string {
  const p = dateParts(d);
  return `${p.m} ${p.day}, ${p.y}`;
}

/** "$19" or "$18–$20". */
function amounts(min: number, max: number): string {
  return max > min ? `${formatDollars(min)}–${formatDollars(max)}` : formatDollars(min);
}

const PER: Record<Exclude<Pay['unit'], 'crew_share'>, string> = {
  hour: 'an hour',
  day: 'a day',
  week: 'a week',
  month: 'a month',
  season: 'a season',
  year: 'a year',
};

/** The host's gross pay in words: "$22 an hour", "$18–$20 an hour", "Crew share, about ...". */
export function payLine(pay: Pay): string {
  if (pay.unit === 'crew_share') {
    const e = pay.crewShareEstimate;
    return e ? `Crew share, about ${amounts(e.minCents, e.maxCents)} ${PER[e.per]}` : 'Crew share';
  }
  const max = pay.kind === 'fixed' ? pay.minCents : pay.maxCents;
  return `${amounts(pay.minCents, max)} ${PER[pay.unit]}`;
}

/** "May 15 to Oct 2, 2027", "Dec 1, 2027 to Mar 31, 2028", "Summer 2027" or "Ongoing". */
export function dateRange(when: When): string {
  const d = when.dates;
  switch (d.mode) {
    case 'fixed': {
      const a = dateParts(d.start);
      const b = dateParts(d.end);
      return a.y === b.y
        ? `${a.m} ${a.day} to ${b.m} ${b.day}, ${b.y}`
        : `${longDate(d.start)} to ${longDate(d.end)}`;
    }
    case 'season':
      return seasonLabel(d.season, d.year);
    case 'ongoing':
      return d.start ? `From ${longDate(d.start)}, ongoing` : 'Ongoing';
  }
}

const HOUSING_TYPE: Record<Extract<Housing, { provided: true }>['type'], string> = {
  dorm: 'Dorm',
  shared_room: 'Shared room',
  private_room: 'Private room',
  cabin: 'Cabin',
  rv_site: 'RV site',
  berth: 'Berth on the boat',
};

/** "free", "$12 a night, taken from pay" or "$120 a week, paid separately". */
function costPhrase(cost: Cost, perDay: 'a night' | 'a day'): string {
  if (cost.free) return 'free';
  const per = cost.period === 'day' ? perDay : `a ${cost.period}`;
  const paid = cost.paidBy === 'deducted' ? 'taken from pay' : 'paid separately';
  return `${formatDollars(cost.cents)} ${per}, ${paid}`;
}

/** The deal line: "Cabin, $12 a night, taken from pay", "Shared room, free" or "No housing". */
export function dealHousing(housing: Housing): string {
  if (!housing.provided) return 'No housing';
  return `${HOUSING_TYPE[housing.type]}, ${costPhrase(housing.cost, 'a night')}`;
}

/** The Housing section line, adding the week for a nightly cost: "($84 a week)". */
export function housingSummary(housing: Housing): string {
  if (!housing.provided) return 'No housing';
  const cost = housing.cost;
  if (cost.free || cost.period !== 'day') return dealHousing(housing);
  const paid = cost.paidBy === 'deducted' ? 'taken from pay' : 'paid separately';
  return `${HOUSING_TYPE[housing.type]}, ${formatDollars(cost.cents)} a night (${formatDollars(
    cost.cents * 7,
  )} a week), ${paid}`;
}

/** "3 meals a day, free", "2 meals on work days, $50 a week, taken from pay" or "No meals". */
export function mealsLine(meals: Meals): string {
  if (!meals.provided) return 'No meals';
  const count = meals.perDay === 1 ? '1 meal' : `${meals.perDay} meals`;
  const when = meals.days === 'every_day' ? 'a day' : 'on work days';
  return `${count} ${when}, ${costPhrase(meals.cost, 'a day')}`;
}

/** A sentence that ends in a full stop. */
function sentence(s: string): string {
  const t = s.trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/** Lower-cases the first letter for items joined into a sentence, leaving "TWIC" alone. */
function lowerFirst(s: string): string {
  const second = s.charAt(1);
  return second && second !== second.toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function list(items: readonly string[]): string {
  return items.map(lowerFirst).join('; ');
}

const FREQUENCY: Record<Pay['frequency'], string> = {
  weekly: 'Paid weekly.',
  biweekly: 'Paid every two weeks.',
  semimonthly: 'Paid twice a month.',
  monthly: 'Paid monthly.',
  end_of_season: 'Paid at the end of the season.',
  per_trip: 'Paid per trip.',
};

function payNotes(pay: Pay): string {
  const parts = [FREQUENCY[pay.frequency]];
  if (pay.overtime) parts.push('Overtime available.');
  if (pay.tips) parts.push('Tips on top of pay.');
  if (pay.bonuses) parts.push(sentence(`Bonus: ${pay.bonuses}`));
  return parts.join(' ');
}

function roommates(n: number | null): string | null {
  if (n === null) return null;
  if (n === 0) return 'no roommates';
  return n === 1 ? '1 roommate' : `${n} roommates`;
}

function housingFinePrint(housing: Extract<Housing, { provided: true }>): string | null {
  const f = housing.finePrint;
  const facts = [
    roommates(f.roommates),
    f.pets ? 'pets allowed' : 'no pets',
    f.wifi ? 'Wi-Fi included' : 'no Wi-Fi',
    f.utilitiesIncluded ? 'utilities included' : 'utilities not included',
  ].filter((x): x is string => x !== null);
  const text = [
    sentence(housing.note),
    sentence(capitalize(facts.join(', '))),
    f.notes ? sentence(f.notes) : '',
  ]
    .filter(Boolean)
    .join(' ');
  return text || null;
}

function mealsNote(meals: Extract<Meals, { provided: true }>): string | null {
  const text = [sentence(meals.note), meals.dietary ? sentence(`Dietary: ${meals.dietary}`) : '']
    .filter(Boolean)
    .join(' ');
  return text || null;
}

function qualifications(job: Job): string | null {
  const parts = [
    job.requiredQualifications.length > 0
      ? sentence(`Required: ${list(job.requiredQualifications)}`)
      : '',
    job.preferredQualifications.length > 0
      ? sentence(`Preferred: ${list(job.preferredQualifications)}`)
      : '',
    job.skills.length > 0 ? sentence(`Skills: ${list(job.skills)}`) : '',
    job.certifications.length > 0
      ? sentence(`Certifications: ${list(job.certifications)}`)
      : 'No certifications needed.',
    job.physicalDemands ? sentence(job.physicalDemands) : '',
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : null;
}

const PERK_LABEL = new Map(PERKS.map((p) => [p.code, p.label]));

function perks(content: ListingContent): string | null {
  const labels = content.job.perks.map((code) => PERK_LABEL.get(code) ?? code);
  const staff = content.genreDetails.category === 'seasonal' ? content.genreDetails.staffPerks : [];
  const all = [...labels, ...staff];
  return all.length > 0 ? all.join(' · ') : null;
}

const HOUSING_SLOTS = [
  ['bedroom', 'Bedroom'],
  ['bathroom', 'Bathroom'],
  ['kitchen', 'Kitchen'],
  ['exterior', 'Outside'],
] as const;

const MEAL_SLOTS = [
  ['kitchen', 'Kitchen'],
  ['meal_example', 'A meal'],
  ['dining_area', 'Dining area'],
  ['other', 'More of the meals'],
] as const;

function photoRef(
  urls: Record<320 | 640 | 1280, string> | undefined,
  alt: string,
): PhotoRef | null {
  if (!urls) return null;
  return {
    src: urls[640],
    srcSet: `${urls[320]} 320w, ${urls[640]} 640w, ${urls[1280]} 1280w`,
    alt,
  };
}

function strip(
  photos: Record<string, string>,
  slots: readonly (readonly [string, string])[],
  detail: ListingDetail,
  alts: PhotoAlts,
): PhotoRef[] {
  return slots.flatMap(([slot, label]) => {
    const id = photos[slot];
    if (!id) return [];
    const ref = photoRef(detail.photoUrls[id], alts.get(id) || label);
    return ref ? [ref] : [];
  });
}

/** "Active Explore&Earn host since May 2026". Never "verified" (legal review 7, change 9). */
function hostSince(date: string | null): string | null {
  if (!date) return null;
  const p = dateParts(date);
  return `Active Explore&Earn host since ${p.m} ${p.y}`;
}

const SCHEDULE: Record<ListingContent['basics']['schedule'], string> = {
  full_time: 'full time',
  part_time: 'part time',
};

export function buildListingView(detail: ListingDetail, alts: PhotoAlts): ListingView {
  const c = detail.content;
  const cover = detail.cover ? photoRef(detail.cover.src, detail.cover.alt) : null;
  const housing = c.housing.provided
    ? {
        photos: strip(c.housing.photos, HOUSING_SLOTS, detail, alts),
        line: housingSummary(c.housing),
        finePrint: housingFinePrint(c.housing),
      }
    : null;
  const meals = c.meals.provided
    ? {
        photos: strip(c.meals.photos, MEAL_SLOTS, detail, alts),
        line: mealsLine(c.meals),
        note: mealsNote(c.meals),
      }
    : null;
  const dates = dateRange(c.when);
  return {
    listingId: detail.listingId,
    title: detail.title,
    category: detail.category,
    cover,
    photoCount:
      (cover ? 1 : 0) + (housing?.photos.length ?? 0) + (meals?.photos.length ?? 0),
    host: {
      name: detail.host.name,
      href: `/hosts/${detail.host.slug}`,
      logoSrc: detail.host.logoUrl,
      location: detail.locationLabel,
      since: hostSince(detail.host.subscriberSince),
    },
    deal: {
      pay: payLine(c.pay),
      dates,
      housing: dealHousing(c.housing),
      meals: mealsLine(c.meals),
      couples: c.housing.provided
        ? c.housing.finePrint.couples
          ? 'Couples housed'
          : 'No couples'
        : null,
      freshness: detail.activityLine,
    },
    pay: {
      headline: payLine(c.pay),
      notes: payNotes(c.pay),
      otherDeductions: c.pay.deductions
        ? sentence(`Other deductions from pay: ${c.pay.deductions}`)
        : 'Other deductions from pay: none.',
    },
    housing,
    meals,
    datesAndHours: [
      sentence(dates),
      sentence(`${c.when.weeklyHours} hours a week, ${SCHEDULE[c.basics.schedule]}`),
      c.when.minCommitment ? sentence(c.when.minCommitment) : '',
    ]
      .filter(Boolean)
      .join(' '),
    about: { description: c.job.description, responsibilities: c.job.responsibilities },
    typicalDay: c.job.typicalDay,
    qualifications: qualifications(c.job),
    perks: perks(c),
    details: detail.categoryFields.filter((f) => f.label !== 'Staff perks'),
  };
}
