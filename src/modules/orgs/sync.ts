// Writes host organizations and memberships from Clerk snapshots. The identity module's
// webhook handler (handleClerkEvent) resolves Clerk user IDs to our user IDs and calls these
// inside its transaction. Every write here is idempotent and order-independent: an older
// snapshot never overwrites a newer one, and deletions are kept as tombstones.
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { OrgRole } from '@/modules/identity';
import { organizations, orgMemberships, orgSlugs } from './schema';

const CLERK_ROLES: Record<string, OrgRole> = {
  'org:recruiter': 'recruiter',
  'org:billing': 'billing',
};

/**
 * Maps a Clerk organization role to ours. The Owner and Admins both hold `org:admin` in Clerk;
 * the Owner is the one recorded in `organizations.owner_user_id`.
 */
export function mapClerkRole(clerkRole: string, isOwner: boolean): OrgRole {
  if (clerkRole === 'org:admin') return isOwner ? 'owner' : 'admin';
  const role = CLERK_ROLES[clerkRole];
  if (!role) throw badRequest(`Unknown Clerk organization role: ${clerkRole}`);
  return role;
}

/** Lowercase ASCII words joined by hyphens: "Kettle Ridge Lodge" -> "kettle-ridge-lodge". */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return slug || 'org';
}

/** The slug of an organization we know only by its Clerk ID (no name yet). */
function fallbackSlug(clerkOrgId: string): string {
  return slugify(clerkOrgId);
}

/**
 * `base` if free, otherwise the first free `base-N` (N >= 2). Every slug in app.org_slugs counts
 * as taken, so a retired slug (which redirects to its organization) is never reissued.
 */
async function freeSlug(db: DbOrTx, base: string): Promise<string> {
  const current = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(sql`${organizations.slug} = ${base} or ${organizations.slug} like ${`${base}-%`}`);
  const used = await db
    .select({ slug: orgSlugs.slug })
    .from(orgSlugs)
    .where(sql`${orgSlugs.slug} = ${base} or ${orgSlugs.slug} like ${`${base}-%`}`);
  const taken = new Set([...current, ...used].map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

type OrgRow = typeof organizations.$inferSelect;

async function lockOrg(db: DbOrTx, clerkOrgId: string): Promise<OrgRow | undefined> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.clerkOrgId, clerkOrgId))
    .for('update');
  return row;
}

/**
 * Returns the organization for `clerkOrgId`, locked for this transaction, inserting a row
 * with a free slug if there is none yet.
 */
async function ensureOrg(db: DbOrTx, clerkOrgId: string, name: string): Promise<OrgRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await lockOrg(db, clerkOrgId);
    if (existing) return existing;

    const slug = await freeSlug(db, name ? slugify(name) : fallbackSlug(clerkOrgId));
    // No conflict target: a concurrent insert of the same Clerk ID or the same slug both end
    // up here without aborting the transaction, and the loop resolves which one it was.
    const [inserted] = await db
      .insert(organizations)
      .values({ id: newId(), clerkOrgId, name, slug })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
  }
  throw new Error(`Could not allocate a slug for organization ${clerkOrgId}`);
}

/** Owner and Admins share Clerk's `org:admin`; keeps `owner` on exactly the recorded owner. */
async function syncOwnerRole(db: DbOrTx, org: { id: string; ownerUserId: string | null }) {
  if (!org.ownerUserId) return;
  await db
    .update(orgMemberships)
    .set({
      role: sql`case when ${orgMemberships.userId} = ${org.ownerUserId} then 'owner' else 'admin' end`,
    })
    .where(
      and(
        eq(orgMemberships.orgId, org.id),
        inArray(orgMemberships.role, ['owner', 'admin']),
        sql`${orgMemberships.role} <> case when ${orgMemberships.userId} = ${org.ownerUserId} then 'owner' else 'admin' end`,
      ),
    );
}

export type OrgSnapshot = {
  clerkOrgId: string;
  /** Null when the snapshot doesn't carry a name. */
  name: string | null;
  /** Our user ID of the Clerk user who created the organization, when known. */
  createdByUserId: string | null;
  /** Clerk's `updated_at`. Null for a partial snapshot, which only fills in missing fields. */
  clerkUpdatedAt: Date | null;
};

/**
 * Creates or updates an organization from a Clerk snapshot and returns its row.
 * - A versioned snapshot applies only if it is newer than the one the row holds.
 * - An unversioned (partial) snapshot only fills in a missing name.
 * - The creator becomes the owner if no owner is recorded yet.
 * - A deleted organization stays deleted.
 */
