// The typed copies a revision keeps of its content (spec section 4, listing_revisions), so
// search and lists can query them without reading the JSON.
import type { Cost, ListingContent } from './content';
import type { listingRevisions } from './schema';

type RevisionRow = typeof listingRevisions.$inferInsert;

/** Every typed copy column of a revision. */
export type RevisionColumns = Required<
  Pick<
    RevisionRow,
    | 'title'
    | 'primaryCategory'
    | 'secondaryCategory'
    | 'genre'
    | 'occupationCode'
    | 'employmentType'
    | 'schedule'
    | 'openings'
    | 'locationId'
    | 'publicPoint'
    | 'stateCode'
    | 'remoteScope'
    | 'remoteStates'
    | 'dateMode'
    | 'startDate'
    | 'endDate'
    | 'season'
    | 'seasonYear'
    | 'weeklyHours'
    | 'payKind'
    | 'payMinCents'
    | 'payMaxCents'
    | 'payUnit'
    | 'crewMinCents'
    | 'crewMaxCents'
    | 'crewPer'
    | 'housingProvided'
    | 'housingFree'
    | 'housingCostCents'
    | 'housingCostPeriod'
    | 'mealsProvided'
    | 'mealsFree'
    | 'mealsCostCents'
    | 'mealsCostPeriod'
    | 'visaSponsorship'
    | 'minAge'
    | 'coverMediaId'
    | 'deadline'
    | 'timezone'
  >
>;

export type RevisionContext = {
  /** The listing's IANA timezone (its location's, or the remote host location's). */
  timezone: string;
  publicPoint: { lat: number; lng: number };
  stateCode: string;
};

function costColumns(
  provided: boolean,
  cost: Cost | undefined,
): { free: boolean | null; cents: number | null; period: string | null } {
  if (!provided || !cost) return { free: null, cents: null, period: null };
  if (cost.free) return { free: true, cents: null, period: null };
  return { free: false, cents: cost.cents, period: cost.period };
}

/** The typed copies of `content` for a revision row. */
export function toRevisionColumns(content: ListingContent, ctx: RevisionContext): RevisionColumns {
  const { basics, where, when, pay, housing, meals, job, photos, applying } = content;
  const dates = when.dates;
  const housingCost = costColumns(housing.provided, housing.provided ? housing.cost : undefined);
  const mealsCost = costColumns(meals.provided, meals.provided ? meals.cost : undefined);

  return {
    title: basics.title,
    primaryCategory: basics.primaryCategory,
    secondaryCategory: basics.secondaryCategory,
    genre: basics.genre,
    occupationCode: basics.occupationCode,
    employmentType: basics.employmentType,
    schedule: basics.schedule,
    openings: basics.openings,
    locationId: where.mode === 'remote' ? where.hostLocationId : where.locationId,
    publicPoint: { lat: ctx.publicPoint.lat, lng: ctx.publicPoint.lng },
    stateCode: ctx.stateCode,
    remoteScope: where.mode === 'remote' ? where.scope : null,
    remoteStates: where.mode === 'remote' ? [...where.states] : null,
    dateMode: dates.mode,
    startDate: dates.mode === 'season' ? null : dates.start,
    endDate: dates.mode === 'fixed' ? dates.end : null,
    season: dates.mode === 'season' ? dates.season : null,
    seasonYear: dates.mode === 'season' ? dates.year : null,
    weeklyHours: when.weeklyHours,
    payKind: pay.kind,
    payMinCents: pay.minCents,
    payMaxCents: pay.maxCents,
    payUnit: pay.unit,
    crewMinCents: pay.crewShareEstimate?.minCents ?? null,
    crewMaxCents: pay.crewShareEstimate?.maxCents ?? null,
    crewPer: pay.crewShareEstimate?.per ?? null,
    housingProvided: housing.provided,
    housingFree: housingCost.free,
    housingCostCents: housingCost.cents,
    housingCostPeriod: housingCost.period,
    mealsProvided: meals.provided,
    mealsFree: mealsCost.free,
    mealsCostCents: mealsCost.cents,
    mealsCostPeriod: mealsCost.period,
    visaSponsorship: job.visaSponsorship,
    minAge: job.minAge,
    coverMediaId: photos.coverMediaId,
    deadline: applying.deadline,
    timezone: ctx.timezone,
  };
}
