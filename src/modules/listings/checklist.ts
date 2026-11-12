// The builder's required checklist: which sections are complete and which fields are missing,
// from ListingContentSchema's issues.
import {
  ListingContentSchema,
  SECTION_CONTENT_KEYS,
  type BuilderSection,
  type ListingContent,
} from './content';

export type ChecklistEntry = { section: BuilderSection; complete: boolean; missing: string[] };

/** The builder sections, in builder order. */
export const BUILDER_SECTIONS = [
  'basics',
  'where_when',
  'pay',
  'housing',
  'meals',
  'genre_details',
  'job',
  'photos',
  'applying',
] as const satisfies readonly BuilderSection[];

const SECTION_OF_KEY = new Map<string, BuilderSection>(
  BUILDER_SECTIONS.flatMap((s) =>
    SECTION_CONTENT_KEYS[s].map((k): [string, BuilderSection] => [k, s]),
  ),
);

/** The section a content path belongs to ('where.locationId' -> where_when). */
export function sectionOfPath(path: string): BuilderSection {
  return SECTION_OF_KEY.get(path.split('.')[0] ?? '') ?? 'basics';
}

/** The content keys a section edits. */
export function sectionKeys(section: BuilderSection): (keyof ListingContent)[] {
  return SECTION_CONTENT_KEYS[section];
}

/** One entry per builder section, in builder order. */
export function checklist(draft: unknown): ChecklistEntry[] {
  const result = ListingContentSchema.safeParse(draft ?? {});
  const missing = new Map<BuilderSection, string[]>(BUILDER_SECTIONS.map((s) => [s, []]));
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.filter((p) => typeof p === 'string').join('.');
      const list = missing.get(sectionOfPath(path));
      if (list && path && !list.includes(path)) list.push(path);
    }
  }
  return BUILDER_SECTIONS.map((section) => {
    const fields = missing.get(section) ?? [];
    return { section, complete: fields.length === 0, missing: fields };
  });
}
