// The listing builder's model (spec section 8.2; Figma 01 Host, section C): the 10 steps, the
// section each one saves, the defaults a saved section carries so the finished draft matches
// ListingContentSchema, and the inline validation that keeps what the host typed.
//
// The draft is plain JSON (see ./paths). Inputs that need parsing (amounts, counts, lists) keep
// the host's own text in `raw`, keyed by the field's path, so an invalid entry stays on screen
// with its error instead of being thrown away.
import type { BuilderSection } from '@/modules/listings';
import {
  commaItems,
  lines,
  parseHours,
  parseMoney,
  parsePayAmount,
  parseWholeNumber,
} from './format';
import { arr, bool, getPath, num, obj, str, strings, type Json } from './paths';

export type StepKey = BuilderSection | 'review';
export type Raw = Record<string, string>;
export type Errors = Record<string, string>;
export type BuilderContext = { viewerUserId: string };

export const STEP_KEYS: readonly StepKey[] = [
  'basics',
  'where_when',
  'pay',
  'housing',
  'meals',
  'genre_details',
  'job',
  'photos',
  'applying',
  'review',
];

/** The content keys each builder section saves (mirrors SECTION_CONTENT_KEYS on the server). */
export const SECTION_CONTENT: Record<BuilderSection, readonly string[]> = {
  basics: ['basics'],
  where_when: ['where', 'when'],
  pay: ['pay'],
  housing: ['housing'],
  meals: ['meals'],
  genre_details: ['genreDetails'],
  job: ['job'],
  photos: ['photos'],
  applying: ['applying'],
};

const SECTION_OF_KEY = new Map<string, BuilderSection>(
  (Object.entries(SECTION_CONTENT) as [BuilderSection, readonly string[]][]).flatMap(
    ([section, keys]) => keys.map((k): [string, BuilderSection] => [k, section]),
  ),
);

/** 'where.locationId' -> 'where_when'. */
export function sectionOfPath(path: string): BuilderSection {
  return SECTION_OF_KEY.get(path.split('.')[0] ?? '') ?? 'basics';
}

export const CATEGORY_LABEL = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
} as const;
export type CategoryCode = keyof typeof CATEGORY_LABEL;

export function categoryOf(draft: Json): CategoryCode | undefined {
  const c = str(getPath(draft, 'basics.primaryCategory'));
  return c && c in CATEGORY_LABEL ? (c as CategoryCode) : undefined;
}

export function stepTitle(step: StepKey, draft: Json): string {
  switch (step) {
    case 'basics':
      return 'Basics';
    case 'where_when':
      return 'Where and when';
    case 'pay':
      return 'Pay';
    case 'housing':
      return 'Housing';
    case 'meals':
      return 'Meals';
    case 'genre_details': {
      const c = categoryOf(draft);
      return c ? `${CATEGORY_LABEL[c]} details` : 'Job type details';
    }
    case 'job':
      return 'The job';
    case 'photos':
      return 'Photos';
    case 'applying':
      return 'Applying';
    case 'review':
      return 'Review';
  }
}

export const HOUSING_SLOTS = ['bedroom', 'bathroom', 'kitchen', 'exterior'] as const;
export const MEAL_SLOTS = ['kitchen', 'meal_example', 'dining_area', 'other'] as const;
export const SLOT_LABEL: Record<string, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  exterior: 'Exterior',
  meal_example: 'Meal example',
  dining_area: 'Dining area',
  other: 'Other',
};
export const GALLERY_MAX = 8;
export const QUESTIONS_MAX = 10;
export const DESCRIPTION_MIN = 50;

const or = <T>(v: T | undefined, fallback: T): T => (v === undefined ? fallback : v);
const nullable = (v: unknown) => (v === undefined || v === '' ? null : v);

