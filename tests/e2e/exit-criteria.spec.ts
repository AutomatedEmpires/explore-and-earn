// Foundation exit criteria (foundation design spec, "Done when"), checked in one serial run on a
// local stack: `pnpm db:local`, local storage and the stub providers from .env.local.example.
//
//   1. A seeker, a host and an operator each sign in and land in their own shell.
//   2. An uploaded JPEG passes scanning and is approved, and its URL loads.
//   3. An uploaded PDF containing EICAR is rejected.
//   4. A `__flag__` text test item goes through the moderation queue to resolved.
//   5. The audit log has identity.account_type_set, orgs.created and trust.decided.
//
// Run it (desktop Chromium only: the host Owner and the operator need a passkey, which the test
// registers with Chromium's virtual WebAuthn authenticator):
//   pnpm db:local                  in its own shell, then once: pnpm db:migrate
//   pnpm e2e tests/e2e/exit-criteria.spec.ts --project chromium
//
// Clerk: a development instance. The keys come from the environment or .env.local (the dev
// server reads them there too), or else from the file keyless mode writes,
// .clerk/.tmp/keyless.json. The run creates three throwaway `+clerk_test` users in that instance
// and deletes them, and the host's organization, when it ends. It never runs on a production key.
//
// On Windows, Defender can delete the EICAR file the local storage adapter writes to
// .data/storage/quarantine before the scan reads it; exclude .data/storage or run on Linux.
import { existsSync, readFileSync } from 'node:fs';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import postgres from 'postgres';
import { z } from 'zod';
import { pdfWithEicar } from '../fixtures/media/eicar';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const KEYLESS_FILE = '.clerk/.tmp/keyless.json';
const CLERK_API = 'https://api.clerk.com/v1';
const JPEG = new Uint8Array(readFileSync('tests/fixtures/media/gps.jpg'));
const ORG_NAME = 'Kettle Ridge Lodge';

/** Accessible names the shells and the operator console expose (spec sections 11 and 12). */
const UI = {
  seekerHome: 'Seek',
  hostHome: 'Home',
  consoleQueues: 'Review queues',
  createTestItem: 'Create test item',
  claim: 'Claim',
  note: 'Note',
  addNote: 'Add note',
  approve: 'Approve',
} as const;

// --- Environment and Clerk -------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (copy .env.local.example to .env.local)`);
  return value;
}

type ClerkKeys = { publishableKey: string; secretKey: string };

const keylessSchema = z.object({ publishableKey: z.string().min(1), secretKey: z.string().min(1) });

function clerkKeys(): ClerkKeys {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  let keys: ClerkKeys | null = publishableKey && secretKey ? { publishableKey, secretKey } : null;
  if (!keys && existsSync(KEYLESS_FILE)) {
    const parsed = keylessSchema.safeParse(JSON.parse(readFileSync(KEYLESS_FILE, 'utf8')));
    if (parsed.success) keys = parsed.data;
  }
  if (!keys) {
    throw new Error(
      'No Clerk keys. Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY in .env.local ' +
        `(a development instance), or run \`pnpm dev\` once so keyless mode writes ${KEYLESS_FILE}.`,
    );
  }
  if (!keys.secretKey.startsWith('sk_test_')) {
    throw new Error('The exit-criteria run only uses a Clerk development instance (sk_test_ key)');
  }
  return keys;
}

let keys: ClerkKeys | null = null;

/** Clerk's Backend API, for creating and removing the run's throwaway users. */
async function clerkApi(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown) {
  if (!keys) throw new Error('Clerk is not set up');
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: { authorization: `Bearer ${keys.secretKey}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Clerk ${method} ${path}: ${res.status} ${text}`);
  return text ? (JSON.parse(text) as unknown) : null;
}

const clerkUserSchema = z.object({ id: z.string() });

async function createClerkUser(email: string, publicMetadata: Record<string, unknown> = {}) {
  const created = await clerkApi('POST', '/users', {
    email_address: [email],
    skip_password_requirement: true,
    public_metadata: publicMetadata,
  });
  return clerkUserSchema.parse(created).id;
}

/** Adds a passkey to the signed-in user, made by Chromium's virtual authenticator. */
async function addPasskey(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await clerk.loaded({ page });
  await page.evaluate(async () => {
    const user = window.Clerk.user;
    if (!user) throw new Error('Not signed in');
    await user.createPasskey();
  });
}

// --- Database --------------------------------------------------------------------------------

let sql: postgres.Sql | null = null;

function db(): postgres.Sql {
  if (!sql) throw new Error('The database is not connected');
  return sql;
}

