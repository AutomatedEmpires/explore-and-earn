// Every operator setting: its type, default and validation. Add a key here (all three maps)
// before reading it; the operator console renders one form field per key.
import { z } from 'zod';
import { MIN_WAGE_CENTS_2026 } from '@/lib/min-wage';
import { CATEGORIES, GENRES, type Category } from '@/lib/taxonomy';
import { US_STATE_CODES, type USStateCode } from '@/lib/us-states';

/** A trust check kind's decision thresholds on the classifier's score (0 to 1). */
export type Thresholds = { approveBelow: number; rejectAtOrAbove: number };

/** A genre as operators manage it; deactivated genres stay valid on existing listings. */
export type GenreSetting = { code: string; label: string; category: Category; active: boolean };

/**
 * What a flag-for-review phrase may signal (legal review section 2.2, plus 2.6 for minors). The
 * listing checks hold one fixed explanation per ground, so operators add phrases, not grounds.
 */
export const WORDING_GROUNDS = [
  'age',
  'sex',
  'race',
  'national_origin',
  'disability',
  'religion',
  'family_status',
  'criminal_history',
  'appearance',
  'minors',
] as const;
export type WordingGround = (typeof WORDING_GROUNDS)[number];

/**
 * A phrase that sends a listing to review (never an automatic rejection). Matched like the
 * block list: case, width, periods, dashes and spacing folded, on word boundaries. In `phrase`,
 * `*` stands for any one word and `#` for any whole number. `suggestion` is the neutral wording
 * the host is offered.
 */
export type FlaggedPhrase = { phrase: string; ground: WordingGround; suggestion: string };

/** How a group word names people: by itself ("women"), or only before a word for people ("white"). */
export const GROUP_FORMS = ['noun', 'adjective'] as const;

/**
 * A word for a group of people protected from hiring discrimination (#200). It sends a listing to
 * review where it states a preference or a limit, not wherever it appears. A `noun` counts after
 * "no", "only", "prefer" or "must be" and before "only", "preferred" or "wanted" ("no women",
 * "ladies only"). An `adjective` counts before a word for people ("white applicants"), after
 * "must be", and after "no", "only" or "prefer" as a plural, before a word for people or at the
 * end of a phrase ("no whites"), so "white shirt" and "no English required" are not flagged.
 * Plurals are matched too ("lady", "ladies"; "woman", "women").
 */
export type FlaggedGroup = {
  term: string;
  ground: WordingGround;
  form: (typeof GROUP_FORMS)[number];
  suggestion: string;
};

/** What a screening question may not ask about (legal review section 2.2 item 2; sex, #200). */
export const QUESTION_TOPICS = [
  'age',
  'marital_status',
  'pregnancy',
  'disability',
  'religion',
  'national_origin',
  'arrest_record',
  'sex',
] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