/** One content key with the defaults that make a finished section complete. */
function normalizeKey(key: string, draft: Json, ctx: BuilderContext): unknown {
  const v = obj(draft[key]);
  switch (key) {
    case 'basics':
      return { ...v, secondaryCategory: or(v.secondaryCategory, null) };
    case 'where':
      // `mode` is the union's discriminator: the server's draft schema refuses a where without it.
      if (v.mode === 'remote' || (v.mode === undefined && categoryOf(draft) === 'remote')) {
        return { ...v, mode: 'remote', scope: or(v.scope, 'all_us'), states: arr(v.states) };
      }
      return { ...v, mode: 'onsite' };
    case 'when':
      return { ...v, minCommitment: nullable(v.minCommitment) };
    case 'pay':
      return {
        ...v,
        crewShareEstimate: v.unit === 'crew_share' ? v.crewShareEstimate : null,
        overtime: or(bool(v.overtime), false),
        tips: or(bool(v.tips), false),
        bonuses: nullable(v.bonuses),
        deductions: nullable(v.deductions),
      };
    case 'housing': {
      if (v.provided !== true) return { provided: false };
      const fp = obj(v.finePrint);
      return {
        ...v,
        note: or(str(v.note), ''),
        finePrint: {
          roommates: or(num(fp.roommates) as number | null | undefined, null),
          pets: or(bool(fp.pets), false),
          couples: or(bool(fp.couples), false),
          wifi: or(bool(fp.wifi), false),
          utilitiesIncluded: or(bool(fp.utilitiesIncluded), false),
          notes: nullable(fp.notes),
        },
      };
    }
    case 'meals':
      if (v.provided !== true) return { provided: false };
      return { ...v, note: or(str(v.note), ''), dietary: nullable(v.dietary) };
    case 'genreDetails': {
      const category = categoryOf(draft) ?? str(v.category);
      switch (category) {
        case 'seasonal':
          return {
            category,
            destinationSlug: nullable(v.destinationSlug),
            staffPerks: strings(v.staffPerks),
          };
        case 'maritime':
          return {
            ...v,
            category,
            rotation: nullable(v.rotation),
            timeAtSea: nullable(v.timeAtSea),
            documents: strings(v.documents),
          };
        case 'farm':
          return {
            ...v,
            category,
            harvestWindow: nullable(v.harvestWindow),
            equipment: strings(v.equipment),
            certifications: strings(v.certifications),
          };
        case 'remote':
          return {
            ...v,
            category,
            equipmentProvided: nullable(v.equipmentProvided),
            internet: nullable(v.internet),
          };
        default:
          return v;
      }
    }
    case 'job':
      return {
        ...v,
        responsibilities: strings(v.responsibilities),
        typicalDay: nullable(v.typicalDay),
        requiredQualifications: strings(v.requiredQualifications),
        preferredQualifications: strings(v.preferredQualifications),
        skills: strings(v.skills),
        certifications: strings(v.certifications),
        physicalDemands: nullable(v.physicalDemands),
        minAge: or(num(v.minAge), 18),
        perks: strings(v.perks),
        visaSponsorship: or(str(v.visaSponsorship), 'none'),
      };
    case 'photos':
      return { ...v, galleryMediaIds: strings(v.galleryMediaIds) };
    case 'applying':
      return {
        questions: arr(v.questions),
        additionalStep: v.additionalStep ? v.additionalStep : null,
        deadline: nullable(v.deadline),
        notifyMemberIds: Array.isArray(v.notifyMemberIds)
          ? strings(v.notifyMemberIds)
          : [ctx.viewerUserId],
      };
    default:
      return v;
  }
}

/** The body `data` of PATCH .../draft for one section. */
export function sectionPayload(section: BuilderSection, draft: Json, ctx: BuilderContext): Json {
  const data: Json = {};
  for (const key of SECTION_CONTENT[section]) data[key] = normalizeKey(key, draft, ctx);
  return data;
}

/** The whole draft with every section's defaults, for the guest card and the Review step. */
export function normalizedDraft(draft: Json, ctx: BuilderContext): Json {
  const out: Json = { ...draft };
  for (const keys of Object.values(SECTION_CONTENT)) {
    for (const key of keys) if (draft[key] !== undefined) out[key] = normalizeKey(key, draft, ctx);
  }
  return out;
}

// --- Validation ------------------------------------------------------------------------------