async function userIdFor(clerkUserId: string): Promise<string> {
  const q = db();
  const [row] = await q<{ id: string }[]>`
    select id from app.users where clerk_user_id = ${clerkUserId}`;
  if (!row) throw new Error(`No app.users row for ${clerkUserId}`);
  return row.id;
}

type MediaRow = { status: string; bucket: string | null; rejection_reason: string | null };

async function mediaRow(id: string): Promise<MediaRow | undefined> {
  const q = db();
  const [row] = await q<MediaRow[]>`
    select status, bucket, rejection_reason from app.media where id = ${id}`;
  return row;
}

type ItemRow = { id: string; queue: string; decision: string | null };

/** The newest test review item opened since `since`, with its classifier decision. */
async function newestTestItem(since: Date): Promise<ItemRow | null> {
  const q = db();
  const [row] = await q<ItemRow[]>`
    select ri.id, ri.queue, tc.decision
    from app.review_items ri left join app.trust_checks tc on tc.id = ri.check_id
    where ri.subject_type = 'test_item' and ri.created_at >= ${since}
    order by ri.created_at desc limit 1`;
  return row ?? null;
}

type Outcome = { status: string; resolution: string | null; decided_by: string | null };

async function itemOutcome(id: string): Promise<Outcome | undefined> {
  const q = db();
  const [row] = await q<Outcome[]>`
    select status, resolution, decided_by from app.review_items where id = ${id}`;
  return row;
}

async function noteCount(itemId: string): Promise<number> {
  const q = db();
  const [row] = await q<{ n: number }[]>`
    select count(*)::int as n from app.review_notes where item_id = ${itemId}`;
  return row?.n ?? 0;
}

async function auditCount(action: string, subjectId: string): Promise<number> {
  const q = db();
  const [row] = await q<{ n: number }[]>`
    select count(*)::int as n from app.audit_events
    where action = ${action} and subject_id = ${subjectId}`;
  return row?.n ?? 0;
}

// --- Browser ---------------------------------------------------------------------------------

type Fetched = { status: number; contentType: string; size: number; body: unknown };

/**
 * fetch() from inside the page, so the request carries the page's Clerk session and Origin the
 * way the app's own screens send them.
 */
async function browserFetch(
  page: Page,
  path: string,
  init: { method?: 'GET' | 'POST' | 'PUT'; json?: unknown; bytes?: Uint8Array; type?: string } = {},
): Promise<Fetched> {
  return page.evaluate(
    async ({ path, method, json, base64, type }) => {
      const headers: Record<string, string> = {};
      let body: string | Uint8Array<ArrayBuffer> | undefined;
      if (json !== undefined) {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(json);
      } else if (base64 !== undefined) {
        headers['content-type'] = type ?? 'application/octet-stream';
        body = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      }
      const res = await fetch(path, { method, headers, body });
      const contentType = res.headers.get('content-type') ?? '';
      const buffer = await res.arrayBuffer();
      const parsed: unknown = contentType.includes('json')
        ? JSON.parse(new TextDecoder().decode(buffer))
        : null;
      return { status: res.status, contentType, size: buffer.byteLength, body: parsed };
    },
    {
      path,
      method: init.method ?? 'GET',
      json: init.json,
      base64: init.bytes ? Buffer.from(init.bytes).toString('base64') : undefined,
      type: init.type,
    },
  );
}

type Actor = { clerkUserId: string; email: string; context: BrowserContext; page: Page };

async function signIn(
  browser: Browser,
  baseURL: string,
  clerkUserId: string,
  email: string,
): Promise<Actor> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto('/sign-in');
  await clerk.signIn({ page, emailAddress: email });
  return { clerkUserId, email, context, page };
}

/** A link in one of the page's navigation landmarks (top bar, bottom tabs or sidebar). */
function navLink(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true }).first();
}

/** Runs the worker the way Supabase Cron does, until the file's scan has finished. */
async function scanned(request: APIRequestContext, mediaId: string): Promise<MediaRow> {
  const secret = requireEnv('JOBS_SECRET');
  await expect
    .poll(
      async () => {
        const res = await request.post('/api/jobs/run', { headers: { 'x-jobs-secret': secret } });
        expect(res.status()).toBe(200);
        return (await mediaRow(mediaId))?.status;
      },
      { timeout: 60_000, intervals: [500, 1_000, 2_000] },
    )
    .toMatch(/^(approved|rejected|in_review|blocked)$/);
  const row = await mediaRow(mediaId);
  if (!row) throw new Error(`media ${mediaId} disappeared`);
  return row;
}