/** The type of every setting, by key. */
export interface SettingValues {
  'limits.invites_per_seeker_per_week': number;
  /**
   * Thresholds by trust check kind. The set of kinds is open (later sub-projects register their
   * own with trust.registerCheckKind). A stored value is merged over the defaults kind by kind.
   * The defaults include Foundation's two kinds and SP2's listing, fraud, verification and
   * photo-slot kinds. A kind with no entry at all uses the default its registration gives.
   */
  'trust.thresholds': Record<string, Thresholds>;
  'trust.audit_sample_rate': number;
  'business.mailing_address': string;
  'business.support_email': string;
  'ops.second_signoff_refund_cents': number;
  // SP2: launch, founding hosts, team, listings and link safety.
  /** When public launch happens (ISO instant), or null before it is set. */
  'launch.public_at': string | null;
  'founding.max_hosts': number;
  'founding.free_days': number;
  'founding.return_window_months': number;
  'team.invitation_ttl_days': number;
  /** Phrases with no lawful use in a listing: publishing is blocked until they are removed. */
  'listings.prohibited_phrases': string[];
  /** Phrases that send a listing to review, with the reason and neutral wording shown to the host. */
  'listings.flagged_phrases': FlaggedPhrase[];
  /**
   * Nationalities (and regional or ethnic origins) flagged when they describe people: "Mexican
   * workers", "Americans only", "must be Irish". The word alone ("the American River") is not.
   */
  'listings.flagged_nationalities': string[];
  /** Words for protected groups, flagged where they state a preference or a limit ("men preferred"). */
  'listings.flagged_groups': FlaggedGroup[];
  /** Phrases that make a screening question ask about a forbidden topic, by topic. */
  'listings.question_topics': Record<QuestionTopic, string[]>;
  'listings.vague_pay_range_ratio': number;
  'listings.min_wage_cents_by_state': Record<USStateCode, number>;
  'listings.genres': GenreSetting[];
  'links.blocked_domains': string[];
  'links.shortener_domains': string[];
  'verification.blocked_domains': string[];
  // SP3: discovery limits (SP3 spec 8.8).
  'discovery.saved_jobs_per_user': number;
  'discovery.saved_searches_per_user': number;
  /** Alert pushes per user per UTC day; over the cap, matches still go to the daily email. */
  'discovery.alert_push_daily_cap': number;
  // SP5: fit score switches. Off means no score is computed or stored.
  'hiring.fit_enabled': boolean;
  /** US state codes where fit is off for listings located in that state. */
  'hiring.fit_disabled_states': USStateCode[];
  'support.ai_enabled': boolean;
  'support.ai_auto_reply_min_confidence': number;
  'privacy.export_ttl_days': number;
  'ops.spike_rules': {
    failed_payments: { minCount: number; multiplier: number };
    fraud_items: { minCount: number; multiplier: number };
  };
  'content.about': { headline: string; bodyMd: string };
  'launch.mode': 'private' | 'public';
}

export type SettingKey = keyof SettingValues;
export type SettingValue<K extends SettingKey> = SettingValues[K];

// --- Listing wording lists (legal review 2.2, 2.6; #121) ----------------------------------------
// These are the agent's first lists for counsel to confirm (legal review section 13). Each one
// errs toward review: a flagged listing costs an operator a look, never a host's listing. The
// listing checks skip the list of grounds in a non-discrimination statement ("without regard to
// race, religion or national origin", "EOE M/F/D/V"), so these entries are not flagged there
// (#207). A preference or a limit beside the statement is still flagged.

/** Entries of one ground that share the neutral wording offered. */
const flag = (ground: WordingGround, suggestion: string, phrases: string[]): FlaggedPhrase[] =>
  phrases.map((phrase) => ({ phrase, ground, suggestion }));

const DESCRIBE_WORK = 'Describe the work and the skills it needs, not the kind of person you want.';

