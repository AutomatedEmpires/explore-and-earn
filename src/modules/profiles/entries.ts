// Experience, education and certification entries, and skills (SP4 spec 4.1 and 5). W0 stub: W1
// implements it (Task 9).
import type { Db } from '@/lib/db';
import type {
  CertificationEntry,
  EducationEntry,
  EntrySection,
  ExperienceEntry,
  Skill,
} from '@/lib/profiles';

type Entry = ExperienceEntry | EducationEntry | CertificationEntry;

export async function addEntry(
  _db: Db,
  _userId: string,
  _section: EntrySection,
  _fields: unknown,
): Promise<Entry> {
  throw new Error('not implemented: addEntry');
}

export async function updateEntry(
  _db: Db,
  _userId: string,
  _section: EntrySection,
  _id: string,
  _fields: unknown,
): Promise<Entry> {
  throw new Error('not implemented: updateEntry');
}

export async function deleteEntry(
  _db: Db,
  _userId: string,
  _section: EntrySection,
  _id: string,
): Promise<void> {
  throw new Error('not implemented: deleteEntry');
}

/** `ids` must be exactly the seeker's ids in the section. */
export async function reorderEntries(
  _db: Db,
  _userId: string,
  _section: EntrySection,
  _ids: string[],
): Promise<void> {
  throw new Error('not implemented: reorderEntries');
}

/** Replaces the skill list, in rank order (at most 60, at most 15 highlighted). */
export async function setSkills(
  _db: Db,
  _userId: string,
  _skills: { label: string; highlighted: boolean }[],
): Promise<Skill[]> {
  throw new Error('not implemented: setSkills');
}
