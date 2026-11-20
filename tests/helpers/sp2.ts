// Test data for SP2 unit tests: host orgs and members, seekers, media and a complete listing.
// Rows are inserted directly (no Clerk), so tests stay fast and independent of the webhook sync.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { CurrentUser, OrgRole } from '@/modules/identity';
import type { HousingSlot, ListingContent } from '@/modules/listings';
import type { MediaKind, MediaStatus, RejectionReason } from '@/modules/media';
import { slugify } from '@/modules/orgs';
import type { HostContext } from '@/server/guards';

/** A fixed "now" for SP2 tests: 2026-11-03 17:00 UTC. */
export const FIXED_NOW = new Date('2026-11-03T17:00:00Z');

export type SeededMember = {
  userId: string;
  clerkUserId: string;
  membershipId: string;
  email: string;
  ctx: HostContext;
};

export type SeededOrg = { orgId: string; clerkOrgId: string; owner: SeededMember };

const short = () => newId().replace(/-/g, '').slice(-10);

/** `base`, or the first `base-N` that no organization uses or has used. */
async function freeSlug(db: DbOrTx, base: string): Promise<string> {
  const rows = await queryRows<{ slug: string }>(
    db,
    sql`
      select slug from app.organizations where slug = ${base} or slug like ${`${base}-%`}
      union
      select slug from app.org_slugs where slug = ${base} or slug like ${`${base}-%`}
    `,
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

async function insertUser(
  db: DbOrTx,
  o: { email: string; accountType: 'host' | 'seeker'; displayName: string },
): Promise<CurrentUser> {
  const id = newId();
  const clerkUserId = `user_${short()}`;
  await db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type, adult_attested_at)
    values (${id}, ${clerkUserId}, ${o.email}, ${o.displayName}, ${o.accountType},
      ${o.accountType === 'seeker' ? sql`now()` : sql`null`})
  `);
  return { id, clerkUserId, accountType: o.accountType, email: o.email };
}

async function insertMembership(
  db: DbOrTx,
  o: { orgId: string; userId: string; role: OrgRole; scope: 'all' | 'assigned' },
): Promise<string> {
  const id = newId();
  await db.execute(sql`
    insert into app.org_memberships (id, org_id, user_id, role, recruiter_scope)
    values (${id}, ${o.orgId}, ${o.userId}, ${o.role}, ${o.scope})
  `);
  return id;
}

/** A host organization (Clerk-free) with an Owner member. */
export async function seedHostOrg(
  db: DbOrTx,
  o: { name?: string; ownerEmail?: string; status?: 'active' | 'suspended' | 'banned' } = {},
): Promise<SeededOrg> {
  const name = o.name ?? 'Kettle Ridge Lodge';
  const email = (o.ownerEmail ?? `owner-${short()}@kettle.test`).toLowerCase();
  const user = await insertUser(db, { email, accountType: 'host', displayName: 'Sam Rivera' });

  const orgId = newId();
  const clerkOrgId = `org_${short()}`;
  const slug = await freeSlug(db, slugify(name));
  await db.execute(sql`
    insert into app.organizations (id, clerk_org_id, name, slug, owner_user_id, status)
    values (${orgId}, ${clerkOrgId}, ${name}, ${slug}, ${user.id}, ${o.status ?? 'active'})
  `);
  const membershipId = await insertMembership(db, {
    orgId,
    userId: user.id,
    role: 'owner',
    scope: 'all',
  });

  return {
    orgId,
    clerkOrgId,
    owner: {
      userId: user.id,
      clerkUserId: user.clerkUserId,
      membershipId,
      email,
      ctx: { user, orgId, role: 'owner' },
    },
  };
}

/** Another member of `orgId`. `scope` matters for Recruiters (default `all`). */
export async function seedMember(
  db: DbOrTx,
  orgId: string,
  role: OrgRole,
  o: { email?: string; scope?: 'all' | 'assigned' } = {},
): Promise<SeededMember> {
  const email = (o.email ?? `${role}-${short()}@kettle.test`).toLowerCase();
  const user = await insertUser(db, { email, accountType: 'host', displayName: `A ${role}` });
  const membershipId = await insertMembership(db, {
    orgId,
    userId: user.id,
    role,
    scope: o.scope ?? 'all',
  });
  return {
    userId: user.id,
    clerkUserId: user.clerkUserId,
    membershipId,
    email,
    ctx: { user, orgId, role },
  };
}

/** A seeker account (18+ attested). */
export async function seedSeeker(
  db: DbOrTx,
  o: { email?: string } = {},
): Promise<{ userId: string; user: CurrentUser }> {
  const email = (o.email ?? `seeker-${short()}@example.test`).toLowerCase();
  const user = await insertUser(db, { email, accountType: 'seeker', displayName: 'Maya' });
  return { userId: user.id, user };
}

/**
 * A media row owned by the org (and its Owner), `approved` with variants by default. A
 * `rejected` row carries the reason `unsafe_content` (Foundation's `media_rejected_has_reason`).
 */
export async function seedMedia(
  db: DbOrTx,
  orgId: string,
  kind: MediaKind,
  status: MediaStatus = 'approved',
): Promise<string> {
  const [org] = await queryRows<{ owner_user_id: string | null }>(
    db,
    sql`select owner_user_id from app.organizations where id = ${orgId}`,
  );
  if (!org?.owner_user_id) throw new Error(`seedMedia: org ${orgId} has no owner`);
  const id = newId();
  const approved = status === 'approved';
  const variants = approved
    ? { '320': `${id}/320.webp`, '640': `${id}/640.webp`, '1280': `${id}/1280.webp` }
    : null;
  const rejectionReason: RejectionReason | null = status === 'rejected' ? 'unsafe_content' : null;
  await db.execute(sql`
    insert into app.media (id, owner_user_id, owner_org_id, kind, status, bucket, path,
      declared_mime, size_bytes, width, height, variants, rejection_reason)
    values (${id}, ${org.owner_user_id}, ${orgId}, ${kind}, ${status},
      ${approved ? 'media-public' : 'quarantine'}, ${id}, 'image/jpeg', 1000,
      ${approved ? 1280 : null}, ${approved ? 960 : null},
      ${variants ? JSON.stringify(variants) : null}::jsonb, ${rejectionReason})
  `);
  return id;
}

/**
 * A complete Seasonal listing: "Lift Operator" at a ski resort, $19-$22 an hour, 2027-06-01 to
 * 2027-08-31, 40 hours a week, shared-room housing at $150 a week (deducted), no meals.
 * `edit` changes it before it is returned.
 */
export function buildListingContent(
  i: { locationId: string; coverMediaId: string; housingPhotos: Record<HousingSlot, string> },
  edit?: (c: ListingContent) => void,
): ListingContent {
  const content: ListingContent = {
    basics: {
      title: 'Lift Operator',
      primaryCategory: 'seasonal',
      genre: 'ski_resorts',
      secondaryCategory: null,
      occupationCode: 'lift_operator',
      openings: 2,
      employmentType: 'employee',
      schedule: 'full_time',
    },
    where: { mode: 'onsite', locationId: i.locationId },
    when: {
      dates: { mode: 'fixed', start: '2027-06-01', end: '2027-08-31' },
      weeklyHours: 40,
      minCommitment: null,
    },
    pay: {
      kind: 'range',
      minCents: 1900,
      maxCents: 2200,
      unit: 'hour',
      crewShareEstimate: null,
      overtime: true,
      tips: false,
      bonuses: null,
      frequency: 'biweekly',
      deductions: null,
    },
    housing: {
      provided: true,
      type: 'shared_room',
      cost: { free: false, cents: 15000, period: 'week', paidBy: 'deducted' },
      photos: { ...i.housingPhotos },
      note: 'Two to a room, a short walk from the lift',
      finePrint: {
        roommates: 1,
        pets: false,
        couples: false,
        wifi: true,
        utilitiesIncluded: true,
        notes: null,
      },
    },
    meals: { provided: false },
    genreDetails: { category: 'seasonal', destinationSlug: null, staffPerks: ['Free ski pass'] },
    job: {
      description:
        'Run the chairlift, help riders on and off safely, and keep the loading area clear of snow.',
      responsibilities: ['Load and unload riders', 'Clear snow from the ramp'],
      typicalDay: null,
      requiredQualifications: ['Comfortable outdoors in cold weather'],
      preferredQualifications: [],
      skills: ['Customer service'],
      certifications: [],
      physicalDemands: 'Standing for long periods',
      minAge: 18,
      perks: ['ski_pass'],
      visaSponsorship: 'none',
    },
    photos: { coverMediaId: i.coverMediaId, galleryMediaIds: [] },
    applying: { questions: [], additionalStep: null, deadline: null, notifyMemberIds: [] },
  };
  edit?.(content);
  return content;
}