const FLAGGED_PHRASES: FlaggedPhrase[] = [
  // Age (29 CFR 1625.4 names "young" and "recent college graduate").
  ...flag('age', 'Describe the work instead, like "Upbeat with guests and on your feet all day".', [
    'young',
    'youthful',
  ]),
  ...flag('age', 'Say "Entry level" or "No experience needed".', [
    'recent graduate',
    'recent graduates',
    'recent college graduate',
    'recent college graduates',
    'recent grad',
    'recent grads',
  ]),
  ...flag('age', 'Name the skills you need, like "Comfortable with a smartphone and email".', [
    'digital native',
    'digital natives',
  ]),
  // #200. The listing checks also find any maximum age and any age range on their own ("must be
  // under 35", "between 18 and 30", "no one over 40"), so these are the wordings without a number.
  ...flag('age', 'Describe the work instead, like "Upbeat with guests and on your feet all day".', [
    'younger applicants',
    'younger candidates',
    'younger workers',
    'younger people',
    'millennial',
    'millennials',
    'gen z',
    'in your #s',
    'in their #s',
    'in your twenties',
    'in their twenties',
    'in your thirties',
    'in their thirties',
    'born in #',
    'born after #',
    'born before #',
  ]),
  ...flag('age', 'Remove the age limit. The only age rule a listing can set is 18 or 21 and up.', [
    'under 30',
    'under # years old',
    'under the age of #',
    'no older than #',
    'not older than #',
    'maximum age',
    'max age',
    'age limit',
    'ages # to #',
    'ages # #',
    'aged # to #',
    'aged # #',
    'between the ages of #',
    '# or younger',
    '# years old or younger',
  ]),
  // Sex.
  ...flag('sex', DESCRIBE_WORK, [
    'male only',
    'males only',
    'female only',
    'females only',
    'men only',
    'women only',
    'must be male',
    'must be female',
    'male applicants',
    'female applicants',
    'not pregnant',
    // #200. Pregnancy is sex discrimination (42 U.S.C. 2000e(k)).
    'no pregnant women',
    'pregnant',
    'pregnancy',
  ]),
  ...flag('sex', 'Try "server".', ['waitress', 'waitresses']),
  ...flag('sex', 'Try "host".', ['hostess', 'hostesses']),
  ...flag('sex', 'Try "salesperson" or "sales associate".', ['salesman', 'salesmen']),
  ...flag('sex', 'Try "maintenance worker".', ['handyman', 'handymen']),
  ...flag('sex', 'Try "housekeeper" or "room attendant".', [
    'maid',
    'maids',
    'chambermaid',
    'chambermaids',
  ]),
  ...flag('sex', 'Try "staff", "team" or "everyone".', ['girls', 'gals', 'guys']),
  // Race and color (42 U.S.C. 2000e-3(b) names them first; #200). Words for the groups are in
  // `listings.flagged_groups`.
  ...flag('race', DESCRIBE_WORK, [
    'skin color',
    'skin colour',
    'skin tone',
    'light skinned',
    'light skin',
    'fair skinned',
    'fair skin',
    'dark skinned',
    'dark skin',
    'complexion',
    'people of color',
    'person of color',
    'racial background',
  ]),
  // National origin, citizenship and language (8 U.S.C. 1324b).
  ...flag(
    'national_origin',
    'Name the language skill the job needs, like "Fluent in Spanish to help guests".',
    [
      'native speaker',
      'native speakers',
      'native * speaker',
      'native * speakers',
      'mother tongue',
      'first language',
      'no accent',
      'without an accent',
      'accent free',
      'english only',
    ],
  ),
  ...flag(
    'national_origin',
    'Say "You must be authorized to work in the US", or say whether you sponsor visas.',
    [
      'us citizen',
      'us citizens',
      'us citizenship',
      'citizenship required',
      'must be a citizen',
      'green card',
      'nationality',
      'national origin',
      'country of origin',
      'foreign workers',
      'foreigners',
      'immigrants',
    ],
  ),
  // #200: where someone was born.
  ...flag(
    'national_origin',
    'Say "You must be authorized to work in the US", or say whether you sponsor visas.',
    [
      'us born',
      'usa born',
      'american born',
      'native born',
      'foreign born',
      'born in the us',
      'born in the usa',
      'born in the united states',
      'born in the states',
      'born in america',
      'born in this country',
      'born abroad',
      'born outside the us',
      'born in *',
      'ethnicity',
      'ethnic background',
    ],
  ),
  // Disability.
  ...flag(
    'disability',
    'Describe the physical tasks, like "Lifts up to 50 lb" or "On your feet for 8 hours". If you mean the Able Seaman (AB) credential, name the credential.',
    ['able bodied'],
  ),
  ...flag(
    'disability',
    'Describe the physical tasks, like "Lifts up to 50 lb" or "On your feet for 8 hours".',
    [
      'no disabilities',
      'no disability',
      'not disabled',
      'non disabled',
      'physically fit',
      'perfect health',
      'good health',
      'excellent health',
      'no medical conditions',
      'no health problems',
      'no health issues',
      'no medications',
      'handicapped',
      'perfect vision',
      'perfect eyesight',
      'mentally stable',
    ],
  ),
  // Religion. A religious organization may prefer its own members; review decides.
  ...flag(
    'religion',
    'Describe the duties, like "Leads morning devotions". If you are a religious organization that may hire by religion, keep it.',
    [
      'christian',
      'christians',
      'catholic',
      'catholics',
      'muslim',
      'muslims',
      'jewish',
      'mormon',
      'mormons',
      'hindu',
      'buddhist',
      'atheist',
      'atheists',
      'religious',
      'religion',
      'churchgoing',
      'church member',
      'church members',
      'attend church',
      'faith based',
      'god fearing',
      'born again',
      'strong faith',
    ],
  ),
  // Marital and family status. Housing that fits only couples is a lawful reason; say so.
  ...flag(
    'family_status',
    'Describe the housing instead, like "Housing is one room for two people sharing a bed".',
    [
      'singles only',
      'single applicants',
      'single people',
      'single men',
      'single women',
      'must be single',
      'must be married',
      'unmarried',
      'married couple',
      'married couples',
      'couples only',
      'couples preferred',
      'husband and wife',
      'husband/wife',
      'no children',
      'no kids',
      'without children',
      'without kids',
      'childless',
      'no dependents',
      'no families',
    ],
  ),
  // Criminal history.
  ...flag(
    'criminal_history',
    'Name a requirement the job has, like "Must pass a background check to drive guests", not a blanket ban.',
    [
      'no felons',
      'no felonies',
      'no felony',
      'felon',
      'felons',
      'felony',
      'felonies',
      'clean record',
      'clean criminal record',
      'criminal record',
      'criminal records',
      'criminal history',
      'criminal background',
      'no criminal',
      'convicted',
      'conviction',
      'convictions',
      'ex offenders',
      'ex cons',
    ],
  ),
  // Appearance.
  ...flag(
    'appearance',
    'Describe the dress code or the work instead, like "Wears the provided uniform".',
    [
      'good looking',
      'attractive appearance',
      'physically attractive',
      'attractive applicants',
      'attractive staff',
      'model looks',
      'slim',
      'slender',
      'must be tall',
      'height and weight',
      'height requirement',
      'weight requirement',
      'clean shaven',
      'no dreadlocks',
      'no dreads',
      'no braids',
      'hair texture',
    ],
  ),
  // Minors (section 2.6): seekers are 18 or older.
  ...flag('minors', 'Everyone on Explore&Earn is 18 or older. Remove it, or say "18 and up".', [
    'teens welcome',
    'teens',
    'teen',
    'teenagers',
    'teenager',
    'high school students',
    'high school student',
    'high schoolers',
    'minors',
    'under 18',
    '16 and up',
    '16 and older',
    '16 or older',
    '17 and up',
    '17 and older',
    '17 or older',
    '16 years old',
    '17 years old',
    '16 year olds',
    '17 year olds',
  ]),
];

