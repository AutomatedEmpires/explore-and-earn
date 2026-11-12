// Builds the frozen ApplicationSnapshotV1 at submit (SP4 spec 8.4 steps 6, 7 and 10): the
// listing facts, the seeker's profile, their checked answers and the resume template.
//
// Minimum data (legal review 2.2 item 4 and 4.2, P0 item 12): a host learns two things about
// work authorization, "authorized to work in the US" and "will need visa sponsorship". The
// profile's visa type and end date are never frozen into the shared record and never returned
// by a host read: `hostWorkAuthorization` reduces the stored value to those two answers.
import type { DbOrTx } from '@/lib/db';
import {
  APPLICATION_LIMITS,
  type ApplicationSnapshotV1,
  type MissingField,
  type SubmitInput,
} from '@/lib/applications';
import { seasonWindow } from '@/lib/discovery';
import type {
  ProfileSnapshotV1,
  ResumeMode,
  ResumeTemplate,
  WorkAuthorization,
} from '@/lib/profiles';
import { getHostIdentities } from '@/modules/hostpages';
import type { ListingContent, PublishedListing, ScreeningQuestion } from '@/modules/listings';
import { getLocations } from '@/modules/locations';

type ListingFacts = ApplicationSnapshotV1['listing'];
type SnapshotAnswer = ApplicationSnapshotV1['answers'][number];

const TEMPLATES: Record<ResumeMode, ResumeTemplate> = {
  classic: 'classic@1',
  compact: 'compact@1',
};

/**
 * Work authorization as a host may see it: authorized or not, and whether sponsorship is
 * needed. `has_visa` reads as authorized; the visa type and its end date stay with the seeker.
 * `needs_sponsorship` keeps its shape with the one neutral visa type, so no specific visa is
 * disclosed.
 */
export function hostWorkAuthorization(wa: WorkAuthorization | null): WorkAuthorization | null {
  if (!wa) return null;
  if (wa.status === 'needs_sponsorship')
    return { status: 'needs_sponsorship', visaTypes: ['other'] };
  return { status: 'authorized' };
}

/** The profile as an application carries it: everything, with work authorization reduced. */
export function minimizeProfile(profile: ProfileSnapshotV1): ProfileSnapshotV1 {
  return { ...profile, workAuthorization: hostWorkAuthorization(profile.workAuthorization) };
}

/** A snapshot as a host read returns it. Covers a snapshot stored before the reduction. */
export function hostView(snapshot: ApplicationSnapshotV1): ApplicationSnapshotV1 {
  return { ...snapshot, profile: minimizeProfile(snapshot.profile) };
}

/** The profile fields an application needs (spec 8.4 step 6). Availability is not one. */
export function missingFields(profile: ProfileSnapshotV1): MissingField[] {
  const missing: MissingField[] = [];
  if (profile.firstName.trim() === '') missing.push('first_name');
  if (profile.lastName.trim() === '') missing.push('last_name');
  if (profile.city.trim() === '') missing.push('city');
  if (profile.countryCode === 'US' && !profile.region?.trim()) missing.push('region');
  if (!profile.workAuthorization) missing.push('work_authorization');
  return missing;
}

/** "Juneau, AK" on site; "Remote (US)" or "Remote (WA, OR)" for remote work. */
async function locationLabel(db: DbOrTx, where: ListingContent['where']): Promise<string> {
  if (where.mode === 'remote') {
    return where.scope === 'all_us' ? 'Remote (US)' : `Remote (${where.states.join(', ')})`;
  }
  const location = (await getLocations(db, [where.locationId])).get(where.locationId);
  return location ? `${location.city}, ${location.state}` : '';
}

/** The listing's first and last day: fixed dates, the season's window, or an ongoing start. */
export function listingDates(when: ListingContent['when']): {
  startDate: string | null;
  endDate: string | null;
} {
  const d = when.dates;
  if (d.mode === 'fixed') return { startDate: d.start, endDate: d.end };
  if (d.mode === 'ongoing') return { startDate: d.start, endDate: null };
  const window = seasonWindow(d.season, d.year);
  return { startDate: window?.from ?? null, endDate: window?.to ?? null };
}

