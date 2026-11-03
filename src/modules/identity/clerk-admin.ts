// The Clerk Backend API calls our domain code makes, behind an interface so tests use a fake.
import type { UserJSON } from '@clerk/nextjs/server';

export type OperatorInviteRole = 'owner' | 'operator';

export interface ClerkAdmin {
  /** Deep-merges `md` into the user's public metadata. */
  setPublicMetadata(clerkUserId: string, md: Record<string, unknown>): Promise<void>;
  /** Creates an organization in Clerk; `createdBy` (a Clerk user ID) becomes its first admin. */
  createOrganization(input: { name: string; createdBy: string }): Promise<{ clerkOrgId: string }>;
  hasPasskey(clerkUserId: string): Promise<boolean>;
  /** A passkey or two-step sign-in. */
  hasStrongAuth(clerkUserId: string): Promise<boolean>;
  /** Emails a sign-up invitation that makes the new user an operator with `role`. */
  inviteOperator(email: string, role: OperatorInviteRole): Promise<void>;
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
      const org = await (await client()).organizations.createOrganization({ name, createdBy });
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
  };
}

type FakeOrg = { clerkOrgId: string; name: string; createdBy: string };

export type FakeClerkAdmin = ClerkAdmin & {
  /** Every call, in order. */
  calls: { method: keyof ClerkAdmin; args: unknown[] }[];
  /** Public metadata per Clerk user ID, merged as Clerk merges it. */
  metadata: Map<string, Record<string, unknown>>;
  organizations: FakeOrg[];
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