export const MESSAGES = {
  title: 'Add a job title of 5 to 80 characters.',
  category: 'Choose a category.',
  genre: 'Choose a genre.',
  occupation: 'Choose an occupation.',
  openings: 'Enter how many people you are hiring, from 1 to 999.',
  employmentType: 'Choose Employee or Contractor.',
  schedule: 'Choose Full time or Part time.',
  location: 'Choose a location.',
  datesMode: 'Choose fixed dates, a season or ongoing.',
  start: 'Add the first day.',
  end: 'Add the last day.',
  endBeforeStart: 'The last day must be on or after the first day.',
  season: 'Choose a season.',
  year: 'Enter a year, like 2027.',
  weeklyHours: 'Enter hours a week, from 1 to 120.',
  states: 'Choose at least one state.',
  payAmount: 'Add a number, like 18, or a range like 18 to 22.',
  payMissing: 'Add the pay, like 18, or a range like 18 to 22.',
  payOrder: 'The top of the range must be at least the bottom.',
  payZero: 'Pay must be more than $0.',
  payUnit: 'Choose what the pay is for.',
  crewAmount: 'Add an estimate for the share, like 8000 to 12000.',
  crewPer: 'Choose what the estimate covers.',
  frequency: 'Choose how often you pay.',
  bonus: 'Say what the bonus is, in up to 200 characters.',
  housingType: 'Choose the type of housing.',
  costFree: 'Choose Free or An amount.',
  costAmount: 'Add the cost, like 110.',
  costPeriod: 'Choose a period.',
  paidBy: 'Choose how it is paid.',
  note: 'Keep the note to 80 characters.',
  roommates: 'Enter a number from 0 to 99, or leave it empty.',
  perDay: 'Enter 1, 2 or 3.',
  mealDays: 'Choose which days.',
  photo: (slot: string) => `Add a ${SLOT_LABEL[slot]?.toLowerCase() ?? 'photo'} photo.`,
  required: 'This is required.',
  description: `Write at least ${DESCRIPTION_MIN} characters. Guests read this first.`,
  skills: 'Add at least one skill.',
  visa: 'Choose a visa option.',
  travel: 'Choose how much travel the job needs.',
  cover: 'Add a cover photo.',
  question: 'Write the question.',
  choices: 'Give 2 to 10 answers, one per line.',
  link: 'Use a secure link that starts with https://.',
} as const;

type Check = (draft: Json, raw: Raw) => Errors;