const FLAGGED_NATIONALITIES = [
  'American',
  'Mexican',
  'Canadian',
  'Guatemalan',
  'Honduran',
  'Salvadoran',
  'Nicaraguan',
  'Dominican',
  'Puerto Rican',
  'Jamaican',
  'Haitian',
  'Cuban',
  'Colombian',
  'Venezuelan',
  'Peruvian',
  'Brazilian',
  'Argentinian',
  'Chilean',
  'Filipino',
  'Filipina',
  'Chinese',
  'Japanese',
  'Korean',
  'Vietnamese',
  'Thai',
  'Indian',
  'Pakistani',
  'Russian',
  'Ukrainian',
  'Polish',
  'Romanian',
  'Bulgarian',
  'Serbian',
  'Croatian',
  'Irish',
  'British',
  'English',
  'Scottish',
  'German',
  'French',
  'Italian',
  'Spanish',
  'Portuguese',
  'Dutch',
  'Swedish',
  'Norwegian',
  'Czech',
  'Slovak',
  'Hungarian',
  'Greek',
  'Turkish',
  'South African',
  'Australian',
  'New Zealander',
  'Nigerian',
  'Kenyan',
  'Ghanaian',
  'Ethiopian',
  'Egyptian',
  'Moroccan',
  'Arab',
  'Israeli',
  'Iranian',
  'Afghan',
  'European',
  'Asian',
  'African',
  'Hispanic',
  'Latino',
  'Latina',
  'Caucasian',
];

