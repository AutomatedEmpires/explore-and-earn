// The Clerk Backend API calls our domain code makes, behind an interface so tests use a fake.
// These two constants live here, not in the orgs barrel: orgs loads notifications, and
// notifications loads identity. Importing orgs from this file made that a cycle and left
// defineType uninitialized.
import type { UserJSON } from '@clerk/nextjs/server';

/** Clerk public-metadata mark on every organization this server creates. */
export const CREATED_VIA_KEY = 'created_via';
export const CREATED_VIA_APP = 'app';

export type OperatorInviteRole = 'owner' | 'operator';

/** Clerk organization roles for host members (the Owner is Clerk's `org:admin` too). */
export type ClerkOrgRole = 'org:admin' | 'org:recruiter' | 'org:billing';

export interface ClerkAdmin {
  /** Deep-merges `md` into the user's public metadata. */
  setPublicMetadata(clerkUserId: string, md: Record<string, unknown>): Promise<void>;
  /**
   * Creates an organization in Clerk, marked as created by the app in its public metadata;
   * `createdBy` (a Clerk user ID) becomes its first admin.
   */
  createOrganization(input: { name: string; createdBy: string }): Promise<{ clerkOrgId: string }>;
  hasPasskey(clerkUserId: string): Promise<boolean>;
  /** A passkey or two-step sign-in. */
  hasStrongAuth(clerkUserId: string): Promise<boolean>;
  /** Emails a sign-up invitation that makes the new user an operator with `role`. */
  inviteOperator(email: string, role: OperatorInviteRole): Promise<void>;
  /** Adds a user to an organization with `clerkRole` (SP2 team invitations). */
  addMembership(clerkOrgId: string, clerkUserId: string, clerkRole: ClerkOrgRole): Promise<void>;
  removeMembership(clerkOrgId: string, clerkUserId: string): Promise<void>;
  updateMembershipRole(
    clerkOrgId: string,
    clerkUserId: string,
    clerkRole: ClerkOrgRole,
  ): Promise<void>;
  deleteOrganization(clerkOrgId: string): Promise<void>;
  /** Renames the organization in Clerk, so Clerk's next snapshot doesn't undo a rename here. */
  updateOrganization(clerkOrgId: string, patch: { name: string }): Promise<void>;
}

/**
 * Whether a Backend API user (`User.raw`) has a registered passkey. The Backend API's user object
 * carries `passkeys`, but the SDK's `UserJSON` type doesn't declare it yet, so it's read untyped.
 */
export function userHasPasskey(
  raw: UserJSON | Record<string, unknown> | null | undefined,
): boolean {
  const passkeys: unknown = raw && 'passkeys' in raw ? raw.passkeys : undefined;
  if (!Array.isArray(passkeys)) return false;
  return passkeys.some((p: unknown) => {
    if (typeof p !== 'object' || p === null) return false;
    const verification: unknown = 'verification' in p ? p.verification : null;
    if (typeof verification !== 'object' || verification === null) return true;
    return !('status' in verification) || verification.status === 'verified';
  });
}

/** A passkey or two-step sign-in (TOTP, SMS codes or backup codes). */
export function userHasStrongAuth(
  raw: UserJSON | Record<string, unknown> | null | undefined,
): boolean {
  if (!raw) return false;
  return raw.two_factor_enabled === true || userHasPasskey(raw);
}

/**
 * The real implementation, on Clerk's Backend API. In a request it uses the request's Clerk
 * instance (keyless in dev); in a script it uses CLERK_SECRET_KEY. The SDK is loaded on first
 * use, so importing this module costs nothing in tests.
 */
export function clerkAdmin(): ClerkAdmin {
  const client = async () => (await import('@clerk/nextjs/server')).clerkClient();
  const rawUser = async (clerkUserId: string) =>
    (await (await client()).users.getUser(clerkUserId)).raw;

  return {
    async setPublicMetadata(clerkUserId, md) {
      await (await client()).users.updateUserMetadata(clerkUserId, { publicMetadata: md });
    },
    async createOrganization({ name, createdBy }) {
      const org = await (
        await client()
      ).organizations.createOrganization({
        name,
        createdBy,
        // Marks it as ours: the webhook only adopts the creator of such an organization as its
        // Owner (orgs.applyClerkOrganization).
        publicMetadata: { [CREATED_VIA_KEY]: CREATED_VIA_APP },
      });
      return { clerkOrgId: org.id };
    },
    async hasPasskey(clerkUserId) {
      return userHasPasskey(await rawUser(clerkUserId));
    },
    async hasStrongAuth(clerkUserId) {
      return userHasStrongAuth(await rawUser(clerkUserId));
    },
    async inviteOperator(email, role) {
      const appUrl = process.env.APP_URL;
      await (
        await client()
      ).invitations.createInvitation({
        emailAddress: email,
        publicMetadata: { account_type: 'operator', operator_role: role },
        notify: true,
        ...(appUrl ? { redirectUrl: new URL('/sign-up', appUrl).toString() } : {}),
      });
    },
    async addMembership(clerkOrgId, clerkUserId, clerkRole) {
      await (
        await client()
      ).organizations.createOrganizationMembership({
        organizationId: clerkOrgId,
        userId: clerkUserId,
        role: clerkRole,
      });
    },
    async removeMembership(clerkOrgId, clerkUserId) {
      await (
        await client()
      ).organizations.deleteOrganizationMembership({
        organizationId: clerkOrgId,
        userId: clerkUserId,
      });
    },
    async updateMembershipRole(clerkOrgId, clerkUserId, clerkRole) {
      await (
        await client()
      ).organizations.updateOrganizationMembership({
        organizationId: clerkOrgId,
        userId: clerkUserId,
        role: clerkRole,
      });
    },
    async deleteOrganization(clerkOrgId) {
      await (await client()).organizations.deleteOrganization(clerkOrgId);
    },
    async updateOrganization(clerkOrgId, patch) {
      await (await client()).organizations.updateOrganization(clerkOrgId, { name: patch.name });
    },
  };
}

