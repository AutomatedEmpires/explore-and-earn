// Automatic checks before publishing (spec sections 8.2 and 8.3 step 1). Blocking issues stop a
// publish; warnings need the host's acknowledgement (by `ackKey`). Issue codes are fixed (Plan
// decision 8).
//
// The wording, screening-question and visa rules follow the legal review (docs/legal/
// 2026-11-legal-review.md sections 2.2, 2.3 and 2.6; #121, widened by #200). Their host-facing
// wording is the agent's, pending counsel review (section 13).
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { FEDERAL_MIN_WAGE_CENTS } from '@/lib/min-wage';
import { isUSStateCode } from '@/lib/us-states';
import { getCapacity } from '@/modules/entitlements';
import { getLocations, type Location } from '@/modules/locations';
import { getMediaInfo, type MediaKind } from '@/modules/media';
import { getSetting, type SettingValue } from '@/modules/settings';
import type { HostContext } from '@/server/guards';
import { isUuid, loadListing, type ListingRecord } from './access';
import { BUILDER_SECTIONS, sectionOfPath } from './checklist';
import {
  HOUSING_SLOTS,
  ListingContentSchema,
  MEAL_SLOTS,
  type BuilderSection,
  type ListingContent,
} from './content';
import { checkLinkSyntax } from './links';
import { hourlyPayCents } from './min-wage';
import { getPath } from './paths';
import { listingRevisions, listings, photoSlotChecks } from './schema';
import { localDate } from './time';

export const BLOCKING_CODES = [
  'required_missing',
  'pay_vague',
  'housing_cost_missing',
  'meals_cost_missing',
  'prohibited_wording',
  'link_unsafe',
  'end_date_past',
  'deadline_past',
  'location_unavailable',
  'photo_unavailable',
  'genre_invalid',
  'question_not_allowed',
  'h2a_housing_not_free',
] as const;
export const WARNING_CODES = [
  'pay_below_min_wage',
  'photo_slot_mismatch',
  'wording_flagged',
  'h2b_job_order',
] as const;

export type IssueCode = (typeof BLOCKING_CODES)[number] | (typeof WARNING_CODES)[number];
/** One problem, on one field. `href` points at the rule, where one is cited. */
export type Issue = {
  code: IssueCode;
  section: BuilderSection;
  field: string;
  message: string;
  href?: string;
};

export type ListingChecksResult = {
  errors: Issue[];
  warnings: Issue[];
  parsed: ListingContent | null;
};

const MESSAGES = {
  required: 'This is required.',
  pay_vague: 'Give a clear amount, or a range where the top is at most 2.5 times the bottom.',
  housing_cost_missing: 'Say what housing costs, or mark it free.',
  meals_cost_missing: 'Say what meals cost, or mark them free.',
  link_unsafe: "Use a secure https link to a site we can check. Link shorteners aren't allowed.",
  end_date_past: 'The end date has passed.',
  deadline_past: 'The application deadline has passed.',
  location_unavailable: 'Choose one of your current locations.',
  photo_unavailable: 'Choose another photo.',
  genre_invalid: 'Choose a genre for this category.',
  h2a_housing_not_free:
    'H-2A workers must get housing at no cost (20 CFR 655.122(d)). Make housing free, or choose another visa sponsorship.',
  h2b_job_order:
    'H-2B listings must offer pay and terms at least as good as your job order (20 CFR 655.41). Publishing confirms they match it.',
} as const;

/** The rules the visa checks cite. */
export const RULE_LINKS = {
  h2a_housing: 'https://www.ecfr.gov/current/title-20/section-655.122#p-655.122(d)',
  h2b_advertising: 'https://www.ecfr.gov/current/title-20/section-655.41',
} as const;

type FlaggedPhrase = SettingValue<'listings.flagged_phrases'>[number];
type FlaggedGroup = SettingValue<'listings.flagged_groups'>[number];
type WordingGround = FlaggedPhrase['ground'];
type QuestionTopics = SettingValue<'listings.question_topics'>;
type QuestionTopic = keyof QuestionTopics;

/** Why a ground's phrase is flagged, after the quoted phrase. */
const GROUND_WHY: Record<WordingGround, string> = {
  age: 'can read as an age limit or preference',
  sex: 'can read as a preference for men or for women',
  race: 'can read as a preference about race or skin color',
  national_origin: 'can read as a preference about national origin, citizenship or language',
  disability: 'can read as turning away people with disabilities',
  religion: 'can read as a preference about religion',
  family_status: 'can read as a preference about marriage or children',
  criminal_history: 'can read as a blanket ban on people with a criminal record',
  appearance: 'can read as a preference about how people look',
  minors: 'can read as inviting people under 18',
};

/** Neutral wording for a nationality that names people. */
const NATIONALITY_SUGGESTION =
  'Name the skills the job needs, like "Speaks Spanish with guests", not where people are from.';

/** Neutral wording for a maximum age or an age range the checks find on their own. */
const AGE_LIMIT_SUGGESTION =
  'Remove the age limit. The only age rule a listing can set is 18 or 21 and up.';

