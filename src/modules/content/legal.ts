// Versioned legal documents (SP8 spec 8.5, plan Task 24).
//
// A version moves draft -> counsel_review -> approved -> scheduled -> published, and the version
// it replaces becomes superseded. Only the Owner records counsel approval (a console action that
// requires reverification); nothing here approves or publishes on its own. Seeded drafts stay
// drafts until counsel signs them, so a draft is never served as a published document.
//
// The first version of a document takes effect when it is published. A material change to a
// published document takes effect at least 30 days after it is scheduled, and the people who must
// accept it are told when it is scheduled (content.legal_notify_chunk).
import { and, asc, desc, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTx, type Db, type DbOrTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { enqueue } from '@/modules/jobs';
import { loadPrivacyRegistry } from '@/modules/privacy';
import { renderRetentionTable } from './retention-table';
import { legalDocuments, type LegalStatus } from './schema-legal';

export const LEGAL_SLUGS = [
  'terms',
  'host-terms',
  'privacy',
  'cookies',
  'community',
  'fit-score',
  'international',
  'subprocessors',
] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const LEGAL_TITLES: Readonly<Record<LegalSlug, string>> = {
  terms: 'Terms of Service',
  'host-terms': 'Host Terms',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  community: 'Community Guidelines',
  'fit-score': 'Fit score notice',
  international: 'Working in the US from abroad',
  subprocessors: 'Subprocessors',
};

/** What each account type accepts at onboarding (spec 8.5). Operators accept nothing here. */
export const ONBOARDING_LEGAL = {
  seeker: ['terms', 'privacy', 'community'],
  host: ['terms', 'host-terms', 'privacy'],
} as const satisfies Record<'seeker' | 'host', readonly LegalSlug[]>;

export const LEGAL_EFFECTIVE_TOPIC = 'content.legal_effective';
export const LEGAL_NOTIFY_TOPIC = 'content.legal_notify_chunk';

/** A material change takes effect no sooner than this after it is scheduled. */
export const NOTICE_PERIOD_DAYS = 30;
/** Replaced in the privacy policy by the table of registered retention rules (Plan decision 25). */
export const RETENTION_TABLE_TOKEN = '{{retention_table}}';

const DAY_MS = 24 * 60 * 60 * 1000;
const SERVED: readonly LegalStatus[] = ['published', 'superseded'];
/** A version with counsel, or approved and waiting to be scheduled, blocks a new draft. */
const UNDER_REVIEW: readonly LegalStatus[] = ['counsel_review', 'approved'];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

export type PublishedLegal = {
  slug: LegalSlug;
  version: number;
  title: string;
  bodyMd: string;
  effectiveAt: Date;
};

export type LegalVersion = PublishedLegal & { status: 'published' | 'superseded' };

export type LegalDocumentRow = {
  id: string;
  slug: LegalSlug;
  version: number;
  title: string;
  bodyMd: string;
  summaryOfChanges: string;
  counselQuestions: string;
  material: boolean;
  status: LegalStatus;
  counselApprovedAt: Date | null;
  counselNote: string | null;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const draftInput = z.object({
  slug: z.enum(LEGAL_SLUGS),
  title: z.string().trim().min(1).max(200),
  bodyMd: z.string().trim().min(1).max(200_000),
  summaryOfChanges: z.string().max(2000),
  counselQuestions: z.string().max(20_000),
  material: z.boolean(),
  submitForCounsel: z.boolean(),
  operatorId: z.uuid().nullable(),
});

export type SaveLegalDraftInput = z.input<typeof draftInput> & { slug: LegalSlug };

/**
 * Saves the slug's draft: updates the draft row if there is one, else adds version max + 1.
 * Version 1 is always material. `submitForCounsel` sends it to counsel (counsel_review). A
 * version with counsel or approved and not yet scheduled can't be edited, and no new version is
 * started beside it (conflict, reason `not_editable`). For the privacy policy, the retention
 * table token is replaced by the registered rules, so a published version never changes
 * underneath its readers.
 */
export async function saveLegalDraft(
  db: Db,
  input: SaveLegalDraftInput,
): Promise<{ id: string; version: number }> {
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) {
    throw badRequest('Check the document fields.', {
      reason: 'invalid',
      issues: parsed.error.issues,
    });
  }
  const i = parsed.data;
  let bodyMd = i.bodyMd;
  if (i.slug === 'privacy' && bodyMd.includes(RETENTION_TABLE_TOKEN)) {
    const table = renderRetentionTable((await loadPrivacyRegistry()).rules);
    bodyMd = bodyMd.split(RETENTION_TABLE_TOKEN).join(table);
  }
  const status: LegalStatus = i.submitForCounsel ? 'counsel_review' : 'draft';

  return withTx(db, async (tx) => {
    const rows = await tx
      .select({
        id: legalDocuments.id,
        version: legalDocuments.version,
        status: legalDocuments.status,
      })
      .from(legalDocuments)
      .where(eq(legalDocuments.slug, i.slug))
      .orderBy(desc(legalDocuments.version))
      .for('update');
    if (rows.some((row) => UNDER_REVIEW.includes(row.status))) {
      throw conflict(
        'Another version of this document is with counsel or waiting to be scheduled.',
        {
          reason: 'not_editable',
        },
      );
    }
    const fields = {
      title: i.title,
      bodyMd,
      summaryOfChanges: i.summaryOfChanges,
      counselQuestions: i.counselQuestions,
      status,
      updatedBy: i.operatorId,
    };
    const draft = rows.find((row) => row.status === 'draft');
    if (draft) {
      await tx
        .update(legalDocuments)
        .set({ ...fields, material: draft.version === 1 ? true : i.material })
        .where(eq(legalDocuments.id, draft.id));
      return { id: draft.id, version: draft.version };
    }
    const version = (rows[0]?.version ?? 0) + 1;
    const id = newId();
    await tx.insert(legalDocuments).values({
      id,
      slug: i.slug,
      version,
      ...fields,
      material: version === 1 ? true : i.material,
      createdBy: i.operatorId,
    });
    return { id, version };
  });
}

/**
 * The Owner records that counsel approved a version: counsel_review -> approved, with the date
 * and counsel's note (3 to 2,000 characters). Audited as `content.legal_counsel_approved`.
 */
export async function recordCounselApproval(
  db: Db,
  i: { documentId: string; note: string; operatorId: string; now?: Date },
): Promise<void> {
  const note = i.note.trim();
  if (note.length < 3 || note.length > 2000) {
    throw badRequest('Write a note from counsel of 3 to 2,000 characters.', {
      reason: 'invalid_note',
    });
  }
  if (!z.uuid().safeParse(i.documentId).success) throw notFound('Document not found');
  await withTx(db, async (tx) => {
    const [doc] = await tx
      .select({
        id: legalDocuments.id,
        slug: legalDocuments.slug,
        version: legalDocuments.version,
        status: legalDocuments.status,
      })
      .from(legalDocuments)
      .where(eq(legalDocuments.id, i.documentId))
      .for('update');
    if (!doc) throw notFound('Document not found');
    if (doc.status !== 'counsel_review') {
      throw conflict('Only a version with counsel can be approved.', { reason: 'not_in_review' });
    }
    await tx
      .update(legalDocuments)
      .set({
        status: 'approved',
        counselApprovedAt: i.now ?? new Date(),
        counselNote: note,
        updatedBy: i.operatorId,
      })
      .where(eq(legalDocuments.id, doc.id));
    await record(tx, {
      actorType: 'operator',
      actorId: i.operatorId,
      action: 'content.legal_counsel_approved',
      subjectType: 'legal_document',
      subjectId: doc.id,
      data: { slug: doc.slug, version: doc.version },
    });
  });
}

/**
 * Schedules an approved version. With no published version of the slug yet, it is published at
 * once. A material version takes effect at least 30 days from now and starts the legal.updated
 * notices; a version that isn't material takes effect on any date from now on. Only one version
 * of a slug can wait at a time (conflict, reason `already_scheduled`).
 */
export async function scheduleLegal(
  db: Db,
  i: { documentId: string; effectiveAt: Date; operatorId: string; now?: Date },
): Promise<{ status: 'scheduled' | 'published'; effectiveAt: Date }> {
  const now = i.now ?? new Date();
  if (!(i.effectiveAt instanceof Date) || Number.isNaN(i.effectiveAt.getTime())) {
    throw badRequest('Pick the date the change takes effect.', { reason: 'invalid_date' });
  }
  if (!z.uuid().safeParse(i.documentId).success) throw notFound('Document not found');

  return withTx(db, async (tx) => {
    const [doc] = await tx
      .select()
      .from(legalDocuments)
      .where(eq(legalDocuments.id, i.documentId))
      .for('update');
    if (!doc) throw notFound('Document not found');
    if (doc.status !== 'approved') {
      throw conflict('Only a version counsel approved can be scheduled.', {
        reason: 'not_approved',
      });
    }
    const others = await tx
      .select({ status: legalDocuments.status })
      .from(legalDocuments)
      .where(and(eq(legalDocuments.slug, doc.slug), ne(legalDocuments.id, doc.id)))
      .for('update');
    if (others.some((row) => row.status === 'scheduled')) {
      throw conflict('Another version of this document is already scheduled.', {
        reason: 'already_scheduled',
      });
    }
    const audit = { slug: doc.slug, version: doc.version };

    if (!others.some((row) => row.status === 'published')) {
      await tx
        .update(legalDocuments)
        .set({ status: 'published', effectiveAt: now, publishedAt: now, updatedBy: i.operatorId })
        .where(eq(legalDocuments.id, doc.id));
      await record(tx, {
        actorType: 'operator',
        actorId: i.operatorId,
        action: 'content.legal_published',
        subjectType: 'legal_document',
        subjectId: doc.id,
        data: audit,
      });
      return { status: 'published', effectiveAt: now };
    }

    if (doc.material) {
      if (i.effectiveAt.getTime() < now.getTime() + NOTICE_PERIOD_DAYS * DAY_MS) {
        throw badRequest('A material change takes effect at least 30 days after you schedule it.', {
          reason: 'notice_period',
        });
      }
    } else if (i.effectiveAt.getTime() < now.getTime()) {
      throw badRequest('Pick a date from today on.', { reason: 'effective_in_past' });
    }

    await tx
      .update(legalDocuments)
      .set({ status: 'scheduled', effectiveAt: i.effectiveAt, updatedBy: i.operatorId })
      .where(eq(legalDocuments.id, doc.id));
    await record(tx, {
      actorType: 'operator',
      actorId: i.operatorId,
      action: 'content.legal_scheduled',
      subjectType: 'legal_document',
      subjectId: doc.id,
      data: { ...audit, material: doc.material, effectiveAt: i.effectiveAt.toISOString() },
    });
    if (doc.material) {
      await enqueue(tx, {
        topic: LEGAL_NOTIFY_TOPIC,
        payload: { documentId: doc.id, afterUserId: null },
        dedupeKey: `legal_notify:${doc.id}:start`,
      });
    }
    return { status: 'scheduled', effectiveAt: i.effectiveAt };
  });
}

/**
 * `content.legal_effective`: publishes each scheduled version whose date has come, superseding
 * the slug's published version in the same transaction, so a slug never has two published
 * versions. Returns how many were published.
 */
export async function publishDueLegal(db: Db, now: Date): Promise<number> {
  const due = await db
    .select({ id: legalDocuments.id })
    .from(legalDocuments)
    .where(and(eq(legalDocuments.status, 'scheduled'), lte(legalDocuments.effectiveAt, now)))
    .orderBy(asc(legalDocuments.effectiveAt), asc(legalDocuments.version));

  let published = 0;
  for (const { id } of due) {
    const done = await withTx(db, async (tx) => {
      const [doc] = await tx
        .select({
          id: legalDocuments.id,
          slug: legalDocuments.slug,
          version: legalDocuments.version,
          status: legalDocuments.status,
        })
        .from(legalDocuments)
        .where(eq(legalDocuments.id, id))
        .for('update');
      if (!doc || doc.status !== 'scheduled') return false;
      await tx
        .update(legalDocuments)
        .set({ status: 'superseded' })
        .where(and(eq(legalDocuments.slug, doc.slug), eq(legalDocuments.status, 'published')));
      await tx
        .update(legalDocuments)
        .set({ status: 'published', publishedAt: now })
        .where(eq(legalDocuments.id, doc.id));
      await record(tx, {
        actorType: 'system',
        actorId: null,
        action: 'content.legal_published',
        subjectType: 'legal_document',
        subjectId: doc.id,
        data: { slug: doc.slug, version: doc.version },
      });
      return true;
    });
    if (done) published += 1;
  }
  return published;
}

const servedColumns = {
  slug: legalDocuments.slug,
  version: legalDocuments.version,
  title: legalDocuments.title,
  bodyMd: legalDocuments.bodyMd,
  effectiveAt: legalDocuments.effectiveAt,
  publishedAt: legalDocuments.publishedAt,
  status: legalDocuments.status,
};

type ServedRow = {
  slug: string;
  version: number;
  title: string;
  bodyMd: string;
  effectiveAt: Date | null;
  publishedAt: Date | null;
  status: LegalStatus;
};

function toPublished(row: ServedRow): PublishedLegal {
  return {
    slug: row.slug as LegalSlug,
    version: row.version,
    title: row.title,
    bodyMd: row.bodyMd,
    effectiveAt: row.effectiveAt ?? row.publishedAt ?? new Date(0),
  };
}

/** The slug's published version, or null. Drafts and versions with counsel are never returned. */
export async function getPublishedLegal(
  db: DbOrTx,
  slug: LegalSlug,
): Promise<PublishedLegal | null> {
  if (!isLegalSlug(slug)) return null;
  const [row] = await db
    .select(servedColumns)
    .from(legalDocuments)
    .where(and(eq(legalDocuments.slug, slug), eq(legalDocuments.status, 'published')))
    .limit(1);
  return row ? toPublished(row) : null;
}

/** Every version readers have seen (published or superseded), newest first. */
export async function listLegalVersions(
  db: DbOrTx,
  slug: LegalSlug,
): Promise<
  { version: number; title: string; effectiveAt: Date; status: 'published' | 'superseded' }[]
> {
  if (!isLegalSlug(slug)) return [];
  const rows = await db
    .select(servedColumns)
    .from(legalDocuments)
    .where(and(eq(legalDocuments.slug, slug), inArray(legalDocuments.status, SERVED)))
    .orderBy(desc(legalDocuments.version));
  return rows.map((row) => ({
    version: row.version,
    title: row.title,
    effectiveAt: toPublished(row).effectiveAt,
    status: row.status as 'published' | 'superseded',
  }));
}

/** One published or superseded version, or null. */
export async function getLegalVersion(
  db: DbOrTx,
  slug: LegalSlug,
  version: number,
): Promise<LegalVersion | null> {
  if (!isLegalSlug(slug) || !Number.isSafeInteger(version) || version < 1) return null;
  const [row] = await db
    .select(servedColumns)
    .from(legalDocuments)
    .where(
      and(
        eq(legalDocuments.slug, slug),
        eq(legalDocuments.version, version),
        inArray(legalDocuments.status, SERVED),
      ),
    )
    .limit(1);
  return row ? { ...toPublished(row), status: row.status as 'published' | 'superseded' } : null;
}

/** Every version of every document, for the console: status, counsel fields and dates. */
export async function listLegalDocumentsForConsole(db: DbOrTx): Promise<LegalDocumentRow[]> {
  const rows = await db
    .select()
    .from(legalDocuments)
    .orderBy(
      sql`array_position(${sql.raw(`array[${LEGAL_SLUGS.map((s) => `'${s}'`).join(',')}]`)}::text[], ${legalDocuments.slug})`,
      desc(legalDocuments.version),
    );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug as LegalSlug,
    version: row.version,
    title: row.title,
    bodyMd: row.bodyMd,
    summaryOfChanges: row.summaryOfChanges,
    counselQuestions: row.counselQuestions,
    material: row.material,
    status: row.status,
    counselApprovedAt: row.counselApprovedAt,
    counselNote: row.counselNote,
    effectiveAt: row.effectiveAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}
