// Automatic checks before publishing (spec sections 8.2 and 8.3 step 1). Blocking issues stop a
// publish; warnings need the host's acknowledgement (by `ackKey`). Issue codes are fixed (Plan
// decision 8).
import { and, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { FEDERAL_MIN_WAGE_CENTS } from '@/lib/min-wage';
import { isUSStateCode } from '@/lib/us-states';
import { getCapacity } from '@/modules/entitlements';
import { getLocations, type Location } from '@/modules/locations';
import { getMediaInfo, type MediaKind } from '@/modules/media';
import { getSetting } from '@/modules/settings';
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
] as const;
export const WARNING_CODES = ['pay_below_min_wage', 'photo_slot_mismatch'] as const;

export type IssueCode = (typeof BLOCKING_CODES)[number] | (typeof WARNING_CODES)[number];
export type Issue = { code: IssueCode; section: BuilderSection; field: string; message: string };

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
} as const;

const SLOT_LABELS: Record<string, string> = {
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
 * Text as phrases are matched: NFKC, lowercase, periods removed, every whitespace run
 * (non-breaking spaces included) collapsed to one space, trimmed.
 */
export function normalizeForPhraseMatch(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A matcher for each phrase that needs a word boundary on both sides. */
function phraseMatchers(phrases: string[]): { phrase: string; re: RegExp }[] {
  return phrases
    .map((phrase) => ({ phrase, norm: normalizeForPhraseMatch(phrase) }))
    .filter((p) => p.norm !== '')
    .map(({ phrase, norm }) => ({
      phrase,
      re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(norm)}(?![\\p{L}\\p{N}])`, 'u'),
    }));
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

const issue = (code: IssueCode, field: string, message: string): Issue => ({
  code,
  section: sectionOfPath(field),
  field,
  message,
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

  const [phrases, ratio, minWages, genres, blocked, shorteners] = await Promise.all([
    getSetting(db, 'listings.prohibited_phrases'),
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
  const matchers = phraseMatchers(phrases);
  for (const { path, text } of textFields(draft)) {
    const norm = normalizeForPhraseMatch(text);
    const hit = matchers.find((m) => m.re.test(norm));
    if (hit) {
      errors.push(
        issue(
          'prohibited_wording',
          path,
          `Remove "${hit.phrase}". You can ask about visa sponsorship instead.`,
        ),
      );
    }
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