/** Group words of one ground and form that share the neutral wording offered. */
const group = (
  ground: WordingGround,
  form: FlaggedGroup['form'],
  suggestion: string,
  terms: string[],
): FlaggedGroup[] => terms.map((term) => ({ term, ground, form, suggestion }));

/** #200: words for protected groups ("men preferred", "whites only", "citizens preferred"). */
const FLAGGED_GROUPS: FlaggedGroup[] = [
  ...group('sex', 'noun', DESCRIBE_WORK, [
    'man',
    'woman',
    'male',
    'female',
    'lady',
    'gentleman',
    'boy',
    'girl',
    'guy',
    'gal',
  ]),
  ...group('race', 'adjective', DESCRIBE_WORK, [
    'white',
    'black',
    'African American',
    'Native American',
    'Asian American',
  ]),
  ...group('race', 'noun', DESCRIBE_WORK, ['minority']),
  ...group(
    'national_origin',
    'noun',
    'Say "You must be authorized to work in the US", or say whether you sponsor visas.',
    ['citizen', 'permanent resident', 'green card holder'],
  ),
];

/**
 * Phrases that put a screening question on a forbidden topic. Age is special: "Are you at least
 * 18?" and "Are you at least 21?" (and their plain variants) are removed before matching.
 */
const QUESTION_TOPIC_PHRASES: Record<QuestionTopic, string[]> = {
  age: [
    'age',
    'ages',
    'aged',
    'how old',
    'years old',
    'year old',
    'yrs old',
    'date of birth',
    'birth date',
    'birthdate',
    'birthday',
    'year of birth',
    'birth year',
    'dob',
    'born',
    'graduation year',
    'year did you graduate',
    'year you graduated',
    // #200: when someone finished school says how old they are. Any age range or maximum age
    // ("between 18 and 30", "over 18 and under 30") is found by the listing checks on its own.
    'when did you graduate',
    'when did you finish school',
    'when did you finish high school',
    'when did you finish college',
    'when did you finish university',
    'when did you complete high school',
    'when did you leave school',
    'what year did you finish school',
    'what year did you finish high school',
    'what year did you finish college',
    'year you finished school',
    'year you finished high school',
    'graduation date',
    'date of graduation',
    'year of graduation',
    'date you graduated',
    'when you graduated',
    'graduated in #',
    'class of #',
    'how long ago did you graduate',
    'how long ago did you finish school',
    'how long since you graduated',
    'in your #s',
    'in your twenties',
    'in your thirties',
    'are you above #',
    'are you at least #',
    'are you over #',
    'are you under #',
    'older than #',
    'younger than #',
    '# or older',
    '# or over',
    '# and older',
    '# and over',
  ],
  marital_status: [
    'married',
    'marital',
    'marriage',
    'spouse',
    'spouses',
    'husband',
    'wife',
    'divorced',
    'widowed',
    'are you single',
    'fiance',
    'fiancee',
    'girlfriend',
    'boyfriend',
    'maiden name',
    'do you have children',
    'do you have kids',
    'how many children',
    'how many kids',
    // #200: children and family, without "do you have" right before.
    'have any kids',
    'have any children',
    'have kids',
    'have children',
    'any dependents',
    'dependents',
    'are you a parent',
    'are you a mother',
    'are you a father',
    'are you a mom',
    'are you a dad',
    'single parent',
    'single mom',
    'single mother',
    'single dad',
    'single father',
    'number of children',
    'number of kids',
    'your kids',
    'your children',
    'kids at home',
    'children at home',
    'childcare arrangements',
    'child care arrangements',
    'family status',
    'family situation',
    'your partner',
    'do you have a partner',
  ],
  pregnancy: [
    'pregnant',
    'pregnancy',
    'expecting a baby',
    'expecting a child',
    'maternity',
    'plan to have children',
    'plan to have kids',
    'planning to have children',
    'start a family',
    'starting a family',
    'family planning',
    'birth control',
  ],
  disability: [
    'disability',
    'disabilities',
    'disabled',
    'handicap',
    'handicapped',
    'impairment',
    'impairments',
    'medical condition',
    'medical conditions',
    'medical history',
    'health condition',
    'health conditions',
    'health problems',
    'health issues',
    'medication',
    'medications',
    'prescription',
    'prescriptions',
    'diagnosed',
    'diagnosis',
    'illness',
    'illnesses',
    'mental health',
    'injuries',
    'sick days',
    "workers' comp",
    'workers comp',
    "workers' compensation",
    'workers compensation',
    'physical limitations',
  ],
  religion: [
    'religion',
    'religious',
    'church',
    'churches',
    'faith',
    'worship',
    'pray',
    'prayer',
    'sabbath',
    'god',
    'bible',
    'denomination',
    'christian',
    'catholic',
    'muslim',
    'jewish',
    'mormon',
    'hindu',
    'buddhist',
    'atheist',
  ],
  national_origin: [
    'national origin',
    'nationality',
    'citizen',
    'citizens',
    'citizenship',
    'where were you born',
    'where are you from',
    'what country',
    'which country',
    'country of birth',
    'country of origin',
    'place of birth',
    'birthplace',
    'native language',
    'first language',
    'mother tongue',
    'native tongue',
    'accent',
    'ethnicity',
    'ethnic',
    'your race',
    'what race',
    'ancestry',
    'immigrant',
    'immigration status',
    'green card',
    'visa type',
    'type of visa',
    'what visa',
    'which visa',
  ],
  arrest_record: [
    'arrest',
    'arrests',
    'arrested',
    'charged with',
    'police record',
    'pending charges',
    'mugshot',
  ],
  // #200. Title VII covers sex, and with it sexual orientation and gender identity (Bostock v.
  // Clayton County, 590 U.S. 644 (2020)). Housing split by sex is described in the listing.
  sex: [
    'gender',
    'genders',
    'gender identity',
    'your sex',
    'what sex',
    'which sex',
    'biological sex',
    'sex at birth',
    'male or female',
    'female or male',
    'man or woman',
    'woman or man',
    'a man or a woman',
    'a woman or a man',
    'boy or girl',
    'girl or boy',
    'guy or girl',
    'are you a man',
    'are you a woman',
    'are you male',
    'are you female',
    'male',
    'female',
    'males',
    'females',
    'sexual orientation',
    'transgender',
    'gay',
    'lesbian',
    'bisexual',
    'pronoun',
    'pronouns',
  ],
};

