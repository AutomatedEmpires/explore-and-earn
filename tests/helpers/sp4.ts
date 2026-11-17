// Route-test helpers for SP4 (SP4 plan Task 6). Every route test starts with:
//
//   vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
//   vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());
//
// then `const t = setupRouteDb()` at the top level, and asSeeker(user) / asHost(ctx) / asUser(user)
// before each request. Route handlers then read the PGlite test database (through the mocked
// getDb) and the signed-in user the test chose (through the mocked guards).
//
// This file never value-imports @/lib/db or @/server/guards: it is loaded from inside their mock
// factories, so importing them here would import the mocks it is building.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, vi, type Mock } from 'vitest';
import type { Db } from '@/lib/db';
import { unauthorized } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { CurrentUser, OrgRole } from '@/modules/identity';
import type { RouteHandler } from '@/server/api';
import type { HostContext } from '@/server/guards';
import { createTestDb, type TestDb } from './db';

const state: { db: Db | undefined } = { db: undefined };

/** The mocked `@/lib/db`: the real module, with getDb() returning the route test's database. */
export async function mockDbModule<M extends object>(orig: () => Promise<M>): Promise<M> {
  const actual = await orig();
  return {
    ...actual,
    getDb: () => {
      if (!state.db) throw new Error('test db not ready: call setupRouteDb() at the top level');
      return state.db;
    },
  };
}

type GuardMocks = {
  requireUser: Mock<() => Promise<CurrentUser>>;
  requireSeeker: Mock<() => Promise<CurrentUser>>;
  requireHost: Mock<() => Promise<HostContext>>;
  requireOperator: Mock<() => Promise<unknown>>;
};

let guards: GuardMocks | undefined;

/**
 * The mocked `@/server/guards`. Each guard rejects (as a signed-out request would) until a test
 * signs someone in with asUser, asSeeker or asHost.
 */
export function guardMocks(): GuardMocks {
  const signedOut = async (): Promise<never> => {
    throw unauthorized('Sign in required');
  };
  guards ??= {
    requireUser: vi.fn(signedOut),
    requireSeeker: vi.fn(signedOut),
    requireHost: vi.fn(signedOut),
    requireOperator: vi.fn(signedOut),
  };
  return guards;
}

function mocks(): GuardMocks {
  if (!guards) throw new Error('mock @/server/guards with guardMocks() first');
  return guards;
}

/** Signs `u` in as a user of any account type (auth: 'user'). */
export function asUser(u: CurrentUser): void {
  mocks().requireUser.mockResolvedValue(u);
}

/** Signs `u` in as a seeker (auth: 'seeker' and 'user'). */
export function asSeeker(u: CurrentUser): void {
  mocks().requireSeeker.mockResolvedValue(u);
  mocks().requireUser.mockResolvedValue(u);
}

/** Signs a host member in (auth: 'host' and 'user'). */
export function asHost(ctx: HostContext): void {
  mocks().requireHost.mockResolvedValue(ctx);
  mocks().requireUser.mockResolvedValue(ctx.user);
}

/** A PGlite test database for the file, served to route handlers by the mocked getDb(). */
export function setupRouteDb(): { readonly db: Db } {
  let t: TestDb | undefined;
  beforeAll(async () => {
    t = await createTestDb();
    state.db = t.db;
  });
  afterAll(async () => {
    state.db = undefined;
    await t?.close();
  });
  return {
    get db(): Db {
      if (!t) throw new Error('route test db not ready');
      return t.db;
    },
  };
}

/** The app origin route tests send from, so the CSRF origin check passes. */
export const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

/** A request to the app from its own origin, with a JSON body when one is given. */
export function request(
  method: string,
  path: string,
  i: { body?: unknown; query?: Record<string, string> } = {},
): Request {
  const url = new URL(path, APP_URL);
  for (const [k, v] of Object.entries(i.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = { origin: APP_URL };
  if (i.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(url, {
    method,
    headers,
    body: i.body === undefined ? undefined : JSON.stringify(i.body),
  });
}

/** Calls a route handler with dynamic params and reads back status, JSON body and headers. */
export async function call(
  handler: RouteHandler,
  req: Request,
  params: Record<string, string> = {},
): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await handler(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let body: unknown = null;
  if (text !== '') {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = text;
    }
  }
  return { status: res.status, body, headers: res.headers };
}

const short = () => newId().replace(/-/g, '').slice(-10);

/** A user row (no Clerk). Seekers get the 18+ attestation the table requires. */
export async function seedUser(
  db: Db,
  i: { accountType: 'seeker' | 'host'; email?: string },
): Promise<CurrentUser> {
  const id = newId();
  const clerkUserId = `user_${short()}`;
  const email = (i.email ?? `${i.accountType}-${short()}@example.test`).toLowerCase();
  await db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type, adult_attested_at)
    values (${id}, ${clerkUserId}, ${email}, ${i.accountType === 'seeker' ? 'Maya' : 'Sam'},
      ${i.accountType}, ${i.accountType === 'seeker' ? sql`now()` : sql`null`})
  `);
  return { id, clerkUserId, accountType: i.accountType, email };
}

/** An active organization with no members yet. */
export async function seedOrg(db: Db, i: { name?: string } = {}): Promise<{ orgId: string }> {
  const orgId = newId();
  const slug = `org-${short()}`;
  await db.execute(sql`
    insert into app.organizations (id, clerk_org_id, name, slug)
    values (${orgId}, ${`org_${short()}`}, ${i.name ?? 'Kettle Ridge Lodge'}, ${slug})
  `);
  return { orgId };
}

/** Makes `user` a member of `orgId` with `role` (recruiters see every listing). */
export async function seedMember(
  db: Db,
  orgId: string,
  user: CurrentUser,
  role: OrgRole,
): Promise<HostContext & { membershipId: string }> {
  const membershipId = newId();
  await db.execute(sql`
    insert into app.org_memberships (id, org_id, user_id, role)
    values (${membershipId}, ${orgId}, ${user.id}, ${role})
  `);
  if (role === 'owner') {
    await db.execute(
      sql`update app.organizations set owner_user_id = ${user.id} where id = ${orgId}`,
    );
  }
  return { user, orgId, role, membershipId };
}
