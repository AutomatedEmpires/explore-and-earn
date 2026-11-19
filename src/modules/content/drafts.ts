// The legal drafts in ./drafts/<slug>.md (SP8 plan Task 25, Plan decision 25). Each is an agent
// draft for counsel, never legal advice. `pnpm content:seed-legal` saves version 1 of each as a
// draft, with its questions for counsel, for every document that has no version yet. Seeding
// never sends anything to counsel, approves or publishes: those steps stay with the Owner.
import type { Db } from '@/lib/db';
import { LEGAL_SLUGS, LEGAL_TITLES, saveLegalDraft, type LegalSlug } from './legal';
import { legalDocuments } from './schema-legal';

export type ParsedDraft = { title: string; counselQuestions: string; bodyMd: string };

/**
 * Splits a draft into its front matter and body. The front matter is `title: <title>` and
 * `counselQuestions: |` followed by an indented Markdown list.
 */
export function parseDraft(md: string): ParsedDraft {
  const text = md.replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) throw new Error('parseDraft: the draft has no front matter');
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('parseDraft: the front matter is not closed');
  const lines = text.slice(4, end).split('\n');
  const bodyMd = text.slice(end + 5).trim();

  let title = '';
  const questions: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('title:')) {
      title = line.slice('title:'.length).trim();
    } else if (line.startsWith('counselQuestions:')) {
      const inline = line.slice('counselQuestions:'.length).trim();
      if (inline !== '|' && inline !== '') questions.push(inline);
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) {
        i += 1;
        questions.push((lines[i] ?? '').replace(/^ {2}/, ''));
      }
    }
  }
  if (!title) throw new Error('parseDraft: the draft has no title');
  if (!bodyMd) throw new Error('parseDraft: the draft has no body');
  return { title, counselQuestions: questions.join('\n'), bodyMd };
}

/** Where the drafts live. Scripts and tests run from the repository root. */
function draftsDir(): string {
  return `${process.cwd()}/src/modules/content/drafts`;
}

/** Reads and parses one slug's draft file, checking its title. */
export async function readLegalDraft(
  slug: LegalSlug,
  dir: string = draftsDir(),
): Promise<ParsedDraft> {
  const { readFile } = await import('node:fs/promises');
  const draft = parseDraft(await readFile(`${dir}/${slug}.md`, 'utf8'));
  if (draft.title !== LEGAL_TITLES[slug]) {
    throw new Error(
      `readLegalDraft: ${slug}.md is titled "${draft.title}", not "${LEGAL_TITLES[slug]}"`,
    );
  }
  return draft;
}

/**
 * Saves version 1 of each legal document that has no version yet, as a draft for counsel, and
 * returns the slugs it created. Running it again changes nothing.
 */
export async function ensureLegalDrafts(
  db: Db,
  opts: { dir?: string } = {},
): Promise<{ created: LegalSlug[] }> {
  const existing = new Set(
    (await db.selectDistinct({ slug: legalDocuments.slug }).from(legalDocuments)).map(
      (row) => row.slug,
    ),
  );
  const created: LegalSlug[] = [];
  for (const slug of LEGAL_SLUGS) {
    if (existing.has(slug)) continue;
    const draft = await readLegalDraft(slug, opts.dir);
    await saveLegalDraft(db, {
      slug,
      title: draft.title,
      bodyMd: draft.bodyMd,
      summaryOfChanges: '',
      counselQuestions: draft.counselQuestions,
      material: true,
      submitForCounsel: false,
      operatorId: null,
    });
    created.push(slug);
  }
  return { created };
}