export const SETTING_DEFAULTS: { readonly [K in SettingKey]: SettingValues[K] } = {
  'limits.invites_per_seeker_per_week': 10,
  'trust.thresholds': {
    image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    listing_moderation: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    listing_fraud: { approveBelow: 0.2, rejectAtOrAbove: 0.95 },
    // Never auto-rejected: no score reaches 1.01 (SP2 spec section 8.4).
    business_verification: { approveBelow: 0.3, rejectAtOrAbove: 1.01 },
    // No review band: a photo either matches its slot or it doesn't.
    photo_slot: { approveBelow: 0.5, rejectAtOrAbove: 0.5 },
    message_scam: { approveBelow: 0.3, rejectAtOrAbove: 0.95 },
  },
  'trust.audit_sample_rate': 0.01,
  'business.mailing_address': '',
  'business.support_email': '',
  'ops.second_signoff_refund_cents': 50000,
  'launch.public_at': null,
  'founding.max_hosts': 100,
  'founding.free_days': 90,
  'founding.return_window_months': 6,
  'team.invitation_ttl_days': 7,
  'listings.prohibited_phrases': [
    'US citizens only',
    'U.S. citizens only',
    'citizens only',
    'American citizens only',
    'no foreigners',
    'native English speaker',
    'green card holders only',
    'no immigrants',
  ],
  'listings.flagged_phrases': FLAGGED_PHRASES,
  'listings.flagged_nationalities': FLAGGED_NATIONALITIES,
  'listings.flagged_groups': FLAGGED_GROUPS,
  'listings.question_topics': QUESTION_TOPIC_PHRASES,
  'listings.vague_pay_range_ratio': 2.5,
  'listings.min_wage_cents_by_state': MIN_WAGE_CENTS_2026,
  'listings.genres': GENRES.map((g) => ({ ...g, active: true })),
  'links.blocked_domains': [],
  'links.shortener_domains': [
    'bit.ly',
    'tinyurl.com',
    't.co',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'rebrand.ly',
    'cutt.ly',
    'shorturl.at',
    'tiny.cc',
    'rb.gy',
    'lnkd.in',
    's.id',
    't.ly',
  ],
  'verification.blocked_domains': [],
  'discovery.saved_jobs_per_user': 1000,
  'discovery.saved_searches_per_user': 20,
  'discovery.alert_push_daily_cap': 5,
  'hiring.fit_enabled': true,
  'hiring.fit_disabled_states': [],
  'support.ai_enabled': true,
  'support.ai_auto_reply_min_confidence': 0.85,
  'privacy.export_ttl_days': 7,
  'ops.spike_rules': {
    failed_payments: { minCount: 5, multiplier: 3 },
    fraud_items: { minCount: 5, multiplier: 3 },
  },
  'content.about': { headline: '', bodyMd: '' },
  'launch.mode': 'private',
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as readonly SettingKey[];

/**
 * Settings whose value is a map over an open set of names. A stored value is merged over the
 * default name by name, so a name the default gains later still gets its default while every
 * stored name keeps its value.
 */
export const MERGED_SETTINGS: ReadonlySet<SettingKey> = new Set<SettingKey>(['trust.thresholds']);

const probability = z.number().min(0).max(1);

// rejectAtOrAbove may be 1.01, above any score, so a kind is never auto-rejected.
const thresholds = z
  .strictObject({ approveBelow: probability, rejectAtOrAbove: z.number().min(0).max(1.01) })
  .refine((t) => t.approveBelow <= t.rejectAtOrAbove, {
    message: 'approveBelow must not be greater than rejectAtOrAbove',
  });

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** A lowercase hostname (punycode for IDNs), no scheme, port or trailing dot. */
const hostname = z
  .string()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'must be a lowercase hostname',
  );
