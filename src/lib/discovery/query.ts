// The discovery URL codec and filter summaries (SP3 spec 8.1, plan Task 17).
// - parseQuery reads the URL params one at a time, each through its own zod safeParse, and drops
//   whatever fails, so old links keep working. bbox, locationId and cursor are never read from
//   the filter params (the routes validate paging and geometry on their own).
// - serializeQuery writes them back in one fixed key order, which is the canonical URL form.
// - canonicalQuery is the identity of a query (cursor hashes, saved-search hashes).
// - describeFilters, removeFilter and summarizeQuery back the filter chips and alert names.
import { z } from 'zod';
import { CATEGORIES, type Category } from '@/lib/taxonomy';
import { seasonLabel } from './dates';
import { stateByCode, US_STATES } from './states';
import {
  SEASONS,
  type DiscoveryQuery,
  type DiscoverySort,
  type FilterChip,
  type QueryLabels,
} from './types';

/** The pay slider ranges, in dollars; 0 means no filter. */
export const PAY_RANGES = {
  hour: { max: 60, step: 1 },
  day: { max: 500, step: 10 },
  year: { max: 150000, step: 1000 },
} as const;

type PayUnit = keyof typeof PAY_RANGES;

const LIST_MAX = 10;
const Q_MAX = 100;
const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const SORTS = ['relevant', 'newest', 'distance'] as const;
const PAY_UNITS = ['hour', 'day', 'year'] as const;

const CATEGORY_LABELS: Record<Category, string> = {
  maritime: 'Maritime',
  seasonal: 'Seasonal',
  farm: 'Farm',
  remote: 'Remote',
};

const PAY_SUFFIX: Record<PayUnit, string> = { hour: '/hr', day: '/day', year: '/yr' };

// One schema per parameter ------------------------------------------------------------------

const slug = z.string().regex(/^[a-z0-9-]{1,60}$/);
const stateCode = z.string().refine((c) => stateByCode(c) !== undefined);
const category = z.enum(CATEGORIES);
const qText = z.string().trim().min(1).max(Q_MAX);
const flag = z.literal('1');
const amenity = z.enum(['provided', 'free']);
const sortParam = z.enum(SORTS);
const seasonName = z.enum(SEASONS);
const year = z.coerce.number().int().min(YEAR_MIN).max(YEAR_MAX);

const startParam = z.string().transform((v, ctx): NonNullable<DiscoveryQuery['start']> => {
  if (v === '1m' || v === '3m' || v === '6m') {
    return { withinMonths: Number(v[0]) as 1 | 3 | 6 };
  }
  const m = /^([a-z_]+)-(\d{4})$/.exec(v);
  const season = seasonName.safeParse(m?.[1]);
  const y = year.safeParse(m?.[2]);
  if (season.success && y.success) return { season: season.data, year: y.data };
  ctx.addIssue({ code: 'custom', message: 'Unknown start' });
  return z.NEVER;
});

/** Whole dollars per unit, 1 up to the slider's maximum. */
const payParam = z.string().transform((v, ctx): NonNullable<DiscoveryQuery['pay']> => {
  const m = /^(\d{1,6})-(hour|day|year)$/.exec(v);
  const dollars = m ? Number(m[1]) : 0;
  const unit = m?.[2] as PayUnit | undefined;
  if (!unit || dollars < 1 || dollars > PAY_RANGES[unit].max) {
    ctx.addIssue({ code: 'custom', message: 'Unknown pay' });
    return z.NEVER;
  }
  return { minCents: dollars * 100, unit };
});

/** The first `max` distinct values of a comma list that pass `item`. */
function list<T>(raw: string | null, item: z.ZodType<T>, max = LIST_MAX): T[] | undefined {
  if (raw === null) return undefined;
  const out: T[] = [];
  for (const part of raw.split(',')) {
    const r = item.safeParse(part.trim());
    if (r.success && !out.includes(r.data)) out.push(r.data);
    if (out.length === max) break;
  }
  return out.length > 0 ? out : undefined;
}

/** One param, or undefined when it is missing or fails. */
function one<T>(p: URLSearchParams, key: string, schema: z.ZodType<T>): T | undefined {
  const raw = p.get(key);
  if (raw === null) return undefined;
  const r = schema.safeParse(raw);
  return r.success ? r.data : undefined;
}

/** Every value of a repeated list param, joined. */
function joined(p: URLSearchParams, key: string): string | null {
  const all = p.getAll(key);
  return all.length > 0 ? all.join(',') : null;
}

