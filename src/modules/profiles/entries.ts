// Experience, education and certification entries, and skills (SP4 spec 4.1 and 5).
import { and, eq, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import {
  PROFILE_CAPS,
  certificationFieldsSchema,
  educationFieldsSchema,
  experienceFieldsSchema,
  type CertificationEntry,
  type EducationEntry,
  type EntrySection,
  type ExperienceEntry,
  type Skill,
} from '@/lib/profiles';
import { normalizeSkill } from '@/modules/listings';
import { bumpProfile } from './profile';
import { seekerCertifications, seekerEducation, seekerExperiences, seekerSkills } from './schema';

type Entry = ExperienceEntry | EducationEntry | CertificationEntry;

function monthDate(month: string | null | undefined): string | null {
  if (!month) return null;
  return `${month}-01`;
}

function monthOf(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 7);
  return String(value).slice(0, 7);
}

function dayOf(value: string | Date | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function certKey(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
}

const tables = {
  experience: seekerExperiences,
  education: seekerEducation,
  certifications: seekerCertifications,
} as const;

async function countOf(db: DbOrTx, userId: string, section: EntrySection): Promise<number> {
  const table = tables[section];
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(table)
    .where(eq(table.userId, userId));
  return row?.n ?? 0;
}

function toExperience(row: typeof seekerExperiences.$inferSelect): ExperienceEntry {
  return {
    id: row.id,
    employer: row.employer,
    title: row.title,
    location: row.location,
    startMonth: monthOf(row.startMonth) ?? '',
    endMonth: monthOf(row.endMonth),
    isCurrent: row.isCurrent,
    description: row.description,
    provenance: row.provenance,
  };
}

function toEducation(row: typeof seekerEducation.$inferSelect): EducationEntry {
  return {
    id: row.id,
    school: row.school,
    program: row.program,
    startMonth: monthOf(row.startMonth),
    endMonth: monthOf(row.endMonth),
    provenance: row.provenance,
  };
}

function toCertification(row: typeof seekerCertifications.$inferSelect): CertificationEntry {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    issuedOn: dayOf(row.issuedOn),
    expiresOn: dayOf(row.expiresOn),
    provenance: row.provenance,
  };
}

export async function addEntry(
  db: Db,
  userId: string,
  section: EntrySection,
  fields: unknown,
): Promise<Entry> {
  const cap = PROFILE_CAPS[section];
  if ((await countOf(db, userId, section)) >= cap) {
    throw badRequest('That section is full', { reason: 'cap_reached', cap });
  }
  const id = newId();
  const sortOrder = await countOf(db, userId, section);
  if (section === 'experience') {
    const parsed = experienceFieldsSchema.parse(fields);
    return db.transaction(async (tx) => {
      await bumpProfile(tx, userId, section);
      const [row] = await tx
        .insert(seekerExperiences)
        .values({
          id,
          userId,
          sortOrder,
          employer: parsed.employer,
          title: parsed.title,
          location: parsed.location,
          startMonth: monthDate(parsed.startMonth) ?? '',
          endMonth: monthDate(parsed.endMonth),
          isCurrent: parsed.isCurrent,
          description: parsed.description,
        })
        .returning();
      if (!row) throw new Error('insert experience returned no row');
      return toExperience(row);
    });
  }
  if (section === 'education') {
    const parsed = educationFieldsSchema.parse(fields);
    return db.transaction(async (tx) => {
      await bumpProfile(tx, userId, section);
      const [row] = await tx
        .insert(seekerEducation)
        .values({
          id,
          userId,
          sortOrder,
          school: parsed.school,
          program: parsed.program,
          startMonth: monthDate(parsed.startMonth),
          endMonth: monthDate(parsed.endMonth),
        })
        .returning();
      if (!row) throw new Error('insert education returned no row');
      return toEducation(row);
    });
  }
  const parsed = certificationFieldsSchema.parse(fields);
  return db.transaction(async (tx) => {
    await bumpProfile(tx, userId, section);
    const [row] = await tx
      .insert(seekerCertifications)
      .values({
        id,
        userId,
        sortOrder,
        name: parsed.name,
        certKey: certKey(parsed.name),
        issuer: parsed.issuer,
        issuedOn: parsed.issuedOn,
        expiresOn: parsed.expiresOn,
      })
      .returning();
    if (!row) throw new Error('insert certification returned no row');
    return toCertification(row);
  });
}