type FakeOrg = { clerkOrgId: string; name: string; createdBy: string };
type FakeMembership = { clerkOrgId: string; clerkUserId: string; role: ClerkOrgRole };

export type FakeClerkAdmin = ClerkAdmin & {
  /** Every call, in order. */
  calls: { method: keyof ClerkAdmin; args: unknown[] }[];
  /** Public metadata per Clerk user ID, merged as Clerk merges it. */
  metadata: Map<string, Record<string, unknown>>;
  organizations: FakeOrg[];
  /** Memberships added through addMembership (not the creator's own). */
  memberships: FakeMembership[];
  invitations: { email: string; role: OperatorInviteRole }[];
  /** Clerk user IDs that have a passkey. */
  passkeys: Set<string>;
  /** Clerk user IDs that have two-step sign-in (a passkey also counts as strong). */
  twoStep: Set<string>;
  /** Makes the next call to `method` reject. */
  failNext(method: keyof ClerkAdmin, error?: Error): void;
};

/** An in-memory ClerkAdmin for tests. */
export function makeFakeClerkAdmin(
  opts: {
    passkeys?: string[];
    twoStep?: string[];
    /** Runs after the fake "creates" an organization, before the call returns. */
    onCreateOrganization?: (org: FakeOrg) => Promise<void>;
  } = {},
): FakeClerkAdmin {
  const failures = new Map<keyof ClerkAdmin, Error>();
  let orgCount = 0;

  const fake: FakeClerkAdmin = {
    calls: [],
    metadata: new Map(),
    organizations: [],
    memberships: [],
    invitations: [],
    passkeys: new Set(opts.passkeys),
    twoStep: new Set(opts.twoStep),
    failNext(method, error = new Error(`fake Clerk: ${method} failed`)) {
      failures.set(method, error);
    },

    async setPublicMetadata(clerkUserId, md) {
      call('setPublicMetadata', [clerkUserId, md]);
      fake.metadata.set(clerkUserId, { ...fake.metadata.get(clerkUserId), ...md });
    },
    async createOrganization(input) {
      call('createOrganization', [input]);
      orgCount += 1;
      const org = { clerkOrgId: `org_fake${orgCount}`, ...input };
      fake.organizations.push(org);
      await opts.onCreateOrganization?.(org);
      return { clerkOrgId: org.clerkOrgId };
    },
    async hasPasskey(clerkUserId) {
      call('hasPasskey', [clerkUserId]);
      return fake.passkeys.has(clerkUserId);
    },
    async hasStrongAuth(clerkUserId) {
      call('hasStrongAuth', [clerkUserId]);
      return fake.passkeys.has(clerkUserId) || fake.twoStep.has(clerkUserId);
    },
    async inviteOperator(email, role) {
      call('inviteOperator', [email, role]);
      fake.invitations.push({ email, role });
    },
    async addMembership(clerkOrgId, clerkUserId, clerkRole) {
      call('addMembership', [clerkOrgId, clerkUserId, clerkRole]);
      fake.memberships = fake.memberships.filter(
        (m) => !(m.clerkOrgId === clerkOrgId && m.clerkUserId === clerkUserId),
      );
      fake.memberships.push({ clerkOrgId, clerkUserId, role: clerkRole });
    },
    async removeMembership(clerkOrgId, clerkUserId) {
      call('removeMembership', [clerkOrgId, clerkUserId]);
      fake.memberships = fake.memberships.filter(
        (m) => !(m.clerkOrgId === clerkOrgId && m.clerkUserId === clerkUserId),
      );
    },
    async updateMembershipRole(clerkOrgId, clerkUserId, clerkRole) {
      call('updateMembershipRole', [clerkOrgId, clerkUserId, clerkRole]);
      for (const m of fake.memberships) {
        if (m.clerkOrgId === clerkOrgId && m.clerkUserId === clerkUserId) m.role = clerkRole;
      }
    },
    async deleteOrganization(clerkOrgId) {
      call('deleteOrganization', [clerkOrgId]);
      fake.organizations = fake.organizations.filter((o) => o.clerkOrgId !== clerkOrgId);
      fake.memberships = fake.memberships.filter((m) => m.clerkOrgId !== clerkOrgId);
    },
    async updateOrganization(clerkOrgId, patch) {
      call('updateOrganization', [clerkOrgId, patch]);
      for (const o of fake.organizations) if (o.clerkOrgId === clerkOrgId) o.name = patch.name;
    },
  };

  function call(method: keyof ClerkAdmin, args: unknown[]) {
    fake.calls.push({ method, args });
    const failure = failures.get(method);
    if (failure) {
      failures.delete(method);
      throw failure;
    }
  }

  return fake;
}
