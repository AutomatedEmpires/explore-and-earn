// Syncs Clerk users, organizations and memberships into Postgres from Clerk webhooks.
//
// Clerk (through Svix) delivers at least once and in no guaranteed order. So (Review Focus 1):
// - each delivery is recorded in app.webhook_events in the same transaction as its effects, and
//   a redelivery is a no-op;
// - an entity referenced before its own event arrives gets a placeholder row, which the entity's
//   own events fill in later (never a second row);
// - rows remember the Clerk `updated_at` they were written from, and older snapshots are skipped;
// - deletions are kept (deleted_at), so a reordered create or update can't bring a row back.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { type Db, type DbOrTx, withTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import {
  applyClerkMembership,
  applyClerkOrganization,
  deleteClerkOrganization,
  type OrgSnapshot,
} from '@/modules/orgs';
import { OPERATOR_ROLES, operators, users, webhookEvents } from './schema';

export { mapClerkRole } from '@/modules/orgs';

export type ClerkEvent = { id: string; type: string; data: unknown };

const clerkTime = z.number().transform((value) => new Date(value));

const userSchema = z.object({
  id: z.string().min(1),
  first_name: z.string().nullish(),
  last_name: z.string().nullish(),
  username: z.string().nullish(),
  primary_email_address_id: z.string().nullish(),
  email_addresses: z
    .array(z.object({ id: z.string(), email_address: z.string() }))
    .nullish()
    .transform((list) => list ?? []),
  public_metadata: z
    .record(z.string(), z.unknown())
    .nullish()
    .transform((md) => md ?? {}),
  updated_at: clerkTime,
});

const deletedSchema = z.object({ id: z.string().min(1) });

const orgSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  created_by: z.string().nullish(),
  updated_at: clerkTime,
});

// The organization embedded in a membership payload; treated as partial if it lacks a version.
const embeddedOrgSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullish(),
  created_by: z.string().nullish(),
  updated_at: clerkTime.nullish(),
});

const membershipSchema = z.object({
  role: z.string().min(1),
  organization: embeddedOrgSchema,
  public_user_data: z.object({
    user_id: z.string().min(1),
    identifier: z.string().nullish(),
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
  }),
  updated_at: clerkTime,
});

function parse<T>(schema: z.ZodType<T>, data: unknown, type: string): T {
  const result = schema.safeParse(data);
  if (!result.success) throw badRequest(`Invalid ${type} payload`, result.error.issues);
  return result.data;
}

function displayName(first?: string | null, last?: string | null, fallback?: string | null) {
  const name = [first, last]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
  return name || fallback?.trim() || null;
}

/** Our user ID for a Clerk user, inserting a placeholder row if the user is new to us. */
async function ensureUser(
  db: DbOrTx,
  clerkUserId: string,
  seed: { email?: string | null; displayName?: string | null } = {},
): Promise<string> {
  await db
    .insert(users)
    .values({
      id: newId(),
      clerkUserId,
      email: seed.email ?? null,
      displayName: seed.displayName ?? null,
    })
    .onConflictDoNothing({ target: users.clerkUserId });
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  if (!row) throw new Error(`User ${clerkUserId} missing after upsert`);
  return row.id;
}

/**
 * Applies a Clerk user snapshot (a webhook's `data`, or `User.raw` from the Backend API) and
 * returns our user ID. Account type: only `operator` is adopted from public metadata (it comes
 * from an operator invitation); onboarding sets `seeker` and `host`, and nothing changes a set one.
 */
