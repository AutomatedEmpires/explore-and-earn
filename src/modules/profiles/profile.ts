// The seeker's own profile, its snapshot, community identities and preference targets (SP4 spec 3.2).
import { eq, inArray, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import type { Category } from '@/lib/taxonomy';
import {
  missingItem,
  profilePatchSchema,
  regionFits,
  type CommunityIdentity,
  type OwnProfileDto,
  type PreferenceTargets,
  type ProfilePatch,
  type ProfileSnapshotV1,
  type VisaType,
  type WorkAuthorization,
} from '@/lib/profiles';
import { record } from '@/modules/audit';
import { getUserContacts } from '@/modules/identity';
import { listOccupations } from '@/modules/listings';
import { getMedia } from '@/modules/media';
import {
  seekerCertifications,
  seekerEducation,
  seekerExperiences,
  seekerProfiles,
  seekerSkills,
} from './schema';

type ProfileRow = typeof seekerProfiles.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

function trimCode(code: string): string {
  return code.trim();
}

function monthOf(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  return value.slice(0, 7);
}

function dayOf(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function workAuthorization(row: ProfileRow): WorkAuthorization | null {
  if (row.workAuthStatus === 'authorized') return { status: 'authorized' };
  if (row.workAuthStatus === 'needs_sponsorship') {
    return { status: 'needs_sponsorship', visaTypes: row.workAuthVisaTypes as VisaType[] };
  }
  if (row.workAuthStatus === 'has_visa') {
    const visaType = row.workAuthVisaTypes[0];
    const endsOn = dayOf(row.workAuthVisaEnd);
    if (!visaType || !endsOn) return null;
    return { status: 'has_visa', visaType: visaType as VisaType, endsOn };
  }
  return null;
}

function authColumns(auth: WorkAuthorization | null): Pick<
  ProfileRow,
  'workAuthStatus' | 'workAuthVisaTypes' | 'workAuthVisaEnd'
> {
  if (!auth) return { workAuthStatus: null, workAuthVisaTypes: [], workAuthVisaEnd: null };
  if (auth.status === 'authorized') {
    return { workAuthStatus: 'authorized', workAuthVisaTypes: [], workAuthVisaEnd: null };
  }
  if (auth.status === 'needs_sponsorship') {
    return {
      workAuthStatus: 'needs_sponsorship',
      workAuthVisaTypes: auth.visaTypes,
      workAuthVisaEnd: null,
    };
  }
  return {
    workAuthStatus: 'has_visa',
    workAuthVisaTypes: [auth.visaType],
    workAuthVisaEnd: auth.endsOn,
  };
}

async function loadRow(db: DbOrTx, userId: string): Promise<ProfileRow | null> {
  const [row] = await db
    .select()
    .from(seekerProfiles)
    .where(eq(seekerProfiles.userId, userId))
    .limit(1);
  return row ?? null;
}

async function loadEntries(db: DbOrTx, userId: string) {
  const [experience, education, skills, certifications] = await Promise.all([
    db
      .select()
      .from(seekerExperiences)
      .where(eq(seekerExperiences.userId, userId))
      .orderBy(seekerExperiences.sortOrder),
    db
      .select()
      .from(seekerEducation)
      .where(eq(seekerEducation.userId, userId))
      .orderBy(seekerEducation.sortOrder),
    db
      .select()
      .from(seekerSkills)
      .where(eq(seekerSkills.userId, userId))
      .orderBy(sql`${seekerSkills.highlightRank} asc nulls last`, seekerSkills.sortOrder),
    db
      .select()
      .from(seekerCertifications)
      .where(eq(seekerCertifications.userId, userId))
      .orderBy(seekerCertifications.sortOrder),
  ]);
  return { experience, education, skills, certifications };
}

function toDto(
  row: ProfileRow | null,
  email: string | null,
  entries: Awaited<ReturnType<typeof loadEntries>> | null,
  now: Date,
): OwnProfileDto {
  const visibleToHosts = row?.visibleToHosts ?? true;
  const availability =
    row?.availDate && row.availConfirmedAt
      ? { date: dayOf(row.availDate) ?? '', confirmedAt: row.availConfirmedAt.toISOString() }
      : null;
  const auth = row ? workAuthorization(row) : null;
  const categories = (row?.prefCategories ?? []) as Category[];
  const occupations = row?.prefOccupations ?? [];
  const missing = missingItem(
    {
      visibleToHosts,
      firstName: row?.firstName ?? '',
      lastName: row?.lastName ?? '',
      city: row?.city ?? '',
      region: row?.region ?? null,
      countryCode: trimCode(row?.countryCode ?? 'US'),
      availability,
      categories,
      occupations,
      workAuthorization: auth,
    },
    now,
  );
  const removed = row?.removedByModerationAt != null;
  return {
    identity: {
      firstName: row?.firstName ?? '',
      lastName: row?.lastName ?? '',
      headline: row?.headline ?? '',
      bio: row?.bio ?? '',
      city: row?.city ?? '',
      region: row?.region ?? null,
      countryCode: trimCode(row?.countryCode ?? 'US'),
      phone: row?.phone ?? null,
      email,
      avatarMediaId: row?.avatarMediaId ?? null,
      coverMediaId: row?.coverMediaId ?? null,
    },
    preferences: {
      categories,
      occupations,
      states: row?.prefStates ?? [],
      minPay:
        row?.prefMinPayCents != null && row.prefMinPayUnit
          ? { cents: row.prefMinPayCents, unit: row.prefMinPayUnit }
          : null,
      housing: row?.prefHousing ?? false,
      meals: row?.prefMeals ?? false,
      willingToRelocate: row?.willingToRelocate ?? true,
    },
    workAuthorization: auth,
    visibility: {
      visibleToHosts,
      showPhotoToHosts: row?.showPhotoToHosts ?? false,
    },
    resume: { mode: row?.resumeMode ?? 'classic' },
    languages: row?.languages ?? [],
    portfolioLinks: row?.portfolioLinks ?? [],
    aiImportConsent:
      row?.aiImportConsentVersion && row.aiImportConsentAt
        ? { version: row.aiImportConsentVersion, at: row.aiImportConsentAt.toISOString() }
        : null,
    experience: (entries?.experience ?? []).map((e) => ({
      id: e.id,
      employer: e.employer,
      title: e.title,
      location: e.location,
      startMonth: monthOf(e.startMonth) ?? '',
      endMonth: monthOf(e.endMonth),
      isCurrent: e.isCurrent,
      description: e.description,
      provenance: e.provenance,
    })),
    education: (entries?.education ?? []).map((e) => ({
      id: e.id,
      school: e.school,
      program: e.program,
      startMonth: monthOf(e.startMonth),
      endMonth: monthOf(e.endMonth),
      provenance: e.provenance,
    })),
    certifications: (entries?.certifications ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      issuer: e.issuer,
      issuedOn: dayOf(e.issuedOn),
      expiresOn: dayOf(e.expiresOn),
      provenance: e.provenance,
    })),
    skills: (entries?.skills ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      key: s.skillKey,
      highlighted: s.highlightRank != null,
    })),
    availability: availability
      ? {
          preset: row?.availPreset ?? 'exact',
          date: availability.date,
          confirmedAt: availability.confirmedAt,
          confirmedDaysAgo: Math.max(
            0,
            Math.floor((now.getTime() - new Date(availability.confirmedAt).getTime()) / DAY_MS),
          ),
        }
      : null,
    missingItem: missing,
    poolEligible: visibleToHosts && !removed && missing === null,
    removedByModeration: removed,
    version: row?.version ?? 0,
  };
}