const uploadSchema = z.object({ mediaId: z.uuid(), uploadUrl: z.string(), token: z.string() });

/** Requests a signed URL, uploads the bytes to it and marks the upload complete. */
async function upload(page: Page, kind: string, mime: string, bytes: Uint8Array): Promise<string> {
  const requested = await browserFetch(page, '/api/v1/media/uploads', {
    method: 'POST',
    json: { kind, mime, sizeBytes: bytes.byteLength },
  });
  expect(requested.status, JSON.stringify(requested.body)).toBe(200);
  const { mediaId, uploadUrl } = uploadSchema.parse(requested.body);

  const put = await browserFetch(page, uploadUrl, { method: 'PUT', bytes, type: mime });
  expect(put.status, 'upload to the signed URL').toBe(200);

  const done = await browserFetch(page, `/api/v1/media/uploads/${mediaId}/complete`, {
    method: 'POST',
  });
  expect(done.status, JSON.stringify(done.body)).toBe(204);
  return mediaId;
}

// --- The run ---------------------------------------------------------------------------------

const run = Date.now().toString(36);
const emailFor = (role: string) => `exit-${role}-${run}+clerk_test@example.com`;
const actors = new Map<'seeker' | 'host' | 'operator', Actor>();
const clerkUserIds: string[] = [];
const ids: { seeker?: string; host?: string; operator?: string; org?: string; item?: string } = {};
let hostClerkOrgId: string | null = null;

function actor(role: 'seeker' | 'host' | 'operator'): Actor {
  const found = actors.get(role);
  if (!found) throw new Error(`The ${role} has not signed in (an earlier step failed)`);
  return found;
}

function adminURL(): string {
  return `http://${requireEnv('ADMIN_HOST')}`;
}