/** Why a screening question is blocked, by topic, with what the host may ask instead. */
const QUESTION_RULES: Record<QuestionTopic, string> = {
  age: 'The only question about age you can ask is "Are you at least 18?" or "Are you at least 21?".',
  marital_status:
    "You can't ask about marriage, partners or children. Ask about what the job needs, like the schedule or shared housing.",
  pregnancy: "You can't ask about pregnancy or plans for a family.",
  disability:
    'You can\'t ask about disabilities, health or medication. You can ask "Can you do the tasks in this listing, with or without a reasonable accommodation?"',
  religion:
    "You can't ask about religion. You can ask whether someone can work the days in this listing.",
  national_origin:
    'You can\'t ask about national origin, citizenship or first language. You can ask "Are you authorized to work in the US?" and "Will you need visa sponsorship?"',
  arrest_record: "You can't ask about arrests or charges.",
  sex: "You can't ask about sex, gender or sexual orientation. If housing is split by sex, say so in the listing.",
};

export const SLOT_LABELS: Record<string, string> = {
  bedroom: 'Bedroom',
  bathroom: 'Bathroom',
  kitchen: 'Kitchen',
  exterior: 'Exterior',
  meal_example: 'Meal example',
  dining_area: 'Dining area',
  other: 'Other',
};

/** What a warning is acknowledged by: `photo_slot_mismatch:<slot>` for photos, else its code. */
export function ackKey(issue: Pick<Issue, 'code' | 'field'>): string {
  if (issue.code === 'photo_slot_mismatch') {
    return `photo_slot_mismatch:${issue.field.split('.').pop() ?? ''}`;
  }
  return issue.code;
}

/**
 * Text as phrases are matched: NFKC, lowercase, curly apostrophes made straight, periods
 * removed, dashes read as spaces ("able-bodied" is "able bodied"), every whitespace run
 * (non-breaking spaces included) collapsed to one space, trimmed. The settings registry folds
 * phrases the same way to keep its lists free of repeats.
 */