async function emailOf(db: DbOrTx, userId: string): Promise<string | null> {
  const contacts = await getUserContacts(db, [userId]);
  return contacts.get(userId)?.email ?? null;
}

/** The owner's view, with defaults before the first write (version 0). */
export async function getOwnProfile(db: DbOrTx, userId: string, now = new Date()): Promise<OwnProfileDto> {
  const [row, email, entries] = await Promise.all([
    loadRow(db, userId),
    emailOf(db, userId),
    loadEntries(db, userId),
  ]);
  return toDto(row, email, entries, now);
}

async function assertMedia(
  db: DbOrTx,
  userId: string,
  id: string | null | undefined,
  kind: 'avatar' | 'cover',
): Promise<void> {
  if (!id) return;
  const media = await getMedia(db, id);
  if (!media || media.ownerUserId !== userId || media.kind !== kind) {
    throw badRequest('That file cannot be used here', { reason: 'invalid_media' });
  }
  if (media.status === 'rejected' || media.status === 'blocked') {
    throw badRequest('That file cannot be used here', { reason: 'invalid_media' });
  }
}

/** Applies a patch, creating the row on first use. Field names in the audit are sorted. */
export async function updateProfile(db: Db, userId: string, patch: ProfilePatch): Promise<OwnProfileDto> {
  const parsed = profilePatchSchema.parse(patch);
  const current = await loadRow(db, userId);
  const country = parsed.identity?.countryCode ?? trimCode(current?.countryCode ?? 'US');
  const region =
    parsed.identity && 'region' in parsed.identity ? parsed.identity.region ?? null : current?.region ?? null;
  if (!regionFits(country, region ?? null)) {
    throw badRequest('Use a region that fits the country', { reason: 'region' });
  }
  if (parsed.preferences?.occupations) {
    const known = new Set((await listOccupations(db)).map((o) => o.code));
    if (parsed.preferences.occupations.some((code) => !known.has(code))) {
      throw badRequest('Unknown occupation', { reason: 'unknown_occupation' });
    }
  }
  await assertMedia(db, userId, parsed.identity?.avatarMediaId, 'avatar');
  await assertMedia(db, userId, parsed.identity?.coverMediaId, 'cover');

  const fields: string[] = [];
  const set: Partial<ProfileRow> = {};
  if (parsed.identity) {
    for (const [key, value] of Object.entries(parsed.identity)) {
      fields.push(key);
      Object.assign(set, { [key]: value });
    }
  }
  if (parsed.preferences) {
    if (parsed.preferences.categories) {
      fields.push('categories');
      set.prefCategories = parsed.preferences.categories;
    }
    if (parsed.preferences.occupations) {
      fields.push('occupations');
      set.prefOccupations = parsed.preferences.occupations;
    }
    if (parsed.preferences.states) {
      fields.push('states');
      set.prefStates = parsed.preferences.states;
    }
    if (parsed.preferences.minPay !== undefined) {
      fields.push('minPay');
      set.prefMinPayCents = parsed.preferences.minPay?.cents ?? null;
      set.prefMinPayUnit = parsed.preferences.minPay?.unit ?? null;
    }
    if (parsed.preferences.housing !== undefined) {
      fields.push('housing');
      set.prefHousing = parsed.preferences.housing;
    }
    if (parsed.preferences.meals !== undefined) {
      fields.push('meals');
      set.prefMeals = parsed.preferences.meals;
    }
    if (parsed.preferences.willingToRelocate !== undefined) {
      fields.push('willingToRelocate');
      set.willingToRelocate = parsed.preferences.willingToRelocate;
    }
  }
  if (parsed.workAuthorization !== undefined) {
    fields.push('workAuthorization');
    Object.assign(set, authColumns(parsed.workAuthorization));
  }
  let visibilityChange = false;
  if (parsed.visibility?.visibleToHosts !== undefined) {
    visibilityChange = true;
    set.visibleToHosts = parsed.visibility.visibleToHosts;
  }
  if (parsed.visibility?.showPhotoToHosts !== undefined) {
    fields.push('showPhotoToHosts');
    set.showPhotoToHosts = parsed.visibility.showPhotoToHosts;
  }
  if (parsed.resume) {
    fields.push('resume');
    set.resumeMode = parsed.resume.mode;
  }
  if (parsed.languages) {
    fields.push('languages');
    set.languages = parsed.languages;
  }
  if (parsed.portfolioLinks) {
    fields.push('portfolioLinks');
    set.portfolioLinks = parsed.portfolioLinks;
  }

  await db.transaction(async (tx) => {
    if (!current) {
      await tx.insert(seekerProfiles).values({ userId, version: 1, ...set });
    } else {
      await tx
        .update(seekerProfiles)
        .set({ ...set, version: sql`${seekerProfiles.version} + 1` })
        .where(eq(seekerProfiles.userId, userId));
    }
    const updated = fields.filter((field) => field !== 'visibleToHosts').sort();
    if (updated.length > 0) {
      await record(tx, {
        actorType: 'user',
        actorId: userId,
        action: 'profiles.updated',
        subjectType: 'seeker_profile',
        subjectId: userId,
        data: { fields: updated },
      });
    }
    if (visibilityChange) {
      await record(tx, {
        actorType: 'user',
        actorId: userId,
        action: 'profiles.visibility_changed',
        subjectType: 'seeker_profile',
        subjectId: userId,
        data: { fields: ['visibleToHosts'] },
      });
    }
  });
  return getOwnProfile(db, userId);
}