export async function applyClerkOrganization(
  db: DbOrTx,
  s: OrgSnapshot,
): Promise<{ id: string; slug: string; ownerUserId: string | null }> {
  const org = await ensureOrg(db, s.clerkOrgId, s.name ?? '');
  const patch: Partial<typeof organizations.$inferInsert> = {};

  const newer =
    s.clerkUpdatedAt !== null &&
    (org.clerkUpdatedAt === null || org.clerkUpdatedAt < s.clerkUpdatedAt);
  if (newer) patch.clerkUpdatedAt = s.clerkUpdatedAt;
  if (s.name && (newer || org.name === '')) patch.name = s.name;
  if (patch.name && org.slug === fallbackSlug(s.clerkOrgId)) {
    patch.slug = await freeSlug(db, slugify(patch.name));
  }
  if (s.createdByUserId && org.ownerUserId === null) patch.ownerUserId = s.createdByUserId;

  if (Object.keys(patch).length === 0) return org;

  const [updated] = await db
    .update(organizations)
    .set(patch)
    .where(eq(organizations.id, org.id))
    .returning();
  if (!updated) throw new Error(`Organization ${org.id} vanished during update`);
  if (patch.ownerUserId) await syncOwnerRole(db, updated);
  return updated;
}

/** Marks an organization deleted (once), recording a tombstone if it was never seen. */
export async function deleteClerkOrganization(db: DbOrTx, clerkOrgId: string): Promise<void> {
  const org = await ensureOrg(db, clerkOrgId, '');
  if (org.deletedAt) return;
  await db
    .update(organizations)
    .set({ deletedAt: sql`now()` })
    .where(eq(organizations.id, org.id));
}

export type MembershipSnapshot = {
  /** The organization as embedded in the membership payload. */
  org: OrgSnapshot;
  userId: string;
  clerkRole: string;
  clerkUpdatedAt: Date;
  deleted: boolean;
};

/**
 * Applies a membership snapshot. A created or updated snapshot applies only if newer than the
 * row's; a deletion applies if at least as new, so the deletion wins a tie with the last update.
 * Throws bad_request for an unknown Clerk role on a live membership.
 */
export async function applyClerkMembership(db: DbOrTx, m: MembershipSnapshot): Promise<void> {
  const org = await applyClerkOrganization(db, m.org);
  const isOwner = org.ownerUserId === m.userId;

  let role: OrgRole;
  try {
    role = mapClerkRole(m.clerkRole, isOwner);
  } catch (err) {
    // A removed membership's role no longer matters; keep the tombstone at the least access.
    if (!m.deleted) throw err;
    role = 'billing';
  }

  const values = {
    id: newId(),
    orgId: org.id,
    userId: m.userId,
    role,
    deletedAt: m.deleted ? new Date() : null,
    clerkUpdatedAt: m.clerkUpdatedAt,
  };

  if (m.deleted) {
    await db
      .insert(orgMemberships)
      .values(values)
      .onConflictDoUpdate({
        target: [orgMemberships.orgId, orgMemberships.userId],
        set: {
          deletedAt: sql`coalesce(${orgMemberships.deletedAt}, excluded.deleted_at)`,
          clerkUpdatedAt: sql`excluded.clerk_updated_at`,
        },
        setWhere: sql`${orgMemberships.clerkUpdatedAt} is null or ${orgMemberships.clerkUpdatedAt} <= excluded.clerk_updated_at`,
      });
    return;
  }

  await db
    .insert(orgMemberships)
    .values(values)
    .onConflictDoUpdate({
      target: [orgMemberships.orgId, orgMemberships.userId],
      set: {
        role: sql`excluded.role`,
        deletedAt: null,
        clerkUpdatedAt: sql`excluded.clerk_updated_at`,
      },
      setWhere: sql`${orgMemberships.clerkUpdatedAt} is null or ${orgMemberships.clerkUpdatedAt} < excluded.clerk_updated_at`,
    });
}

/**
 * Records our own write of a new organization (before Clerk's webhooks arrive) and its owner's
 * membership. Safe to run before or after the webhooks for the same organization.
 */
export async function recordCreatedOrganization(
  db: DbOrTx,
  i: { clerkOrgId: string; name: string; ownerUserId: string },
): Promise<{ id: string; slug: string }> {
  const org = await applyClerkOrganization(db, {
    clerkOrgId: i.clerkOrgId,
    name: i.name,
    createdByUserId: i.ownerUserId,
    clerkUpdatedAt: null,
  });
  await db
    .insert(orgMemberships)
    .values({ id: newId(), orgId: org.id, userId: i.ownerUserId, role: 'owner' })
    .onConflictDoNothing({ target: [orgMemberships.orgId, orgMemberships.userId] });
  await syncOwnerRole(db, org);
  return { id: org.id, slug: org.slug };
}

/**
 * The user's live membership in the organization with Clerk ID `clerkOrgId`, or, when that is
 * null (no active organization in the session), their oldest live membership.
 */
export async function findHostMembership(
  db: DbOrTx,
  userId: string,
  clerkOrgId: string | null,
): Promise<{ orgId: string; clerkOrgId: string; role: OrgRole } | null> {
  const [row] = await db
    .select({
      orgId: organizations.id,
      clerkOrgId: organizations.clerkOrgId,
      role: orgMemberships.role,
    })
    .from(orgMemberships)
    .innerJoin(organizations, eq(organizations.id, orgMemberships.orgId))
    .where(
      and(
        eq(orgMemberships.userId, userId),
        isNull(orgMemberships.deletedAt),
        isNull(organizations.deletedAt),
        clerkOrgId === null ? undefined : eq(organizations.clerkOrgId, clerkOrgId),
      ),
    )
    .orderBy(orgMemberships.createdAt)
    .limit(1);
  return row ?? null;
}