/** Drops the keys whose value is undefined. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

export function parseQuery(p: URLSearchParams): {
  query: DiscoveryQuery;
  sort: DiscoverySort;
  hostSlug?: string;
} {
  const query: DiscoveryQuery = compact({
    q: one(p, 'q', qText),
    categories: list(joined(p, 'cat'), category),
    genres: list(joined(p, 'genre'), slug),
    states: list(
      joined(p, 'state'),
      z
        .string()
        .transform((c) => c.toUpperCase())
        .pipe(stateCode),
    ),
    destination: one(p, 'dest', slug),
    start: one(p, 'start', startParam),
    startingSoon: one(p, 'soon', flag) ? true : undefined,
    housing: one(p, 'housing', amenity),
    meals: one(p, 'meals', amenity),
    sponsorsVisas: one(p, 'visa', flag) ? true : undefined,
    pay: one(p, 'pay', payParam),
  });
  const hostSlug = one(p, 'host', slug);
  const sort = one(p, 'sort', sortParam) ?? 'relevant';
  return hostSlug ? { query, sort, hostSlug } : { query, sort };
}

const startToParam = (s: NonNullable<DiscoveryQuery['start']>) =>
  'withinMonths' in s ? `${s.withinMonths}m` : `${s.season}-${s.year}`;

export function serializeQuery(
  q: DiscoveryQuery,
  sort: DiscoverySort,
  opts?: { hostSlug?: string },
): URLSearchParams {
  const out = new URLSearchParams();
  const put = (key: string, value: string | undefined) => {
    if (value) out.set(key, value);
  };
  const csv = (values: string[] | undefined) => (values?.length ? values.join(',') : undefined);
  put('q', q.q);
  put('cat', csv(q.categories));
  put('genre', csv(q.genres));
  put('state', csv(q.states));
  put('dest', q.destination);
  put('host', opts?.hostSlug);
  put('start', q.start ? startToParam(q.start) : undefined);
  put('soon', q.startingSoon ? '1' : undefined);
  put('housing', q.housing);
  put('meals', q.meals);
  put('visa', q.sponsorsVisas ? '1' : undefined);
  put('pay', q.pay ? `${Math.round(q.pay.minCents / 100)}-${q.pay.unit}` : undefined);
  put('sort', sort === 'relevant' ? undefined : sort);
  return out;
}

/** A JSON value with object keys sorted and arrays sorted and deduplicated. */
function sortedValue(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = new Set(v.map((x) => JSON.stringify(sortedValue(x))));
    return [...items].sort().map((s) => JSON.parse(s) as unknown);
  }
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortedValue(o[k])]),
    );
  }
  return v;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && v.length === 0);

/** Sorted keys and arrays, without bbox, locationId, sort, cursor or empty values. */
export function canonicalQuery(q: DiscoveryQuery): string {
  const kept = Object.fromEntries(
    Object.entries(q).filter(([k, v]) => k !== 'bbox' && k !== 'locationId' && !isEmpty(v)),
  );
  return JSON.stringify(sortedValue(kept));
}