/** Creates the profile row when a child write is the first one, and audits `profiles.updated`. */
export async function bumpProfile(db: DbOrTx, userId: string, section: string): Promise<void> {
  const current = await loadRow(db, userId);
  if (!current) {
    await db.insert(seekerProfiles).values({ userId, version: 1 });
  } else {
    await db
      .update(seekerProfiles)
      .set({ version: sql`${seekerProfiles.version} + 1` })
      .where(eq(seekerProfiles.userId, userId));
  }
  await record(db, {
    actorType: 'user',
    actorId: userId,
    action: 'profiles.updated',
    subjectType: 'seeker_profile',
    subjectId: userId,
    data: { fields: [section] },
  });
}

/** The live profile as a snapshot; workAuthorization only for applications. */
export async function buildProfileSnapshot(
  db: DbOrTx,
  userId: string,
  o: { includeWorkAuthorization: boolean },
): Promise<ProfileSnapshotV1> {
  const view = await getOwnProfile(db, userId);
  return {
    firstName: view.identity.firstName,
    lastName: view.identity.lastName,
    email: view.identity.email ?? '',
    phone: view.identity.phone,
    city: view.identity.city,
    region: view.identity.region,
    countryCode: view.identity.countryCode,
    headline: view.identity.headline,
    bio: view.identity.bio,
    avatarMediaId: view.visibility.showPhotoToHosts ? view.identity.avatarMediaId : null,
    coverMediaId: view.identity.coverMediaId,
    availability: view.availability
      ? { date: view.availability.date, confirmedAt: view.availability.confirmedAt }
      : null,
    workAuthorization: o.includeWorkAuthorization ? view.workAuthorization : null,
    experience: view.experience.map(({ employer, title, location, startMonth, endMonth, isCurrent, description }) => ({
      employer,
      title,
      location,
      startMonth,
      endMonth,
      isCurrent,
      description,
    })),
    education: view.education.map(({ school, program, startMonth, endMonth }) => ({
      school,
      program,
      startMonth,
      endMonth,
    })),
    skills: view.skills.map(({ label, highlighted }) => ({ label, highlighted })),
    certifications: view.certifications.map(({ name, issuer, issuedOn, expiresOn }) => ({
      name,
      issuer,
      issuedOn,
      expiresOn,
    })),
    languages: view.languages,
    portfolioLinks: view.portfolioLinks,
  };
}

