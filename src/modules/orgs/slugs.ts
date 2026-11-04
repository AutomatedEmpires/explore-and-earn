// Host page addresses: /hosts/<slug> (SP2 spec section 8.5). Every slug an org has used stays in
// app.org_slugs (the app.org_slugs_track() trigger keeps it) and redirects forever, so a slug
// another org ever used is never reissued. An org may reclaim its own retired slug.
import { and, eq, ne } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { emit } from '@/modules/jobs';
import type { HostContext } from '@/server/guards';
import { requireCapability } from './roles';
import { organizations, orgSlugs } from './schema';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Words that are app routes, never host page addresses. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'host',
  'hosts',
  'jobs',
  'new',
  'pricing',
  'settings',
  'join',
]);

const slugTaken = () =>
  conflict('Another host already uses that address. Try a different one.', {
    reason: 'slug_taken',
  });

/** True for a Postgres unique violation anywhere in the error's cause chain. */
function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    if ((e as { code?: unknown }).code === '23505') return true;
  }
  return false;
}

/**
 * Changes the caller's host page address (Owner or Admin). A slug is 3-60 characters of
 * lowercase letters and digits in hyphen-separated words (`bad_request` otherwise); a reserved
 * word is 400 `slug_reserved`; a slug any other org has used is 409 `slug_taken`. The old slug
 * is retired and redirects. Records `orgs.slug_changed` and emits `hostpage.updated`.
 */
export async function changeSlug(
  db: DbOrTx,
  ctx: HostContext,
  slug: string,
): Promise<{ slug: string }> {
  requireCapability(ctx, 'hostpage.edit');
  if (typeof slug !== 'string' || slug.length < 3 || slug.length > 60 || !SLUG.test(slug)) {
    throw badRequest(
      'Use 3 to 60 lowercase letters or numbers, with single hyphens between words',
      { reason: 'slug_invalid' },
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw badRequest('That address is reserved. Choose another one.', { reason: 'slug_reserved' });
  }

  try {
    return await db.transaction(async (tx) => {
      const [org] = await tx
        .select({
          id: organizations.id,
          slug: organizations.slug,
          deletedAt: organizations.deletedAt,
        })
        .from(organizations)
        .where(eq(organizations.id, ctx.orgId))
        .for('update');
      if (!org || org.deletedAt) throw notFound('Organization not found');
      if (org.slug === slug) return { slug };

      const [history] = await tx
        .select({ orgId: orgSlugs.orgId })
        .from(orgSlugs)
        .where(eq(orgSlugs.slug, slug));
      if (history && history.orgId !== org.id) throw slugTaken();
      const [current] = await tx
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(eq(organizations.slug, slug), ne(organizations.id, org.id)));
      if (current) throw slugTaken();

      await tx.update(organizations).set({ slug }).where(eq(organizations.id, org.id));
      // The trigger records the new slug; another org claiming it at the same moment wins.
      const [mine] = await tx
        .select({ orgId: orgSlugs.orgId })
        .from(orgSlugs)
        .where(eq(orgSlugs.slug, slug));
      if (mine?.orgId !== org.id) throw slugTaken();

      await record(tx, {
        actorType: 'user',
        actorId: ctx.user.id,
        orgId: org.id,
        action: 'orgs.slug_changed',
        subjectType: 'organization',
        subjectId: org.id,
        data: { from: org.slug, to: slug },
      });
      await emit(tx, 'hostpage.updated', { orgId: org.id }, newId());
      return { slug };
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw slugTaken();
    throw err;
  }
}

/**
 * The org a host page address belongs to: null for an unknown slug or a deleted org. `retired`
 * is true exactly when the address differs from the org's current slug (a slug it used before,
 * or the current one in other letter case), so the page redirects to `currentSlug`.
 */
export async function resolveSlug(
  db: DbOrTx,
  slug: string,
): Promise<{ orgId: string; currentSlug: string; retired: boolean } | null> {
  if (typeof slug !== 'string') return null;
  const key = slug.trim().toLowerCase();
  if (key === '' || key.length > 100) return null;
  const [row] = await db
    .select({
      orgId: orgSlugs.orgId,
      currentSlug: organizations.slug,
      deletedAt: organizations.deletedAt,
    })
    .from(orgSlugs)
    .innerJoin(organizations, eq(organizations.id, orgSlugs.orgId))
    .where(eq(orgSlugs.slug, key));
  if (!row || row.deletedAt !== null) return null;
  return { orgId: row.orgId, currentSlug: row.currentSlug, retired: row.currentSlug !== slug };
}