test.describe('Foundation exit criteria', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(({ isMobile }) => isMobile, 'Desktop Chromium only (virtual passkeys)');

  let appURL = 'http://localhost:3000';

  test.beforeAll(async ({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Needs Chromium for virtual passkeys');
    appURL = testInfo.project.use.baseURL ?? appURL;

    keys = clerkKeys();
    // clerk.signIn({ emailAddress }) creates its sign-in tickets with this key.
    process.env.CLERK_SECRET_KEY = keys.secretKey;
    await clerkSetup({ ...keys, dotenv: false });

    sql = postgres(requireEnv('DATABASE_URL'), { max: 2, onnotice: () => {} });
    try {
      await sql`select 1 from app.schema_migrations limit 1`;
    } catch (err) {
      throw new Error('No migrated database: start `pnpm db:local`, then run `pnpm db:migrate`', {
        cause: err,
      });
    }
  });

  test.afterAll(async () => {
    for (const a of actors.values()) await a.context.close();
    if (keys) {
      if (hostClerkOrgId) {
        await clerkApi('DELETE', `/organizations/${hostClerkOrgId}`).catch(() => {});
      }
      for (const id of clerkUserIds) await clerkApi('DELETE', `/users/${id}`).catch(() => {});
    }
    await sql?.end();
  });

  test('a seeker signs in, onboards and lands in the seeker shell', async ({ browser }) => {
    const clerkUserId = await createClerkUser(emailFor('seeker'));
    clerkUserIds.push(clerkUserId);
    const seeker = await signIn(browser, appURL, clerkUserId, emailFor('seeker'));
    actors.set('seeker', seeker);

    const onboarded = await browserFetch(seeker.page, '/api/v1/onboarding', {
      method: 'POST',
      json: { accountType: 'seeker', adultAttested: true },
    });
    expect(onboarded.status, JSON.stringify(onboarded.body)).toBe(200);
    expect(onboarded.body).toEqual({ redirectTo: '/' });

    await seeker.page.goto('/');
    await expect(navLink(seeker.page, UI.seekerHome)).toHaveAttribute('aria-current', 'page');
    ids.seeker = await userIdFor(clerkUserId);
  });

  test('a host signs in, creates an organization and lands in the host workspace', async ({
    browser,
  }) => {
    const clerkUserId = await createClerkUser(emailFor('host'));
    clerkUserIds.push(clerkUserId);
    const host = await signIn(browser, appURL, clerkUserId, emailFor('host'));
    actors.set('host', host);
    // An Owner needs a passkey or two-step sign-in before the workspace opens.
    await addPasskey(host.page);

    const onboarded = await browserFetch(host.page, '/api/v1/onboarding', {
      method: 'POST',
      json: { accountType: 'host', organizationName: ORG_NAME },
    });
    expect(onboarded.status, JSON.stringify(onboarded.body)).toBe(200);
    expect(onboarded.body).toEqual({ redirectTo: '/host' });

    await host.page.goto('/host');
    await expect(host.page).toHaveURL(`${appURL}/host`);
    await expect(navLink(host.page, UI.hostHome)).toBeVisible();

    ids.host = await userIdFor(clerkUserId);
    const q = db();
    const [org] = await q<{ id: string; clerk_org_id: string }[]>`
      select id, clerk_org_id from app.organizations
      where owner_user_id = ${ids.host} order by created_at desc limit 1`;
    expect(org, 'the host owns an organization').toBeDefined();
    ids.org = org?.id;
    hostClerkOrgId = org?.clerk_org_id ?? null;
  });

  test('an operator signs in on the admin host and lands in the operator console', async ({
    browser,
  }) => {
    // What an Owner invitation (`pnpm ops:bootstrap-owner`) gives the user who accepts it.
    const clerkUserId = await createClerkUser(emailFor('operator'), {
      account_type: 'operator',
      operator_role: 'owner',
    });
    clerkUserIds.push(clerkUserId);
    const operator = await signIn(browser, adminURL(), clerkUserId, emailFor('operator'));
    actors.set('operator', operator);
    // The console needs a passkey.
    await addPasskey(operator.page);

    await operator.page.goto('/');
    await expect(operator.page).toHaveURL(`${adminURL()}/`);
    await expect(navLink(operator.page, UI.consoleQueues)).toBeVisible();

    ids.operator = await userIdFor(clerkUserId);
    const q = db();
    const [row] = await q<{ role: string }[]>`
      select role from app.operators where user_id = ${ids.operator}`;
    expect(row?.role).toBe('owner');
  });

  test('an uploaded JPEG passes scanning, is approved and its URL loads', async ({ request }) => {
    const { page } = actor('seeker');
    const mediaId = await upload(page, 'avatar', 'image/jpeg', JPEG);

    expect(await scanned(request, mediaId)).toMatchObject({
      status: 'approved',
      bucket: 'media-public',
    });

    const located = await browserFetch(page, `/api/v1/media/${mediaId}/url`);
    expect(located.status, JSON.stringify(located.body)).toBe(200);
    const { url } = z.object({ url: z.string() }).parse(located.body);

    const image = await browserFetch(page, url);
    expect(image.status).toBe(200);
    expect(image.contentType).toBe('image/webp');
    expect(image.size).toBeGreaterThan(0);
  });

  test('an uploaded PDF containing EICAR is rejected', async ({ request }) => {
    const { page } = actor('seeker');
    const mediaId = await upload(page, 'resume', 'application/pdf', pdfWithEicar());

    expect(await scanned(request, mediaId)).toMatchObject({
      status: 'rejected',
      rejection_reason: 'malware',
    });
    const located = await browserFetch(page, `/api/v1/media/${mediaId}/url`);
    expect(located.status).toBe(404);
  });

  test('a __flag__ test item goes through the moderation queue to resolved', async () => {
    const { page } = actor('operator');
    const since = new Date();

    await page.goto('/queues');
    await page.getByRole('button', { name: UI.createTestItem }).click();

    await expect.poll(() => newestTestItem(since), { timeout: 15_000 }).not.toBeNull();
    const item = await newestTestItem(since);
    // The stub classifier scores `__flag__` between the thresholds, so it waits for a person.
    expect(item).toMatchObject({ queue: 'moderation', decision: 'needs_review' });
    const itemId = item?.id ?? '';
    ids.item = itemId;

    await page.goto(`/queues/${itemId}`);
    await page.getByRole('button', { name: UI.claim }).click();
    await page.getByRole('textbox', { name: UI.note }).fill('Checked in the exit-criteria run.');
    await page.getByRole('button', { name: UI.addNote }).click();
    await page.getByRole('button', { name: UI.approve }).click();

    await expect
      .poll(() => itemOutcome(itemId))
      .toEqual({ status: 'resolved', resolution: 'approve', decided_by: ids.operator });
    expect(await noteCount(itemId)).toBe(1);
  });

  test('the audit log has account_type_set, orgs.created and trust.decided', async () => {
    for (const userId of [ids.seeker, ids.host]) {
      expect(await auditCount('identity.account_type_set', userId ?? '')).toBe(1);
    }
    expect(await auditCount('orgs.created', ids.org ?? '')).toBe(1);
    expect(await auditCount('trust.decided', ids.item ?? '')).toBe(1);

    // And the console's audit viewer shows the decision.
    const { page } = actor('operator');
    await page.goto('/audit');
    await expect(page.getByText('trust.decided').first()).toBeVisible();
  });
});
