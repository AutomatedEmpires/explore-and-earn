// Re-pulls users, organizations and memberships from Clerk after a restore (SP8 spec 8.11). A
// restored database missed every Clerk webhook since its backup; this passes Clerk's current
// objects through the same code the webhooks use (`handleClerkEvent`), so the rules are the
// same: newer snapshots win, and an erased (tombstoned) user is never re-created.
//
// It is a dry run unless `apply` is true: by default it only lists and counts.
//
// Each object becomes one event whose ID is built from the object's ID and its `updated_at`, so
// running the resync again changes nothing until the object changes in Clerk.
import type {
  OrganizationJSON,
  OrganizationMembershipJSON,
  UserJSON,
} from '@clerk/nextjs/server';
import type { Db } from '@/lib/db';
import { handleClerkEvent } from '@/modules/identity';

export interface ClerkLister {
  users(): AsyncIterable<UserJSON>;
  organizations(): AsyncIterable<OrganizationJSON>;
  memberships(clerkOrgId: string): AsyncIterable<OrganizationMembershipJSON>;
}

export type ResyncResult = {
  /** Objects read from Clerk. */
  users: number;
  orgs: number;
  memberships: number;
  /** Events that changed the database in this run. Always 0 in a dry run. */
  applied: number;
  /** Events the sync refused for good (see the `identity.clerk_webhook_rejected` audit rows). */
  rejected: number;
};

type Versioned = { id: string; updated_at: number };

const eventId = (kind: string, object: Versioned) =>
  `resync:${kind}:${object.id}:${object.updated_at}`;

export async function resyncClerk(
  db: Db,
  clerk: ClerkLister,
  o: { apply?: boolean } = {},
): Promise<ResyncResult> {
  const result: ResyncResult = { users: 0, orgs: 0, memberships: 0, applied: 0, rejected: 0 };

  const pass = async (id: string, type: string, data: unknown): Promise<void> => {
    if (!o.apply) return;
    const outcome = await handleClerkEvent(db, { id, type, data });
    if (outcome === 'applied') result.applied += 1;
    if (outcome === 'rejected') result.rejected += 1;
  };

  for await (const user of clerk.users()) {
    result.users += 1;
    await pass(eventId('user', user), 'user.updated', user);
  }

  // Collected first: memberships are listed per organization.
  const orgIds: string[] = [];
  for await (const org of clerk.organizations()) {
    result.orgs += 1;
    orgIds.push(org.id);
    await pass(eventId('organization', org), 'organization.updated', org);
  }

  for (const orgId of orgIds) {
    for await (const membership of clerk.memberships(orgId)) {
      result.memberships += 1;
      await pass(
        eventId('membership', membership),
        'organizationMembership.updated',
        membership,
      );
    }
  }
  return result;
}

const PAGE_SIZE = 100;

/** Pages through one Backend API list until a short page. */
async function* paged<T>(
  fetchPage: (offset: number) => Promise<{ data: { raw: T | null }[] }>,
): AsyncIterable<T> {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await fetchPage(offset);
    for (const item of data) {
      if (item.raw) yield item.raw;
    }
    if (data.length < PAGE_SIZE) return;
  }
}

/**
 * The Clerk Backend API, paged, oldest first so a page boundary never skips an object created
 * while the resync runs. Uses CLERK_SECRET_KEY; the SDK is loaded on first use.
 */
export function clerkBackendLister(): ClerkLister {
  const client = async () => (await import('@clerk/nextjs/server')).clerkClient();
  return {
    users: () =>
      paged(async (offset) =>
        (await client()).users.getUserList({ limit: PAGE_SIZE, offset, orderBy: '+created_at' }),
      ),
    organizations: () =>
      paged(async (offset) =>
        (await client()).organizations.getOrganizationList({
          limit: PAGE_SIZE,
          offset,
          orderBy: '+created_at',
        }),
      ),
    memberships: (clerkOrgId) =>
      paged(async (offset) =>
        (await client()).organizations.getOrganizationMembershipList({
          organizationId: clerkOrgId,
          limit: PAGE_SIZE,
          offset,
        }),
      ),
  };
}