export function normalizeForPhraseMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\./g, '')
    .replace(/[-\u2010-\u2015\u2212]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const BEFORE = String.raw`(?<![\p{L}\p{N}])`;
const AFTER = String.raw`(?![\p{L}\p{N}])`;
/** What `*` matches in a phrase: one word, apostrophes inside it allowed. */
const ANY_WORD = String.raw`[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*`;
/** What `#` matches in a phrase: a whole number. */
const ANY_NUMBER = String.raw`\p{N}+`;

/** A phrase as a pattern: folded, `*` for any one word and `#` for any whole number. */
function phrasePattern(phrase: string): string {
  return normalizeForPhraseMatch(phrase)
    .split(/([*#])/)
    .map((part) => (part === '*' ? ANY_WORD : part === '#' ? ANY_NUMBER : escapeRegExp(part)))
    .join('');
}

/** A phrase's matcher, with a word boundary on both sides; null for a phrase that folds to "". */
function phraseRegExp(phrase: string): RegExp | null {
  if (normalizeForPhraseMatch(phrase) === '') return null;
  return new RegExp(`${BEFORE}${phrasePattern(phrase)}${AFTER}`, 'u');
}

/** A matcher for each phrase. */
function phraseMatchers(phrases: string[]): { phrase: string; re: RegExp }[] {
  return phrases.flatMap((phrase) => {
    const re = phraseRegExp(phrase);
    return re ? [{ phrase, re }] : [];
  });
}

/** Words for people that, after a nationality, make it describe who may apply. */
const PEOPLE = [
  'only',
  'applicants?',
  'candidates?',
  'workers?',
  'employees?',
  'staff',
  'people',
  'persons',
  'nationals',
  'preferred',
  'citizens',
  'students',
  'hires',
  'crews?',
  'men',
  'women',
  'girls',
  'guys',
  // #200.
  'males',
  'females',
  'folks',
  'wanted',
  'need apply',
  'need only apply',
  'only need apply',
].join('|');

/** After a noun for a group, the words that make it a preference or a limit: "women preferred". */
const PREFERENCE_AFTER = [
  'only',
  'preferred',
  'wanted',
  'need apply',
  'need only apply',
  'only need apply',
].join('|');

/** Before a group, the words that make it a preference or a limit: "no blacks", "prefer men". */
const LIMIT_BEFORE = [
  'no',
  'non',
  'only',
  'prefer',
  'prefers',
  'preferably',
  'preferring',
  'preference for',
  'preference to',
  'preference given to',
  'priority to',
  'priority for',
  'only hire',
  'only hiring',
].join('|');

const MUST_BE = '(?:must|should|has to|have to|needs to|need to) be';
const ARTICLE = '(?:an? |the )?';
/** The end of a phrase, in text whose periods are gone: the field's end, or other punctuation. */
const PHRASE_END = String.raw`(?=\s*(?:[,;:!?)\]"]|$))`;

/** A group word as a pattern, and its plurals: "lady" ladies, "woman" women, "Mexican" Mexicans. */
function termForms(term: string): { one: string; many: string } {
  const one = escapeRegExp(normalizeForPhraseMatch(term));
  const many = [`${one}s`, `${one}es`];
  if (one.endsWith('man')) many.push(`${one.slice(0, -3)}men`);
  if (/[^aeiou]y$/.test(one)) many.push(`${one.slice(0, -1)}ies`);
  return { one, many: `(?:${many.join('|')})` };
}

/**
 * Where a group word states a preference or a limit (#200). A noun counts after "no", "only",
 * "prefer" or "must be", and before "only", "preferred" or "wanted": "no women", "prefer men",
 * "ladies only", "must be a woman". An adjective (a nationality, a color) counts where it
 * describes people: before a word for people ("Mexican workers", "white applicants", "Americans
 * only"), after "must be", and after "no", "only" or "prefer" as a plural, before a word for
 * people or at the end of a phrase ("no Mexicans", "only Irish"). So "the American River", "a
 * white shirt" and "no English required" are not flagged.
 */
function groupMatcher(term: string, form: FlaggedGroup['form']): RegExp {
  const { one, many } = termForms(term);
  const any = `(?:${one}|${many})`;
  const forms =
    form === 'noun'
      ? [
          `(?:${LIMIT_BEFORE}) ${ARTICLE}${any}`,
          `${MUST_BE} ${ARTICLE}${any}`,
          `${any} (?:${PREFERENCE_AFTER})`,
        ]
      : [
          `(?:${LIMIT_BEFORE}) ${ARTICLE}(?:${many}(?: (?:${PEOPLE}))?|${one}(?: (?:${PEOPLE})|${PHRASE_END}))`,
          `${MUST_BE} ${ARTICLE}${any}`,
          `${any} (?:${PEOPLE})`,
        ];
  return new RegExp(`${BEFORE}(?:${forms.join('|')})${AFTER}`, 'u');
}

// --- Age limits (#200) --------------------------------------------------------------------------
// Any maximum age or age range, in any order, found by rule rather than listed phrase by phrase:
// "must be under 35", "between 18 and 30", "18 to 30 years old", "no one over 40", "age 21-35".
// A number counts as an age only from 16 to 99, never after "$", and never before a unit ("under
// 30 minutes", "between 20 and 40 hours", "18 to 30 guests"), so pay, hours and distances pass.

const NUM = String.raw`\p{N}{1,3}`;
/** Words that put an upper limit on the number after them. */
const AGE_CAP =
  '(?:under|below|younger than|less than|no older than|not older than|not over|at most)';
/** Words after a number that make it an age. */
const AGE_UNIT = String.raw`(?:(?:years?|yrs?)(?: of age| olds?)|y ?o|y/o)`;
/** Between the two numbers of a range ("18-30" is "18 30" once dashes are folded). */
const RANGE = '(?: to | and | through | thru | )';
const NUM_START = String.raw`(?<![\p{L}\p{N}$])`;
const PREFERENCE_NEXT = String.raw`(?= (?:only|preferred|wanted|welcome|encouraged|desired|needed|ideal|sought|please|need apply|apply)${AFTER})`;
const NOBODY =
  '(?:no one|noone|nobody|no applicants?|no candidates?|no workers?|no people|no persons|no employees?|no hires|not open to anyone|not for anyone)';
const YOU = "(?:are you|you're|you are|were you|r u)";

/** Units that make the number before them a quantity, not an age. */
const NOT_AN_AGE = new RegExp(
  String.raw`^ ?(?:[%/:°$]|(?:(?:a|an|per|each|every) )?(?:${[
    'hours?',
    'hrs?',
    'minutes?',
    'mins?',
    'seconds?',
    'days?',
    'nights?',
    'weeks?',
    'wks?',
    'weekends?',
    'months?',
    'seasons?',
    'shifts?',
    'times?',
    'miles?',
    'mi',
    'mph',
    'km',
    'kms',
    'kilometers?',
    'kilometres?',
    'meters?',
    'metres?',
    'feet',
    'foot',
    'ft',
    'inches',
    'yards?',
    'lbs?',
    'pounds?',
    'kgs?',
    'kilos?',
    'kilograms?',
    'ounces?',
    'oz',
    'tons?',
    'gallons?',
    'liters?',
    'litres?',
    'degrees?',
    'percent',
    'people',
    'persons',
    'guests',
    'customers',
    'clients',
    'visitors',
    'tables',
    'covers',
    'rooms',
    'beds',
    'bunks',
    'cabins',
    'sites',
    'kids',
    'children',
    'campers',
    'students',
    'riders',
    'passengers',
    'seats',
    'acres?',
    'head',
    'animals',
    'horses',
    'cows',
    'boats',
    'trips',
    'runs',
    'tours',
    'cases',
    'boxes',
    'bags',
    'loads',
    'orders',
    'calls',
    'dollars?',
    'usd',
    'cents?',
    'bucks',
    'am',
    'pm',
    'staff',
    'employees',
    'workers',
    'crew',
    'members',
    'positions',
    'openings',
    'spots',
    'years? (?:of(?! age)|in|on|at|with|as|experience)',
    'yrs? (?:of(?! age)|in|on|at|with|as|experience)',
  ].join('|')})${AFTER})`,
  'u',
);

/**
 * One way to state an age limit. Named groups `lo` and `hi` hold a range, `n` a single age. With
 * `unit`, the number must not be followed by a unit. `min` is the lowest number read as an age.
 */
type AgeRule = { re: RegExp; min: number; unit: boolean };

const ageRule = (source: string, opts: { min?: number; unit?: boolean } = {}): AgeRule => ({
  re: new RegExp(`${BEFORE}${source}${AFTER}`, 'gu'),
  min: opts.min ?? 16,
  unit: opts.unit ?? false,
});

/** The age rules for listing text. Context words before or after are read, not reported. */
const LISTING_AGE_RULES: AgeRule[] = [
  // "Age 21-35", "ages 18 to 30", "aged 20 through 40".
  ageRule(`(?:age|ages|aged)(?: of| from| between)? (?<lo>${NUM})${RANGE}(?<hi>${NUM})`, {
    min: 0,
  }),
  // "18 to 30 years old", "21-35 year olds".
  ageRule(`${NUM_START}(?<lo>${NUM})${RANGE}(?<hi>${NUM}) ${AGE_UNIT}`),
  // "Between 18 and 30".
  ageRule(`between (?<lo>${NUM}) and (?<hi>${NUM})`, { unit: true }),
  // "18-30 only", "21 to 35 preferred".
  ageRule(`${NUM_START}(?<lo>${NUM})(?: to | through | thru | )(?<hi>${NUM})${PREFERENCE_NEXT}`),
  // "Must be under 35", "should be no older than 40".
  ageRule(`(?<=${MUST_BE} (?:aged? )?)${AGE_CAP} (?<n>${NUM})`, { unit: true }),
  // "Under 35 years old", "younger than 40 years of age".
  ageRule(`${AGE_CAP} (?<n>${NUM}) ${AGE_UNIT}`),
  // "35 or younger", "35 and under", "35 years old or younger".
  ageRule(`${NUM_START}(?<n>${NUM})(?: ${AGE_UNIT})? (?:or|and) (?:younger|under|below|less)`),
  // "No one over 40", "nobody older than 45".
  ageRule(`${NOBODY} (?:over|above|older than|past|aged? over|aged?) (?<n>${NUM})`, { unit: true }),
  // "No one 40 or older".
  ageRule(`${NOBODY} (?<n>${NUM})(?: ${AGE_UNIT})? (?:or|and) (?:older|over|above|up)`),
  // "Under 35 preferred", "applicants younger than 40 only".
  ageRule(`${AGE_CAP} (?<n>${NUM})(?: ${AGE_UNIT})?${PREFERENCE_NEXT}`),
  // "Prefer candidates under 35", "looking for someone younger than 30".
  ageRule(
    `(?<=(?:prefer|prefers|preferably|preferring|preference for|seeking|looking for|want|only|only hiring|hiring only)(?: [\\p{L}']+){0,2} )${AGE_CAP} (?<n>${NUM})`,
    { unit: true },
  ),
];

/**
 * The age rules for a screening question, read after the allowed "at least 18 (or 21)" is taken
 * out. They need "are you" (or the like) close before, so "Have you worked with campers under 16?"
 * is not about the applicant's age, while "Are you over 18 and under 30?" is.
 */
const QUESTION_AGE_RULES: AgeRule[] = [
  // "Are you under 35?", "are you (over 18) and under 30?", "are you a student under 25?".
  ageRule(`(?<=${YOU}(?: \\S+){0,2} )${AGE_CAP} (?<n>${NUM})`, { unit: true }),
  // "Are you between 18 and 30?", "are you 18-30?".
  ageRule(`(?<=${YOU} (?:between |from |aged? )?)(?<lo>${NUM})${RANGE}(?<hi>${NUM})`, {
    unit: true,
  }),
  // "Are you 30 or younger?", "are you 35 and under?".
  ageRule(
    `(?<=${YOU}(?: \\S+){0,2} )(?<n>${NUM})(?: ${AGE_UNIT})? (?:or|and) (?:younger|under|below|less)`,
  ),
];

/** Whether a rule's match reads as an age limit: ages in range, a real range, no unit after. */
function isAgeLimit(rule: AgeRule, m: RegExpMatchArray, text: string): boolean {
  const g = m.groups ?? {};
  const ages = [g.lo, g.hi, g.n].filter((v): v is string => v !== undefined).map(Number);
  if (ages.some((a) => a < rule.min || a > 99)) return false;
  if (g.lo !== undefined && g.hi !== undefined && Number(g.lo) >= Number(g.hi)) return false;
  return !(rule.unit && NOT_AN_AGE.test(text.slice((m.index ?? 0) + m[0].length)));
}

/** The first age limit a rule finds in folded text, or null. */
function findAgeLimit(rule: AgeRule, text: string): string | null {
  for (const m of text.matchAll(rule.re)) {
    if (isAgeLimit(rule, m, text)) return m[0];
  }
  return null;
}

/** The fields a host writes as prose. Codes, ids, enums and links are not read for wording. */
const PROSE_FIELDS: RegExp[] = [
  /^basics\.title$/,
  /^when\.minCommitment$/,
  /^pay\.(bonuses|deductions)$/,
  /^housing\.(note|finePrint\.notes)$/,
  /^meals\.(note|dietary)$/,
  /^genreDetails\.(vesselType|homePort|rotation|timeAtSea|operationType|harvestWindow|timeZoneOverlap|equipmentProvided|internet)$/,
  /^genreDetails\.(staffPerks|equipment|certifications)\.\d+$/,
  /^job\.(description|typicalDay|physicalDemands)$/,
  /^job\.(responsibilities|requiredQualifications|preferredQualifications|skills|certifications)\.\d+$/,
  /^applying\.questions\.\d+\.(prompt|choices\.\d+)$/,
  /^applying\.additionalStep\.note$/,
];

/** A screening question's prompt or one of its choices. */
const QUESTION_FIELD = /^applying\.questions\.\d+\.(prompt|choices\.\d+)$/;

/** A flagged phrase found in one field: the list entry, what it matched, and the ground. */
export type FlaggedWording = {
  field: string;
  /** The list entry (for a nationality, the nationality). */
  phrase: string;
  /** The text it matched, folded. */
  matched: string;
  ground: WordingGround;
  suggestion: string;
};

export type WordingLists = {
  flagged: FlaggedPhrase[];
  nationalities: string[];
  groups: FlaggedGroup[];
};

/** One way to find flagged wording in folded text, with what to report when it does. */
type WordingMatcher = { find: (text: string) => string | null; entry: FlaggedPhrase };

const byRegExp =
  (re: RegExp) =>
  (text: string): string | null =>
    re.exec(text)?.[0] ?? null;

/**
 * The flag-for-review wording in a draft's prose: one per field, the longest match winning (so
 * "teens welcome" is reported, not "teens"; on a tie, the listed phrase). It reads the phrase
 * list, the nationalities and the group words, and finds any maximum age or age range on its
 * own. Fields in `skip` are not read.
 */
export function findFlaggedWording(
  draft: unknown,
  lists: WordingLists,
  skip: ReadonlySet<string> = new Set(),
): FlaggedWording[] {
  const matchers: WordingMatcher[] = [
    ...lists.flagged.flatMap((entry) => {
      const re = phraseRegExp(entry.phrase);
      return re ? [{ find: byRegExp(re), entry }] : [];
    }),
    ...lists.nationalities
      .filter((n) => normalizeForPhraseMatch(n) !== '')
      .map((n) => ({
        find: byRegExp(groupMatcher(n, 'adjective')),
        entry: {
          phrase: n,
          ground: 'national_origin' as const,
          suggestion: NATIONALITY_SUGGESTION,
        },
      })),
    ...lists.groups
      .filter((g) => normalizeForPhraseMatch(g.term) !== '')
      .map((g) => ({
        find: byRegExp(groupMatcher(g.term, g.form)),
        entry: { phrase: g.term, ground: g.ground, suggestion: g.suggestion },
      })),
    ...LISTING_AGE_RULES.map((rule) => ({
      find: (text: string) => findAgeLimit(rule, text),
      entry: { phrase: 'an age limit', ground: 'age' as const, suggestion: AGE_LIMIT_SUGGESTION },
    })),
  ];
  const out: FlaggedWording[] = [];
  for (const { path, text } of textFields(draft)) {
    if (skip.has(path) || !PROSE_FIELDS.some((p) => p.test(path))) continue;
    const norm = normalizeForPhraseMatch(text);
    let best: FlaggedWording | null = null;
    for (const { find, entry } of matchers) {
      const matched = find(norm);
      if (matched && (!best || matched.length > best.matched.length)) {
        const { phrase, ground, suggestion } = entry;
        best = { field: path, phrase, matched, ground, suggestion };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

/** The host-facing reason a phrase is flagged, with the neutral wording to use. */
export function flaggedWordingMessage(f: FlaggedWording): string {
  return `"${f.matched}" ${GROUND_WHY[f.ground]}. ${f.suggestion} If the job needs it, you can keep it: we will review the listing before it goes live.`;
}

/**
 * The allowed age questions ("Are you at least 18?" or 21, "18 or older", "over 21", "18+", "over
 * the age of 18", "18 years old or older"), removed before a question is matched against the age
 * topic. Only the minimum is removed, so "Are you over 18 and under 30?" still asks for a maximum.
 */
const ALLOWED_AGE_QUESTION = new RegExp(
  `${BEFORE}(?:(?:at least|over|above) (?:the age of )?(?:18|21)|(?:18|21)(?: years| yrs)?(?: old| of age)? (?:or|and) (?:older|over|up|above)|(?:18|21) ?\\+)(?: years(?: old| of age)?)?${AFTER}`,
  'gu',
);

/**
 * The forbidden topic a screening question's text asks about, or null. The longest matching
 * phrase decides, so "where were you born" is national origin, not age. Any age range or
 * maximum age the applicant is asked about is the age topic too (#200).
 */
export function questionTopic(text: string, topics: QuestionTopics): QuestionTopic | null {
  const norm = normalizeForPhraseMatch(text)
    .replace(ALLOWED_AGE_QUESTION, ' ')
    .replace(/\s+/g, ' ');
  let best: { topic: QuestionTopic; length: number } | null = null;
  for (const [topic, phrases] of Object.entries(topics) as [QuestionTopic, string[]][]) {
    for (const { re } of phraseMatchers(phrases)) {
      const m = re.exec(norm);
      if (m && (!best || m[0].length > best.length)) best = { topic, length: m[0].length };
    }
  }
  for (const rule of QUESTION_AGE_RULES) {
    const matched = findAgeLimit(rule, norm);
    if (matched && (!best || matched.length > best.length)) {
      best = { topic: 'age', length: matched.length };
    }
  }
  return best?.topic ?? null;
}

/** Every string in the draft with its path (arrays indexed), skipping ids. */
function textFields(value: unknown, prefix = ''): { path: string; text: string }[] {
  if (typeof value === 'string')
    return isUuid(value) || !prefix ? [] : [{ path: prefix, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => textFields(v, `${prefix}.${i}`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([k, v]) => textFields(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}

const issue = (code: IssueCode, field: string, message: string, href?: string): Issue => ({
  code,
  section: sectionOfPath(field),
  field,
  message,
  ...(href ? { href } : {}),
});

function bySection(issues: Issue[]): Issue[] {
  const order = new Map<string, number>(BUILDER_SECTIONS.map((s, i) => [s, i]));
  return issues
    .map((it, i) => ({ it, i }))
    .sort((a, b) => (order.get(a.it.section) ?? 0) - (order.get(b.it.section) ?? 0) || a.i - b.i)
    .map(({ it }) => it);
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null ? (v as Json) : {});
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Whether a provided housing or meals section lacks a usable cost. */
function costMissing(section: Json): boolean {
  if (section.provided !== true) return false;
  const cost = section.cost;
  if (typeof cost !== 'object' || cost === null) return true;
  const c = cost as Json;
  if (c.free === true) return false;
  return !((num(c.cents) ?? 0) > 0);
}

function payVague(pay: Json, ratio: number): string | null {
  const min = num(pay.minCents);
  const max = num(pay.maxCents);
  if (min === 0) return 'pay.minCents';
  if (
    pay.unit === 'crew_share' &&
    (pay.crewShareEstimate === null || pay.crewShareEstimate === undefined)
  ) {
    return 'pay.crewShareEstimate';
  }
  if (pay.kind === 'range' && min !== null && max !== null && max > ratio * min)
    return 'pay.maxCents';
  return null;
}

/** The media a draft references, with the kind each one must be. */
function referencedMedia(draft: Json): { field: string; mediaId: string; kind: MediaKind }[] {
  const out: { field: string; mediaId: string; kind: MediaKind }[] = [];
  const add = (field: string, kind: MediaKind) => {
    const id = getPath(draft, field);
    if (isUuid(id)) out.push({ field, mediaId: id, kind });
  };
  if (obj(draft.housing).provided === true) {
    for (const slot of HOUSING_SLOTS) add(`housing.photos.${slot}`, 'housing_photo');
  }
  if (obj(draft.meals).provided === true) {
    for (const slot of MEAL_SLOTS) add(`meals.photos.${slot}`, 'meal_photo');
  }
  add('photos.coverMediaId', 'listing_photo');
  const gallery = getPath(draft, 'photos.galleryMediaIds');
  if (Array.isArray(gallery)) {
    gallery.forEach((_, i) => add(`photos.galleryMediaIds.${i}`, 'listing_photo'));
  }
  return out;
}

function isMissingValue(i: { code: string; message: string; input?: unknown }): boolean {
  return i.code !== 'custom' && (i.input === undefined || /received undefined/.test(i.message));
}

/**
 * Runs every automatic check on a draft. `parsed` is the validated content when the schema
 * passes (whatever the other checks say), else null.
 */
export async function runListingChecks(
  db: DbOrTx,
  i: {
    orgId: string;
    listing: { id: string; firstPublishedAt: Date | null; sourceGenre: string | null };
    draft: unknown;
    now: Date;
  },
): Promise<ListingChecksResult> {
  const draft = obj(i.draft);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const [
    phrases,
    flagged,
    nationalities,
    groups,
    topics,
    ratio,
    minWages,
    genres,
    blocked,
    shorteners,
  ] = await Promise.all([
    getSetting(db, 'listings.prohibited_phrases'),
    getSetting(db, 'listings.flagged_phrases'),
    getSetting(db, 'listings.flagged_nationalities'),
    getSetting(db, 'listings.flagged_groups'),
    getSetting(db, 'listings.question_topics'),
    getSetting(db, 'listings.vague_pay_range_ratio'),
    getSetting(db, 'listings.min_wage_cents_by_state'),
    getSetting(db, 'listings.genres'),
    getSetting(db, 'links.blocked_domains'),
    getSetting(db, 'links.shortener_domains'),
  ]);

  // Housing and meals cost.
  const costCodes: [string, 'housing_cost_missing' | 'meals_cost_missing'][] = [];
  if (costMissing(obj(draft.housing))) costCodes.push(['housing', 'housing_cost_missing']);
  if (costMissing(obj(draft.meals))) costCodes.push(['meals', 'meals_cost_missing']);

  // The schema: one required_missing per field.
  const result = ListingContentSchema.safeParse(i.draft ?? {}, { reportInput: true });
  if (!result.success) {
    const seen = new Set<string>();
    for (const zi of result.error.issues) {
      const field = zi.path.map(String).join('.');
      if (!field || seen.has(field)) continue;
      if (costCodes.some(([key]) => field === `${key}.cost` || field.startsWith(`${key}.cost.`))) {
        continue;
      }
      seen.add(field);
      errors.push(
        issue('required_missing', field, isMissingValue(zi) ? MESSAGES.required : zi.message),
      );
    }
  }
  for (const [key, code] of costCodes) errors.push(issue(code, `${key}.cost`, MESSAGES[code]));

  // Pay.
  const pay = obj(draft.pay);
  const vagueField = payVague(pay, ratio);
  if (vagueField) errors.push(issue('pay_vague', vagueField, MESSAGES.pay_vague));

  // Prohibited wording, in every text field (questions, choices and the step note included).
  // A field reports one wording problem: blocked wording, then a forbidden question, then a flag.
  const worded = new Set<string>();
  const matchers = phraseMatchers(phrases);
  for (const { path, text } of textFields(draft)) {
    const norm = normalizeForPhraseMatch(text);
    const hit = matchers.find((m) => m.re.test(norm));
    if (hit) {
      worded.add(path);
      errors.push(
        issue(
          'prohibited_wording',
          path,
          `Remove "${hit.phrase}". You can ask about visa sponsorship instead.`,
        ),
      );
    }
  }

  // Screening questions may not ask about protected traits (legal review 2.2 item 2).
  for (const { path, text } of textFields(draft)) {
    if (worded.has(path) || !QUESTION_FIELD.test(path)) continue;
    const topic = questionTopic(text, topics);
    if (topic) {
      worded.add(path);
      errors.push(issue('question_not_allowed', path, QUESTION_RULES[topic]));
    }
  }

  // Wording to review (legal review 2.2 item 1): a warning, so the listing is never rejected
  // for it; screening sends it to the review queue.
  for (const f of findFlaggedWording(draft, { flagged, nationalities, groups }, worded)) {
    warnings.push(issue('wording_flagged', f.field, flaggedWordingMessage(f)));
  }

  // Visa sponsorship (legal review 2.3). H-2A housing must be free (20 CFR 655.122(d)).
  const job = obj(draft.job);
  const housing = obj(draft.housing);
  if (job.visaSponsorship === 'h2a') {
    const field =
      housing.provided === false
        ? 'housing.provided'
        : housing.provided === true && obj(housing.cost).free === false
          ? 'housing.cost'
          : null;
    if (field) {
      errors.push(
        issue('h2a_housing_not_free', field, MESSAGES.h2a_housing_not_free, RULE_LINKS.h2a_housing),
      );
    }
  }
  // H-2B: publishing confirms the listing matches the job order (20 CFR 655.41(a)).
  if (job.visaSponsorship === 'h2b') {
    warnings.push(
      issue(
        'h2b_job_order',
        'job.visaSponsorship',
        MESSAGES.h2b_job_order,
        RULE_LINKS.h2b_advertising,
      ),
    );
  }

  // The Additional step link.
  const stepUrl = getPath(draft, 'applying.additionalStep.url');
  if (typeof stepUrl === 'string' && stepUrl.trim() !== '') {
    if (!checkLinkSyntax(stepUrl, { blocked, shorteners }).ok) {
      errors.push(issue('link_unsafe', 'applying.additionalStep.url', MESSAGES.link_unsafe));
    }
  }

  // The location.
  const where = obj(draft.where);
  const locationField = where.mode === 'remote' ? 'where.hostLocationId' : 'where.locationId';
  const locationId = getPath(draft, locationField);
  let location: Location | null = null;
  if (isUuid(locationId)) {
    const found = (await getLocations(db, [locationId])).get(locationId);
    if (!found || found.orgId !== i.orgId || found.archived) {
      errors.push(issue('location_unavailable', locationField, MESSAGES.location_unavailable));
    } else {
      location = found;
    }
  }

  // Dates, in the listing's timezone.
  const today = localDate(i.now, location?.timezone ?? 'UTC');
  const dates = obj(getPath(draft, 'when.dates'));
  if (dates.mode === 'fixed' && typeof dates.end === 'string' && dates.end < today) {
    errors.push(issue('end_date_past', 'when.dates.end', MESSAGES.end_date_past));
  }
  const deadline = getPath(draft, 'applying.deadline');
  if (typeof deadline === 'string' && deadline < today) {
    errors.push(issue('deadline_past', 'applying.deadline', MESSAGES.deadline_past));
  }

  // Photos: the org's own, of the right kind, not rejected or blocked.
  const media = referencedMedia(draft);
  const info = await getMediaInfo(
    db,
    media.map((m) => m.mediaId),
  );
  for (const m of media) {
    const mi = info.get(m.mediaId);
    if (
      !mi ||
      mi.ownerOrgId !== i.orgId ||
      mi.kind !== m.kind ||
      mi.status === 'rejected' ||
      mi.status === 'blocked'
    ) {
      errors.push(issue('photo_unavailable', m.field, MESSAGES.photo_unavailable));
    }
  }

  // Genre.
  const basics = obj(draft.basics);
  if (typeof basics.genre === 'string' && basics.genre !== '') {
    const genre = genres.find((g) => g.code === basics.genre);
    const keepsInactive =
      i.listing.firstPublishedAt !== null || i.listing.sourceGenre === basics.genre;
    if (
      !genre ||
      (typeof basics.primaryCategory === 'string' && genre.category !== basics.primaryCategory) ||
      (!genre.active && !keepsInactive)
    ) {
      errors.push(issue('genre_invalid', 'basics.genre', MESSAGES.genre_invalid));
    }
  }

  // Warning: pay below the minimum wage.
  const weeklyHours = num(getPath(draft, 'when.weeklyHours'));
  const minCents = num(pay.minCents);
  if (minCents !== null && minCents > 0 && weeklyHours !== null && typeof pay.unit === 'string') {
    const hourly = hourlyPayCents(
      { minCents, unit: pay.unit as ListingContent['pay']['unit'] },
      weeklyHours,
    );
    const remote = where.mode === 'remote';
    const state = remote ? null : (location?.state ?? null);
    const floor = remote
      ? FEDERAL_MIN_WAGE_CENTS
      : state && isUSStateCode(state)
        ? minWages[state]
        : null;
    if (hourly !== null && floor !== null && hourly < floor) {
      warnings.push(
        issue(
          'pay_below_min_wage',
          'pay.minCents',
          `This looks below the minimum wage in ${state ?? 'the US'}. Check it before you publish.`,
        ),
      );
    }
  }

  // Warning: a housing or meal photo that doesn't show its slot.
  const slotted = media.filter(
    (m) => m.field.startsWith('housing.') || m.field.startsWith('meals.'),
  );
  if (slotted.length > 0) {
    const rows = await db
      .select({ mediaId: photoSlotChecks.mediaId, slot: photoSlotChecks.slot })
      .from(photoSlotChecks)
      .where(
        and(
          inArray(
            photoSlotChecks.mediaId,
            slotted.map((m) => m.mediaId),
          ),
          eq(photoSlotChecks.result, 'mismatch'),
        ),
      );
    const mismatched = new Set(rows.map((r) => `${r.mediaId}:${r.slot}`));
    for (const m of slotted) {
      const slot = m.field.split('.').pop() ?? '';
      if (!mismatched.has(`${m.mediaId}:${slot}`)) continue;
      const label = (SLOT_LABELS[slot] ?? slot).toLowerCase();
      const article = /^[aeiou]/.test(label) ? 'an' : 'a';
      warnings.push(
        issue('photo_slot_mismatch', m.field, `This doesn't look like ${article} ${label}.`),
      );
    }
  }

  return {
    errors: bySection(errors),
    warnings: bySection(warnings),
    parsed: result.success ? result.data : null,
  };
}

/** The genre of the listing a copy or repost came from (its live revision's), or null. */
export async function sourceGenreOf(db: DbOrTx, l: ListingRecord): Promise<string | null> {
  const sourceId = l.repostedFromId ?? l.copiedFromId;
  if (!sourceId) return null;
  const [row] = await db
    .select({ genre: listingRevisions.genre })
    .from(listings)
    .innerJoin(listingRevisions, eq(listingRevisions.id, listings.publishedRevisionId))
    .where(eq(listings.id, sourceId));
  return row?.genre ?? null;
}

/** The checks the builder's Review step shows, with the org's slot use. */
export async function checkListing(
  db: DbOrTx,
  ctx: HostContext,
  id: string,
  now: Date = new Date(),
): Promise<{ errors: Issue[]; warnings: Issue[]; slot: { used: number; limit: number } }> {
  const l = await loadListing(db, ctx, id);
  const { errors, warnings } = await runListingChecks(db, {
    orgId: ctx.orgId,
    listing: {
      id: l.id,
      firstPublishedAt: l.firstPublishedAt,
      sourceGenre: await sourceGenreOf(db, l),
    },
    draft: l.draft,
    now,
  });
  const slot = await getCapacity(db, ctx.orgId, 'listing_slot', now);
  return { errors, warnings, slot };
}