export async function updateEntry(
  db: Db,
  userId: string,
  section: EntrySection,
  id: string,
  fields: unknown,
): Promise<Entry> {
  return db.transaction(async (tx) => {
    if (section === 'experience') {
      const [current] = await tx
        .select()
        .from(seekerExperiences)
        .where(and(eq(seekerExperiences.id, id), eq(seekerExperiences.userId, userId)))
        .limit(1);
      if (!current) throw notFound('Entry not found');
      const parsed = experienceFieldsSchema.parse({
        employer: current.employer,
        title: current.title,
        location: current.location,
        startMonth: monthOf(current.startMonth),
        endMonth: monthOf(current.endMonth),
        isCurrent: current.isCurrent,
        description: current.description,
        ...(fields as object),
      });
      await bumpProfile(tx, userId, section);
      const [row] = await tx
        .update(seekerExperiences)
        .set({
          employer: parsed.employer,
          title: parsed.title,
          location: parsed.location,
          startMonth: monthDate(parsed.startMonth) ?? '',
          endMonth: monthDate(parsed.endMonth),
          isCurrent: parsed.isCurrent,
          description: parsed.description,
        })
        .where(eq(seekerExperiences.id, id))
        .returning();
      if (!row) throw notFound('Entry not found');
      return toExperience(row);
    }
    if (section === 'education') {
      const [current] = await tx
        .select()
        .from(seekerEducation)
        .where(and(eq(seekerEducation.id, id), eq(seekerEducation.userId, userId)))
        .limit(1);
      if (!current) throw notFound('Entry not found');
      const parsed = educationFieldsSchema.parse({
        school: current.school,
        program: current.program,
        startMonth: monthOf(current.startMonth),
        endMonth: monthOf(current.endMonth),
        ...(fields as object),
      });
      await bumpProfile(tx, userId, section);
      const [row] = await tx
        .update(seekerEducation)
        .set({
          school: parsed.school,
          program: parsed.program,
          startMonth: monthDate(parsed.startMonth),
          endMonth: monthDate(parsed.endMonth),
        })
        .where(eq(seekerEducation.id, id))
        .returning();
      if (!row) throw notFound('Entry not found');
      return toEducation(row);
    }
    const [current] = await tx
      .select()
      .from(seekerCertifications)
      .where(and(eq(seekerCertifications.id, id), eq(seekerCertifications.userId, userId)))
      .limit(1);
    if (!current) throw notFound('Entry not found');
    const parsed = certificationFieldsSchema.parse({
      name: current.name,
      issuer: current.issuer,
      issuedOn: dayOf(current.issuedOn),
      expiresOn: dayOf(current.expiresOn),
      ...(fields as object),
    });
    await bumpProfile(tx, userId, section);
    const [row] = await tx
      .update(seekerCertifications)
      .set({
        name: parsed.name,
        certKey: certKey(parsed.name),
        issuer: parsed.issuer,
        issuedOn: parsed.issuedOn,
        expiresOn: parsed.expiresOn,
      })
      .where(eq(seekerCertifications.id, id))
      .returning();
    if (!row) throw notFound('Entry not found');
    return toCertification(row);
  });
}

export async function deleteEntry(
  db: Db,
  userId: string,
  section: EntrySection,
  id: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const table = tables[section];
    const [row] = await tx
      .delete(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .returning({ id: table.id });
    if (!row) throw notFound('Entry not found');
    await bumpProfile(tx, userId, section);
  });
}

/** `ids` must be exactly the seeker's ids in the section. */
export async function reorderEntries(
  db: Db,
  userId: string,
  section: EntrySection,
  ids: string[],
): Promise<void> {
  const table = tables[section];
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.userId, userId));
  const have = new Set(rows.map((row) => row.id));
  if (ids.length !== have.size || ids.some((id) => !have.has(id))) {
    throw badRequest('List exactly your entries', { reason: 'ids_mismatch' });
  }
  await db.transaction(async (tx) => {
    for (let index = 0; index < ids.length; index += 1) {
      await tx
        .update(table)
        .set({ sortOrder: index })
        .where(and(eq(table.id, ids[index] ?? ''), eq(table.userId, userId)));
    }
    await bumpProfile(tx, userId, section);
  });
}

/** Replaces the skill list, in rank order (at most 60, at most 15 highlighted). */
export async function setSkills(
  db: Db,
  userId: string,
  skills: { label: string; highlighted: boolean }[],
): Promise<Skill[]> {
  if (skills.length > PROFILE_CAPS.skills) {
    throw badRequest('That section is full', { reason: 'cap_reached', cap: PROFILE_CAPS.skills });
  }
  const highlighted = skills.filter((skill) => skill.highlighted).length;
  if (highlighted > PROFILE_CAPS.highlighted) {
    throw badRequest('Highlight at most 15 skills', {
      reason: 'too_many_highlighted',
      cap: PROFILE_CAPS.highlighted,
    });
  }
  const kept: { label: string; key: string; highlighted: boolean }[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    const normalized = normalizeSkill(skill.label);
    if (normalized.key === '' || seen.has(normalized.key)) continue;
    seen.add(normalized.key);
    kept.push({ label: normalized.label, key: normalized.key, highlighted: skill.highlighted });
  }
  let rank = 1;
  return db.transaction(async (tx) => {
    await bumpProfile(tx, userId, 'skills');
    await tx.delete(seekerSkills).where(eq(seekerSkills.userId, userId));
    const stored: Skill[] = [];
    for (let index = 0; index < kept.length; index += 1) {
      const skill = kept[index];
      if (!skill) continue;
      const highlightRank = skill.highlighted ? rank++ : null;
      const id = newId();
      await tx.insert(seekerSkills).values({
        id,
        userId,
        sortOrder: index,
        label: skill.label,
        skillKey: skill.key,
        highlightRank,
      });
      stored.push({ id, label: skill.label, key: skill.key, highlighted: skill.highlighted });
    }
    return stored.sort((a, b) => Number(b.highlighted) - Number(a.highlighted));
  });
}