/** The listing as the snapshot freezes it, from one published revision. */
export async function loadListingFacts(
  db: DbOrTx,
  published: PublishedListing,
): Promise<ListingFacts> {
  const { content } = published;
  const host = (await getHostIdentities(db, [published.orgId])).get(published.orgId);
  const step = content.applying.additionalStep;
  return {
    id: published.listingId,
    revisionId: published.revisionId,
    title: content.basics.title,
    orgId: published.orgId,
    orgName: host?.name ?? '',
    orgLogoMediaId: host?.logoMediaId ?? null,
    locationLabel: await locationLabel(db, content.where),
    ...listingDates(content.when),
    visaSponsorship: content.job.visaSponsorship,
    additionalStep: step ? { note: step.note, url: step.url } : null,
  };
}

function checkedValue(
  q: ScreeningQuestion,
  value: SubmitInput['answers'][number]['value'] | undefined,
): { ok: true; value: SnapshotAnswer['value'] } | { ok: false } {
  const empty =
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);
  if (empty) return q.required ? { ok: false } : { ok: true, value: null };

  if (q.type === 'yes_no') {
    return typeof value === 'boolean' ? { ok: true, value } : { ok: false };
  }
  if (q.type === 'short_answer') {
    if (typeof value !== 'string') return { ok: false };
    const text = value.trim();
    return text.length <= APPLICATION_LIMITS.shortAnswerMax
      ? { ok: true, value: text }
      : { ok: false };
  }
  if (q.allowMultiple) {
    if (!Array.isArray(value)) return { ok: false };
    const distinct = new Set(value).size === value.length;
    return distinct && value.every((v) => q.choices.includes(v))
      ? { ok: true, value: [...value] }
      : { ok: false };
  }
  return typeof value === 'string' && q.choices.includes(value)
    ? { ok: true, value }
    : { ok: false };
}

/**
 * Checks the answers against the listing's questions (spec 8.4 step 7): at most one per
 * question and none for an unknown question; a required one is not empty; `yes_no` is a
 * boolean; `multiple_choice` is one of the choices, or a set of them with `allowMultiple`; a
 * short answer is at most 1000 characters. An optional question left out is stored as null.
 */
export function checkAnswers(
  questions: readonly ScreeningQuestion[],
  answers: SubmitInput['answers'],
): { ok: true; answers: SnapshotAnswer[] } | { ok: false; questionIds: string[] } {
  const known = new Set(questions.map((q) => q.id));
  const given = new Map<string, SubmitInput['answers'][number]['value']>();
  const bad = new Set<string>();
  for (const a of answers) {
    if (!known.has(a.questionId) || given.has(a.questionId)) bad.add(a.questionId);
    given.set(a.questionId, a.value);
  }
  const out: SnapshotAnswer[] = [];
  for (const q of questions) {
    const checked = checkedValue(q, given.get(q.id));
    if (!checked.ok) {
      bad.add(q.id);
      continue;
    }
    out.push({
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      required: q.required,
      value: checked.value,
    });
  }
  return bad.size > 0 ? { ok: false, questionIds: [...bad] } : { ok: true, answers: out };
}

export function buildSnapshot(i: {
  listing: ListingFacts;
  profile: ProfileSnapshotV1;
  answers: SnapshotAnswer[];
  resumeMode: ResumeMode;
  sponsorshipMismatchAcknowledged: boolean;
}): ApplicationSnapshotV1 {
  return {
    v: 1,
    listing: i.listing,
    profile: minimizeProfile(i.profile),
    answers: i.answers,
    resume: { mode: i.resumeMode, template: TEMPLATES[i.resumeMode] },
    sponsorshipMismatchAcknowledged: i.sponsorshipMismatchAcknowledged,
  };
}

/**
 * The byte length of the snapshot as Postgres renders jsonb text (`": "` and `", "`
 * separators), which is what the table's 262144-byte CHECK measures.
 */
export function snapshotBytes(value: unknown): number {
  if (value === null || typeof value !== 'object') {
    return Buffer.byteLength(JSON.stringify(value ?? null));
  }
  if (Array.isArray(value)) {
    let n = 2 + Math.max(0, value.length - 1) * 2;
    for (const item of value) n += snapshotBytes(item);
    return n;
  }
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  let n = 2 + Math.max(0, entries.length - 1) * 2;
  for (const [key, item] of entries) {
    n += Buffer.byteLength(JSON.stringify(key)) + 2 + snapshotBytes(item);
  }
  return n;
}