/** "ski-resorts" -> "Ski resorts", for a slug without a label. */
function humanize(s: string): string {
  const words = s.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function startLabel(s: NonNullable<DiscoveryQuery['start']>): string {
  if ('withinMonths' in s) {
    return `Within ${s.withinMonths} month${s.withinMonths === 1 ? '' : 's'}`;
  }
  return seasonLabel(s.season, s.year);
}

/** "$20+/hr", "$150+/day" or "$40k+/yr". */
function payLabel(p: NonNullable<DiscoveryQuery['pay']>): string {
  const dollars = p.minCents / 100;
  const amount =
    p.unit === 'year' && dollars >= 1000
      ? `${(dollars / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })}k`
      : dollars.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return `$${amount}+${PAY_SUFFIX[p.unit]}`;
}

export function describeFilters(q: DiscoveryQuery, labels: QueryLabels): FilterChip[] {
  const chips: FilterChip[] = [];
  if (q.q) chips.push({ key: 'q', label: `"${q.q}"` });
  for (const c of q.categories ?? []) chips.push({ key: `cat:${c}`, label: CATEGORY_LABELS[c] });
  for (const g of q.genres ?? []) {
    chips.push({ key: `genre:${g}`, label: labels.genres[g] ?? humanize(g) });
  }
  for (const s of q.states ?? []) chips.push({ key: `state:${s}`, label: s });
  if (q.destination) {
    chips.push({
      key: 'dest',
      label: labels.destinations[q.destination] ?? humanize(q.destination),
    });
  }
  if (q.orgId) {
    chips.push({
      key: 'host',
      label: labels.host?.orgId === q.orgId ? labels.host.name : 'This employer',
    });
  }
  if (q.start) chips.push({ key: 'start', label: startLabel(q.start) });
  if (q.startingSoon) chips.push({ key: 'soon', label: 'Starting soon' });
  if (q.housing) {
    chips.push({
      key: 'housing',
      label: q.housing === 'free' ? 'Free housing' : 'Housing provided',
    });
  }
  if (q.meals) {
    chips.push({ key: 'meals', label: q.meals === 'free' ? 'Free meals' : 'Meals provided' });
  }
  if (q.sponsorsVisas) chips.push({ key: 'visa', label: 'Sponsors visas' });
  if (q.pay) chips.push({ key: 'pay', label: payLabel(q.pay) });
  return chips;
}

const SCALAR_KEYS: Record<string, keyof DiscoveryQuery> = {
  q: 'q',
  dest: 'destination',
  host: 'orgId',
  start: 'start',
  soon: 'startingSoon',
  housing: 'housing',
  meals: 'meals',
  visa: 'sponsorsVisas',
  pay: 'pay',
};

const LIST_KEYS: Record<string, 'categories' | 'genres' | 'states'> = {
  cat: 'categories',
  genre: 'genres',
  state: 'states',
};

/** The query without the chip `key` names ('state:CO', 'pay', ...). Never mutates `q`. */
export function removeFilter(q: DiscoveryQuery, key: string): DiscoveryQuery {
  const without = (field: keyof DiscoveryQuery): DiscoveryQuery =>
    Object.fromEntries(Object.entries(q).filter(([k]) => k !== field)) as DiscoveryQuery;
  const scalar = SCALAR_KEYS[key];
  if (scalar) return without(scalar);
  const colon = key.indexOf(':');
  const field = colon > 0 ? LIST_KEYS[key.slice(0, colon)] : undefined;
  if (!field) return { ...q };
  const value = key.slice(colon + 1);
  const rest = (q[field] as string[] | undefined)?.filter((v) => v !== value) ?? [];
  return rest.length > 0 ? { ...q, [field]: rest } : without(field);
}

/** The chip labels joined with " · ", cut to `maxLen` with "…"; "All jobs" when empty. */
export function summarizeQuery(q: DiscoveryQuery, labels: QueryLabels, maxLen = 80): string {
  const chips = describeFilters(q, labels);
  if (chips.length === 0) return 'All jobs';
  const summary = chips.map((c) => c.label).join(' · ');
  return summary.length > maxLen ? `${summary.slice(0, maxLen - 1)}…` : summary;
}

// JSON bodies --------------------------------------------------------------------------------

const lng = z.number().min(-180).max(180);
const lat = z.number().min(-90).max(90);

const paySchema = z
  .object({ minCents: z.number().int().positive(), unit: z.enum(PAY_UNITS) })
  .strict()
  .refine((p) => p.minCents % 100 === 0 && p.minCents <= PAY_RANGES[p.unit].max * 100, {
    message: 'Pay is whole dollars within the slider range',
  });

const startSchema = z.union([
  z.object({ withinMonths: z.union([z.literal(1), z.literal(3), z.literal(6)]) }).strict(),
  z.object({ season: seasonName, year: z.number().int().min(YEAR_MIN).max(YEAR_MAX) }).strict(),
]);

const stateCodes = US_STATES.map((s) => s.code) as [string, ...string[]];

/** The same bounds as parseQuery, strictly, for JSON bodies. */
export const discoveryQuerySchema: z.ZodType<DiscoveryQuery> = z
  .object({
    q: qText.optional(),
    categories: z.array(category).max(LIST_MAX).optional(),
    genres: z.array(slug).max(LIST_MAX).optional(),
    states: z.array(z.enum(stateCodes)).max(LIST_MAX).optional(),
    destination: slug.optional(),
    orgId: z.uuid().optional(),
    start: startSchema.optional(),
    startingSoon: z.boolean().optional(),
    housing: amenity.optional(),
    meals: amenity.optional(),
    sponsorsVisas: z.boolean().optional(),
    pay: paySchema.optional(),
    bbox: z.tuple([lng, lat, lng, lat]).optional(),
    locationId: z.uuid().optional(),
  })
  .strict();