const rawOr = (raw: Raw, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined;

function checkBasics(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  const title = (str(getPath(d, 'basics.title')) ?? '').trim();
  if (title.length < 5 || title.length > 80) e['basics.title'] = MESSAGES.title;
  if (!categoryOf(d)) e['basics.primaryCategory'] = MESSAGES.category;
  if (!str(getPath(d, 'basics.genre'))) e['basics.genre'] = MESSAGES.genre;
  if (!str(getPath(d, 'basics.occupationCode'))) e['basics.occupationCode'] = MESSAGES.occupation;
  const openingsText = rawOr(raw, 'basics.openings');
  const openings =
    openingsText !== undefined
      ? parseWholeNumber(openingsText)
      : num(getPath(d, 'basics.openings'));
  if (typeof openings !== 'number' || openings < 1 || openings > 999) {
    e['basics.openings'] = MESSAGES.openings;
  }
  if (!str(getPath(d, 'basics.employmentType')))
    e['basics.employmentType'] = MESSAGES.employmentType;
  if (!str(getPath(d, 'basics.schedule'))) e['basics.schedule'] = MESSAGES.schedule;
  return e;
}

function checkWhereWhen(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  const where = obj(d.where);
  if (where.mode === 'remote') {
    if (!str(where.hostLocationId)) e['where.hostLocationId'] = MESSAGES.location;
    if (where.scope === 'states' && strings(where.states).length === 0)
      e['where.states'] = MESSAGES.states;
  } else if (!str(where.locationId)) {
    e['where.locationId'] = MESSAGES.location;
  }
  const dates = obj(getPath(d, 'when.dates'));
  if (dates.mode === 'fixed') {
    const start = str(dates.start);
    const end = str(dates.end);
    if (!start) e['when.dates.start'] = MESSAGES.start;
    if (!end) e['when.dates.end'] = MESSAGES.end;
    if (start && end && end < start) e['when.dates.end'] = MESSAGES.endBeforeStart;
  } else if (dates.mode === 'season') {
    if (!str(dates.season)) e['when.dates.season'] = MESSAGES.season;
    const yearText = rawOr(raw, 'when.dates.year');
    const year = yearText !== undefined ? parseWholeNumber(yearText) : num(dates.year);
    if (typeof year !== 'number' || year < 2000 || year > 2100)
      e['when.dates.year'] = MESSAGES.year;
  } else if (dates.mode !== 'ongoing') {
    e['when.dates.mode'] = MESSAGES.datesMode;
  }
  const hoursText = rawOr(raw, 'when.weeklyHours');
  const hours =
    hoursText !== undefined ? parseHours(hoursText) : num(getPath(d, 'when.weeklyHours'));
  if (typeof hours !== 'number' || hours < 1 || hours > 120)
    e['when.weeklyHours'] = MESSAGES.weeklyHours;
  return e;
}

function checkPay(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  const pay = obj(d.pay);
  const amountText = rawOr(raw, 'pay.amount');
  if (amountText !== undefined) {
    const parsed = parsePayAmount(amountText);
    if (parsed === undefined) e['pay.amount'] = MESSAGES.payMissing;
    else if (parsed === null) e['pay.amount'] = MESSAGES.payAmount;
    else if (parsed.minCents === 0) e['pay.amount'] = MESSAGES.payZero;
    else if (parsed.maxCents < parsed.minCents) e['pay.amount'] = MESSAGES.payOrder;
  } else if (!num(pay.minCents)) {
    e['pay.amount'] = MESSAGES.payMissing;
  }
  if (!str(pay.unit)) e['pay.unit'] = MESSAGES.payUnit;
  if (pay.unit === 'crew_share') {
    const crew = obj(pay.crewShareEstimate);
    const crewText = rawOr(raw, 'pay.crewAmount');
    let crewOk = (num(crew.minCents) ?? 0) > 0;
    if (crewText !== undefined) {
      const parsed = parsePayAmount(crewText);
      crewOk = !!parsed && parsed.minCents > 0 && parsed.maxCents >= parsed.minCents;
    }
    if (!crewOk) e['pay.crewAmount'] = MESSAGES.crewAmount;
    if (!str(crew.per)) e['pay.crewPer'] = MESSAGES.crewPer;
  }
  if (!str(pay.frequency)) e['pay.frequency'] = MESSAGES.frequency;
  const bonuses = str(pay.bonuses);
  if (bonuses !== undefined && bonuses.trim().length > 200) e['pay.bonuses'] = MESSAGES.bonus;
  return e;
}

function checkCost(prefix: string, d: Json, raw: Raw, e: Errors): void {
  const cost = obj(getPath(d, `${prefix}.cost`));
  if (cost.free === true) return;
  if (cost.free !== false) {
    e[`${prefix}.cost.free`] = MESSAGES.costFree;
    return;
  }
  const text = rawOr(raw, `${prefix}.cost.amount`);
  const cents = text !== undefined ? parseMoney(text) : num(cost.cents);
  if (typeof cents !== 'number' || cents <= 0) e[`${prefix}.cost.amount`] = MESSAGES.costAmount;
  if (!str(cost.period)) e[`${prefix}.cost.period`] = MESSAGES.costPeriod;
  if (!str(cost.paidBy)) e[`${prefix}.cost.paidBy`] = MESSAGES.paidBy;
}

function checkPhotos(prefix: string, slots: readonly string[], d: Json, e: Errors): void {
  for (const slot of slots) {
    if (!str(getPath(d, `${prefix}.photos.${slot}`)))
      e[`${prefix}.photos.${slot}`] = MESSAGES.photo(slot);
  }
}

function checkHousing(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  const h = obj(d.housing);
  if (h.provided !== true) return e;
  if (!str(h.type)) e['housing.type'] = MESSAGES.housingType;
  checkCost('housing', d, raw, e);
  if ((str(h.note) ?? '').trim().length > 80) e['housing.note'] = MESSAGES.note;
  const roommatesText = rawOr(raw, 'housing.finePrint.roommates');
  if (roommatesText !== undefined && roommatesText.trim() !== '') {
    const n = parseWholeNumber(roommatesText);
    if (typeof n !== 'number' || n > 99) e['housing.finePrint.roommates'] = MESSAGES.roommates;
  }
  checkPhotos('housing', HOUSING_SLOTS, d, e);
  return e;
}

function checkMeals(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  const m = obj(d.meals);
  if (m.provided !== true) return e;
  const perDayText = rawOr(raw, 'meals.perDay');
  const perDay = perDayText !== undefined ? parseWholeNumber(perDayText) : num(m.perDay);
  if (perDay !== 1 && perDay !== 2 && perDay !== 3) e['meals.perDay'] = MESSAGES.perDay;
  if (!str(m.days)) e['meals.days'] = MESSAGES.mealDays;
  checkCost('meals', d, raw, e);
  if ((str(m.note) ?? '').trim().length > 80) e['meals.note'] = MESSAGES.note;
  checkPhotos('meals', MEAL_SLOTS, d, e);
  return e;
}

function checkGenreDetails(d: Json): Errors {
  const e: Errors = {};
  const g = obj(d.genreDetails);
  const need = (key: string) => {
    if (!(str(g[key]) ?? '').trim()) e[`genreDetails.${key}`] = MESSAGES.required;
  };
  switch (categoryOf(d)) {
    case 'maritime':
      need('vesselType');
      need('homePort');
      break;
    case 'farm':
      need('operationType');
      break;
    case 'remote':
      need('timeZoneOverlap');
      if (!str(g.travel)) e['genreDetails.travel'] = MESSAGES.travel;
      break;
    default:
      break;
  }
  return e;
}

function checkJob(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  const description = (str(getPath(d, 'job.description')) ?? '').trim();
  if (description.length < DESCRIPTION_MIN) e['job.description'] = MESSAGES.description;
  const skillsText = rawOr(raw, 'job.skills');
  const skills =
    skillsText !== undefined ? commaItems(skillsText) : strings(getPath(d, 'job.skills'));
  if (skills.length === 0) e['job.skills'] = MESSAGES.skills;
  const required = rawOr(raw, 'job.requiredQualifications');
  const quals =
    required !== undefined ? lines(required) : strings(getPath(d, 'job.requiredQualifications'));
  if (quals.length === 0) e['job.requiredQualifications'] = MESSAGES.required;
  return e;
}

function checkPhotosStep(d: Json): Errors {
  return str(getPath(d, 'photos.coverMediaId')) ? {} : { 'photos.coverMediaId': MESSAGES.cover };
}

function checkApplying(d: Json, raw: Raw): Errors {
  const e: Errors = {};
  arr(getPath(d, 'applying.questions')).forEach((q, i) => {
    const question = obj(q);
    if (!(str(question.prompt) ?? '').trim())
      e[`applying.questions.${i}.prompt`] = MESSAGES.question;
    if (question.type === 'multiple_choice') {
      const text = rawOr(raw, `applying.questions.${i}.choices`);
      const choices = text !== undefined ? lines(text) : strings(question.choices);
      if (choices.length < 2 || choices.length > 10)
        e[`applying.questions.${i}.choices`] = MESSAGES.choices;
    }
  });
  const url = str(getPath(d, 'applying.additionalStep.url'));
  if (url !== undefined && url.trim() !== '' && !/^https:\/\/\S+\.\S+/.test(url.trim())) {
    e['applying.additionalStep.url'] = MESSAGES.link;
  }
  return e;
}

const CHECKS: Record<BuilderSection, Check> = {
  basics: checkBasics,
  where_when: checkWhereWhen,
  pay: checkPay,
  housing: checkHousing,
  meals: checkMeals,
  genre_details: checkGenreDetails,
  job: checkJob,
  photos: checkPhotosStep,
  applying: checkApplying,
};

/** Every problem in one step, keyed by field path. Review has none of its own. */
export function validateStep(step: StepKey, draft: Json, raw: Raw): Errors {
  return step === 'review' ? {} : CHECKS[step](draft, raw);
}

/** Every problem in the draft, by step. */
export function validateAll(draft: Json, raw: Raw): Partial<Record<StepKey, Errors>> {
  const out: Partial<Record<StepKey, Errors>> = {};
  for (const step of STEP_KEYS) {
    const errors = validateStep(step, draft, raw);
    if (Object.keys(errors).length > 0) out[step] = errors;
  }
  return out;
}