const hostnames = z.array(hostname).max(5000);

const minWages = z.strictObject(
  Object.fromEntries(US_STATE_CODES.map((code) => [code, z.number().int().min(0)])) as Record<
    USStateCode,
    z.ZodNumber
  >,
);

const genres = z
  .array(
    z.strictObject({
      code: z.string().regex(/^[a-z0-9_]+$/, 'must be snake_case'),
      label: z.string().trim().min(1).max(60),
      category: z.enum(CATEGORIES),
      active: z.boolean(),
    }),
  )
  .min(1)
  .max(500)
  .refine((list) => new Set(list.map((g) => g.code)).size === list.length, {
    message: 'genre codes must be unique',
  });

/** How a phrase compares with another: the listing checks' folding (case, periods, dashes, spaces). */
const phraseKey = (s: string) =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/\./g, '')
    .replace(/[-\u2010-\u2015\u2212]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const unique = <T>(key: (item: T) => string, what: string) =>
  [
    (list: T[]) => new Set(list.map(key)).size === list.length,
    { message: `${what} must be unique` },
  ] as const;

/** A phrase to match: 2-100 characters with at least one letter or digit besides `*` and `#`. */
const phrase = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .refine((s) => /[\p{L}\p{N}]/u.test(s.replace(/[*#]/g, '')), {
    message: 'a phrase needs a word, not only * and #',
  });

const phrases = z
  .array(phrase)
  .min(1)
  .max(500)
  .refine(...unique<string>(phraseKey, 'phrases'));

const flaggedPhrases = z
  .array(
    z.strictObject({
      phrase,
      ground: z.enum(WORDING_GROUNDS),
      suggestion: z.string().trim().min(1).max(300),
    }),
  )
  .min(1)
  .max(1000)
  .refine(...unique<FlaggedPhrase>((f) => phraseKey(f.phrase), 'phrases'));

/** A word for people: letters, spaces, hyphens and apostrophes. */
const peopleWord = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[\p{L}][\p{L} '-]*$/u, 'use letters, spaces, hyphens and apostrophes');

const nationalities = z
  .array(peopleWord)
  .max(500)
  .refine(...unique<string>(phraseKey, 'nationalities'));

const flaggedGroups = z
  .array(
    z.strictObject({
      term: peopleWord,
      ground: z.enum(WORDING_GROUNDS),
      form: z.enum(GROUP_FORMS),
      suggestion: z.string().trim().min(1).max(300),
    }),
  )
  .min(1)
  .max(500)
  .refine(...unique<FlaggedGroup>((g) => phraseKey(g.term), 'group words'));

const questionTopics = z.strictObject(
  Object.fromEntries(QUESTION_TOPICS.map((topic) => [topic, phrases])) as Record<
    QuestionTopic,
    typeof phrases
  >,
);

/** Validates a value before it is stored, and again when it is read back. */
export const SETTING_SCHEMAS: { readonly [K in SettingKey]: z.ZodType<SettingValues[K]> } = {
  'limits.invites_per_seeker_per_week': z.number().int().min(0).max(1000),
  // Open map. Missing kinds are filled from SETTING_DEFAULTS on read (MERGED_SETTINGS).
  'trust.thresholds': z.record(
    z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, 'a check kind is a lowercase name'),
    thresholds,
  ),
  'trust.audit_sample_rate': probability,
  'business.mailing_address': z.string().max(500),
  'business.support_email': z.union([z.literal(''), z.email().max(254)]),
  'ops.second_signoff_refund_cents': z.number().int().min(0),
  'launch.public_at': z.union([z.iso.datetime({ offset: true }), z.null()]),
  'founding.max_hosts': int(0, 1000),
  'founding.free_days': int(1, 365),
  'founding.return_window_months': int(0, 24),
  'team.invitation_ttl_days': int(1, 30),
  'listings.prohibited_phrases': z.array(z.string().trim().min(2).max(100)).min(1).max(200),
  'listings.flagged_phrases': flaggedPhrases,
  'listings.flagged_nationalities': nationalities,
  'listings.flagged_groups': flaggedGroups,
  'listings.question_topics': questionTopics,
  'listings.vague_pay_range_ratio': z.number().min(1).max(10),
  'listings.min_wage_cents_by_state': minWages,
  'listings.genres': genres,
  'links.blocked_domains': hostnames,
  'links.shortener_domains': hostnames,
  'verification.blocked_domains': hostnames,
  'discovery.saved_jobs_per_user': int(1, 100_000),
  'discovery.saved_searches_per_user': int(1, 1000),
  'discovery.alert_push_daily_cap': int(0, 50),
  'hiring.fit_enabled': z.boolean(),
  'hiring.fit_disabled_states': z
    .array(z.enum(US_STATE_CODES))
    .max(US_STATE_CODES.length)
    .refine((codes) => new Set(codes).size === codes.length, {
      message: 'state codes must be unique',
    }),
  'support.ai_enabled': z.boolean(),
  'support.ai_auto_reply_min_confidence': z.number().min(0.5).max(1),
  'privacy.export_ttl_days': int(1, 30),
  'ops.spike_rules': z.strictObject({
    failed_payments: z.strictObject({
      minCount: z.number().int().min(1).max(1000),
      multiplier: z.number().min(1).max(100),
    }),
    fraud_items: z.strictObject({
      minCount: z.number().int().min(1).max(1000),
      multiplier: z.number().min(1).max(100),
    }),
  }),
  'content.about': z.strictObject({
    headline: z.string().max(120),
    bodyMd: z.string().max(10_000),
  }),
  'launch.mode': z.enum(['private', 'public']),
};
