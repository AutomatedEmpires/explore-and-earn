// Who has accepted which legal version (SP8 spec 8.5, plan Task 24).
//
// Seekers accept the Terms, the Privacy Policy and the Community Guidelines; hosts accept the
// Terms, the Host Terms and the Privacy Policy (ONBOARDING_LEGAL). The version a person must have
// accepted is the newest published or superseded version that is material, or version 1. When
// they are behind it, they accept the version published now. Only the published version can be
// accepted. Acceptances are kept when an account is deleted (content privacy handler).
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { findUserById } from '@/modules/identity';
import { isLegalSlug, ONBOARDING_LEGAL, type LegalSlug } from './legal';
import { legalAcceptances, legalDocuments } from './schema-legal';

export type LegalItem = { slug: LegalSlug; version: number };

type Versions = Map<string, { published: number | null; required: number | null }>;

function asNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

/** Per slug: the published version, and the newest material (or first) version readers saw. */
async function servedVersions(db: DbOrTx, slugs: readonly string[]): Promise<Versions> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({
      slug: legalDocuments.slug,
      published: sql<
        number | null
      >`max(${legalDocuments.version}) filter (where ${legalDocuments.status} = 'published')`,
      required: sql<
        number | null
      >`max(${legalDocuments.version}) filter (where ${legalDocuments.material} or ${legalDocuments.version} = 1)`,
    })
    .from(legalDocuments)
    .where(
      and(
        inArray(legalDocuments.slug, [...slugs]),
        inArray(legalDocuments.status, ['published', 'superseded']),
      ),
    )
    .groupBy(legalDocuments.slug);
  return new Map(
    rows.map((row) => [
      row.slug,
      { published: asNumber(row.published), required: asNumber(row.required) },
    ]),
  );
}

/**
 * The published version of each document `accountType` accepts at onboarding, in
 * ONBOARDING_LEGAL order. A document with no published version is left out.
 */
export async function publishedOnboardingLegal(
  db: DbOrTx,
  accountType: 'seeker' | 'host',
): Promise<LegalItem[]> {
  const slugs = ONBOARDING_LEGAL[accountType];
  const versions = await servedVersions(db, slugs);
  const items: LegalItem[] = [];
  for (const slug of slugs) {
    const published = versions.get(slug)?.published;
    if (published) items.push({ slug, version: published });
  }
  return items;
}

/**
 * The documents this person still has to accept, each with the version published now. Empty
 * for operators, for an account with no type yet and for an unknown or deleted user.
 */
export async function pendingAcceptances(db: DbOrTx, userId: string): Promise<LegalItem[]> {
  const user = await findUserById(db, userId);
  if (!user || user.deletedAt) return [];
  if (user.accountType !== 'seeker' && user.accountType !== 'host') return [];
  const slugs = ONBOARDING_LEGAL[user.accountType];
  const versions = await servedVersions(db, slugs);

  const accepted = new Map<string, number>();
  const rows = await db
    .select({
      slug: legalAcceptances.slug,
      version: sql<number>`max(${legalAcceptances.version})`,
    })
    .from(legalAcceptances)
    .where(and(eq(legalAcceptances.userId, userId), inArray(legalAcceptances.slug, [...slugs])))
    .groupBy(legalAcceptances.slug);
  for (const row of rows) accepted.set(row.slug, Number(row.version));

  const pending: LegalItem[] = [];
  for (const slug of slugs) {
    const v = versions.get(slug);
    if (!v?.required || !v.published) continue;
    if ((accepted.get(slug) ?? 0) < v.required) pending.push({ slug, version: v.published });
  }
  return pending;
}

/**
 * Records that the person accepted these versions. Each must be the document's published
 * version, else bad_request with reason `not_current`. Accepting a version twice is harmless.
 */
export async function recordAcceptance(
  db: DbOrTx,
  userId: string,
  items: readonly { slug: string; version: number }[],
): Promise<void> {
  if (items.length === 0) return;
  const unique = new Map<string, LegalItem>();
  for (const item of items) {
    if (!isLegalSlug(item.slug) || !Number.isSafeInteger(item.version) || item.version < 1) {
      throw badRequest('That document is not one you can accept.', { reason: 'not_current' });
    }
    unique.set(`${item.slug}:${item.version}`, { slug: item.slug, version: item.version });
  }
  const list = [...unique.values()];
  const versions = await servedVersions(db, [...new Set(list.map((item) => item.slug))]);
  for (const item of list) {
    if (versions.get(item.slug)?.published !== item.version) {
      throw badRequest('That version is no longer current. Reload the page and try again.', {
        reason: 'not_current',
        slug: item.slug,
      });
    }
  }
  await db
    .insert(legalAcceptances)
    .values(list.map((item) => ({ id: newId(), userId, slug: item.slug, version: item.version })))
    .onConflictDoNothing();
}