export async function applyClerkUser(db: DbOrTx, data: unknown): Promise<string> {
  const u = parse(userSchema, data, 'user');
  const primary =
    u.email_addresses.find((e) => e.id === u.primary_email_address_id) ?? u.email_addresses[0];

  await db
    .insert(users)
    .values({
      id: newId(),
      clerkUserId: u.id,
      email: primary?.email_address ?? null,
      displayName: displayName(u.first_name, u.last_name, u.username),
      clerkUpdatedAt: u.updated_at,
    })
    .onConflictDoUpdate({
      target: users.clerkUserId,
      set: {
        email: sql`excluded.email`,
        displayName: sql`excluded.display_name`,
        clerkUpdatedAt: sql`excluded.clerk_updated_at`,
      },
      setWhere: sql`${users.clerkUpdatedAt} is null or ${users.clerkUpdatedAt} < excluded.clerk_updated_at`,
    });

  if (u.public_metadata.account_type === 'operator') {
    await db
      .update(users)
      .set({ accountType: 'operator' })
      .where(and(eq(users.clerkUserId, u.id), isNull(users.accountType)));
  }

  const [row] = await db
    .select({ id: users.id, accountType: users.accountType })
    .from(users)
    .where(eq(users.clerkUserId, u.id));
  if (!row) throw new Error(`User ${u.id} missing after upsert`);

  if (row.accountType === 'operator' && u.public_metadata.account_type === 'operator') {
    const requested = u.public_metadata.operator_role;
    const role = OPERATOR_ROLES.find((r) => r === requested) ?? 'operator';
    await db
      .insert(operators)
      .values({ userId: row.id, role })
      .onConflictDoNothing({ target: operators.userId });
  }
  return row.id;
}

/** Applies a Clerk user snapshot in its own transaction (sign-in before the webhook lands). */
export function syncClerkUser(db: Db, data: unknown): Promise<string> {
  return withTx(db, (tx) => applyClerkUser(tx, data));
}

async function deleteUser(db: DbOrTx, clerkUserId: string): Promise<void> {
  await ensureUser(db, clerkUserId);
  await db
    .update(users)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(users.clerkUserId, clerkUserId), isNull(users.deletedAt)));
}

async function embeddedOrg(
  db: DbOrTx,
  o: z.output<typeof embeddedOrgSchema>,
): Promise<OrgSnapshot> {
  return {
    clerkOrgId: o.id,
    name: o.name ?? null,
    createdByUserId: o.created_by ? await ensureUser(db, o.created_by) : null,
    // A partial organization (no name) only seeds a placeholder.
    clerkUpdatedAt: o.name ? (o.updated_at ?? null) : null,
  };
}

async function apply(db: DbOrTx, type: string, data: unknown): Promise<void> {
  switch (type) {
    case 'user.created':
    case 'user.updated':
      await applyClerkUser(db, data);
      return;

    case 'user.deleted':
      await deleteUser(db, parse(deletedSchema, data, type).id);
      return;

    case 'organization.created':
    case 'organization.updated': {
      const o = parse(orgSchema, data, type);
      await applyClerkOrganization(db, {
        clerkOrgId: o.id,
        name: o.name,
        createdByUserId: o.created_by ? await ensureUser(db, o.created_by) : null,
        clerkUpdatedAt: o.updated_at,
      });
      return;
    }

    case 'organization.deleted':
      await deleteClerkOrganization(db, parse(deletedSchema, data, type).id);
      return;

    case 'organizationMembership.created':
    case 'organizationMembership.updated':
    case 'organizationMembership.deleted': {
      const m = parse(membershipSchema, data, type);
      const p = m.public_user_data;
      const userId = await ensureUser(db, p.user_id, {
        email: p.identifier?.includes('@') ? p.identifier : null,
        displayName: displayName(p.first_name, p.last_name),
      });
      await applyClerkMembership(db, {
        org: await embeddedOrg(db, m.organization),
        userId,
        clerkRole: m.role,
        clerkUpdatedAt: m.updated_at,
        deleted: type === 'organizationMembership.deleted',
      });
      return;
    }

    default:
      // Other event types (sessions, emails, ...) are recorded as seen and otherwise ignored.
      return;
  }
}

/**
 * Applies one Clerk webhook event exactly once. Returns 'duplicate' for an event ID already
 * applied. Throws (and records nothing) if the event can't be applied, so Clerk retries it.
 */
export async function handleClerkEvent(db: Db, evt: ClerkEvent): Promise<'applied' | 'duplicate'> {
  return withTx(db, async (tx) => {
    const [fresh] = await tx
      .insert(webhookEvents)
      .values({ id: evt.id, source: 'clerk' })
      .onConflictDoNothing({ target: webhookEvents.id })
      .returning({ id: webhookEvents.id });
    if (!fresh) return 'duplicate';
    await apply(tx, evt.type, evt.data);
    return 'applied';
  });
}