/** SP7's community names (the full profile name) and avatars, by user id. */
export async function getCommunityIdentities(
  db: DbOrTx,
  userIds: string[],
): Promise<Map<string, CommunityIdentity>> {
  const out = new Map<string, CommunityIdentity>();
  if (userIds.length === 0) return out;
  const rows = await db
    .select({
      userId: seekerProfiles.userId,
      firstName: seekerProfiles.firstName,
      lastName: seekerProfiles.lastName,
      avatarMediaId: seekerProfiles.avatarMediaId,
    })
    .from(seekerProfiles)
    .where(inArray(seekerProfiles.userId, userIds));
  for (const row of rows) {
    if (row.firstName.trim() === '') continue;
    const last = row.lastName.trim();
    out.set(row.userId, {
      displayName: `${row.firstName.trim()} ${last}`.trim(),
      firstName: row.firstName.trim(),
      lastInitial: last.slice(0, 1),
      avatarMediaId: row.avatarMediaId,
    });
  }
  return out;
}

/** For SP6 feed targeting only. */
export async function getPreferenceTargets(db: DbOrTx, userId: string): Promise<PreferenceTargets> {
  const row = await loadRow(db, userId);
  return { categories: (row?.prefCategories ?? []) as Category[], states: row?.prefStates ?? [] };
}

/** Whether the Profile tab shows its dot (a missing item while visible to hosts). */
export async function needsAttention(db: DbOrTx, userId: string): Promise<boolean> {
  const row = await loadRow(db, userId);
  if (!row) return false;
  const view = await getOwnProfile(db, userId);
  return view.visibility.visibleToHosts && view.missingItem !== null;
}
