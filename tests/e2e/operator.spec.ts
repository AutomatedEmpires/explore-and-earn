// The operator console (Foundation Task 24), on the admin host, against a local stack:
// `pnpm db:local` (then `pnpm db:migrate`), local storage and the stub providers.
//
//   1. An Owner operator creates a `__flag__` test item from the dev-only "Create test item"
//      button. It waits in the moderation queue; the operator claims it, adds a note and
//      approves it. The item is resolved and the audit viewer shows trust.decided.
//   2. A host user who visits the admin host gets a 404.
//
// Run it (desktop Chromium only):
//   pnpm db:local                  in its own shell, then once: pnpm db:migrate
//   pnpm e2e tests/e2e/operator.spec.ts --project chromium
//
// Passkeys: the console needs one. The test registers it with Chromium's virtual WebAuthn
// authenticator, which needs passkeys enabled on the Clerk instance. A keyless development
// instance has them off; there, run the dev server (and this test) with
// ALLOW_OPERATOR_WITHOUT_PASSKEY=true, and the passkey step is skipped. Prod refuses that flag.
//
// Clerk: a development instance. The keys come from the environment or .env.local, or else
// from the file keyless mode writes, .clerk/.tmp/keyless.json. The run creates two throwaway
// `+clerk_test` users in that instance and deletes them when it ends. It never runs on a
// production key.
import { existsSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';
import { z } from 'zod';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const KEYLESS_FILE = '.clerk/.tmp/keyless.json';
/** Must match the dev server's setting (see the header). */
const PASSKEY_OPTIONAL = process.env.ALLOW_OPERATOR_WITHOUT_PASSKEY === 'true';
const CLERK_API = 'https://api.clerk.com/v1';

// --- Clerk -----------------------------------------------------------------------------------

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
    throw new Error('The operator console run only uses a Clerk development instance');
  }
  return keys;
}

let keys: ClerkKeys | null = null;

async function clerkApi(method: 'POST' | 'DELETE', path: string, body?: unknown) {
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

async function createClerkUser(email: string, publicMetadata: Record<string, unknown> = {}) {
  const created = await clerkApi('POST', '/users', {
    email_address: [email],
    skip_password_requirement: true,
    public_metadata: publicMetadata,
  });
  return z.object({ id: z.string() }).parse(created).id;
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
    // Clerk refuses passkeys in automated browsers (navigator.webdriver); the authenticator
    // here is Chromium's virtual one, so let Clerk use it.
    Object.defineProperty(navigator, 'webdriver', { configurable: true, get: () => false });
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

async function userIdFor(clerkUserId: string): Promise<string | null> {
  const [row] = await db()<{ id: string }[]>`
    select id from app.users where clerk_user_id = ${clerkUserId}`;
  return row?.id ?? null;
}

type ItemRow = { id: string; queue: string; status: string; decision: string | null };

/** The newest test review item opened since `since`, with its classifier decision. */
async function newestTestItem(since: Date): Promise<ItemRow | null> {
  const [row] = await db()<ItemRow[]>`
    select ri.id, ri.queue, ri.status, tc.decision
    from app.review_items ri left join app.trust_checks tc on tc.id = ri.check_id
    where ri.subject_type = 'test_item' and ri.created_at >= ${since}
    order by ri.created_at desc limit 1`;
  return row ?? null;
}

type Outcome = {
  status: string;
  resolution: string | null;
  decided_by: string | null;
  assignee_operator_id: string | null;
};

async function itemOutcome(id: string): Promise<Outcome | undefined> {
  const [row] = await db()<Outcome[]>`
    select status, resolution, decided_by, assignee_operator_id
    from app.review_items where id = ${id}`;
  return row;
}

async function notes(itemId: string): Promise<string[]> {
  const rows = await db()<{ body: string }[]>`
    select body from app.review_notes where item_id = ${itemId} order by created_at`;
  return rows.map((r) => r.body);
}

// --- Browser ---------------------------------------------------------------------------------

type Actor = { clerkUserId: string; context: BrowserContext; page: Page };

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
  // Clerk refreshes the page once the session is set; let that finish first.
  await page.waitForLoadState('networkidle');
  return { clerkUserId, context, page };
}

/**
 * page.goto, retried when Clerk's post-sign-in refresh (or a handshake redirect) interrupts it
 * with net::ERR_ABORTED.
 */
async function visit(page: Page, path: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(path);
    } catch (err) {
      if (attempt >= 3 || !String(err).includes('ERR_ABORTED')) throw err;
      await page.waitForLoadState('networkidle');
    }
  }
}

/** Serious and critical axe violations, outside Clerk's own development-mode widgets. */
async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).exclude('[class*="cl-internal"]').analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

function adminURL(): string {
  const host = process.env.ADMIN_HOST;
  if (!host) throw new Error('ADMIN_HOST is not set (copy .env.local.example to .env.local)');
  return `http://${host}`;
}

// --- The run ---------------------------------------------------------------------------------

const run = Date.now().toString(36);
const emailFor = (role: string) => `console-${role}-${run}+clerk_test@example.com`;
const clerkUserIds: string[] = [];
const contexts: BrowserContext[] = [];

test.describe('Operator console', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 });
  test.skip(({ isMobile }) => isMobile, 'Desktop Chromium only (virtual passkeys)');

  test.beforeAll(async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Needs Chromium for virtual passkeys');
    keys = clerkKeys();
    // clerk.signIn({ emailAddress }) creates its sign-in tickets with this key.
    process.env.CLERK_SECRET_KEY = keys.secretKey;
    await clerkSetup({ ...keys, dotenv: false });

    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set (copy .env.local.example to .env.local)');
    sql = postgres(url, { max: 2, onnotice: () => {} });
    try {
      await sql`select 1 from app.schema_migrations limit 1`;
    } catch (err) {
      throw new Error('No migrated database: start `pnpm db:local`, then run `pnpm db:migrate`', {
        cause: err,
      });
    }
  });

  test.afterAll(async () => {
    for (const context of contexts) await context.close();
    if (keys) {
      for (const id of clerkUserIds) await clerkApi('DELETE', `/users/${id}`).catch(() => {});
    }
    // What Clerk's user.deleted webhook (which cannot reach a local server) would do, so the
    // run's operators don't linger in routing and the mention picker.
    if (sql && clerkUserIds.length > 0) {
      await sql`update app.users set deleted_at = now() where clerk_user_id in ${sql(clerkUserIds)}`;
    }
    await sql?.end();
  });

  test('an Owner reviews a flagged test item from the queue to resolved', async ({ browser }) => {
    // What an Owner invitation (`pnpm ops:bootstrap-owner`) gives the user who accepts it.
    const clerkUserId = await createClerkUser(emailFor('owner'), {
      account_type: 'operator',
      operator_role: 'owner',
    });
    clerkUserIds.push(clerkUserId);
    const { page, context } = await signIn(browser, adminURL(), clerkUserId, emailFor('owner'));
    contexts.push(context);

    if (!PASSKEY_OPTIONAL) {
      // Without a passkey the console sends the operator to set one up.
      await visit(page, '/');
      await expect(page).toHaveURL(/\/passkey$/);
      await expect(page.getByRole('heading', { name: 'Add a passkey' })).toBeVisible();
      await addPasskey(page);
    }

    await visit(page, '/');
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Console' });
    await expect(nav.getByRole('link', { name: 'Review queues' })).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
    const operatorId = await userIdFor(clerkUserId);
    expect(operatorId).not.toBeNull();

    // A flagged test item from the dev-only button.
    const since = new Date();
    await nav.getByRole('link', { name: 'Review queues' }).click();
    await expect(page.getByRole('heading', { name: 'Review queues', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Create test item' }).click();
    await expect.poll(() => newestTestItem(since), { timeout: 15_000 }).not.toBeNull();
    const item = await newestTestItem(since);
    // The stub classifier scores `__flag__` between the thresholds, so it waits for a person.
    expect(item).toMatchObject({ queue: 'moderation', decision: 'needs_review' });
    const itemId = item?.id ?? '';

    // It is listed in the moderation queue.
    await visit(page, '/queues?queue=moderation');
    const row = page.getByRole('row').filter({ has: page.locator(`a[href="/queues/${itemId}"]`) });
    await expect(row).toBeVisible();

    // Claim, note, approve.
    await visit(page, `/queues/${itemId}`);
    await expect(page.getByText('__flag__').first()).toBeVisible();
    if ((await itemOutcome(itemId))?.assignee_operator_id !== operatorId) {
      await page.getByRole('button', { name: 'Claim' }).click();
      await expect
        .poll(async () => (await itemOutcome(itemId))?.assignee_operator_id)
        .toBe(operatorId);
    }
    await expect(page.getByText('Assigned to you')).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    await page.getByRole('textbox', { name: 'Note' }).fill('Checked: a test item, nothing wrong.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect.poll(() => notes(itemId)).toEqual(['Checked: a test item, nothing wrong.']);
    await expect(
      page.getByRole('listitem').filter({ hasText: 'Checked: a test item, nothing wrong.' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect
      .poll(() => itemOutcome(itemId))
      .toMatchObject({ status: 'resolved', resolution: 'approve', decided_by: operatorId });
    await expect(page.getByText('Resolved').first()).toBeVisible();

    // The audit viewer shows the decision.
    await visit(page, `/audit?action=trust.decided&subjectId=${itemId}`);
    await expect(page.getByRole('heading', { name: 'Audit log', level: 1 })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'trust.decided' })).toBeVisible();
  });

  test('a host user on the admin host gets a 404', async ({ browser }) => {
    const clerkUserId = await createClerkUser(emailFor('host'));
    clerkUserIds.push(clerkUserId);
    const { page, context } = await signIn(browser, adminURL(), clerkUserId, emailFor('host'));
    contexts.push(context);

    // The first console request provisions the user; make them a host.
    const first = await visit(page, '/');
    expect(first?.status()).toBe(404);
    const userId = await userIdFor(clerkUserId);
    expect(userId).not.toBeNull();
    await db()`update app.users set account_type = 'host' where id = ${userId}`;

    for (const path of ['/', '/queues', '/operators', '/settings', '/audit']) {
      const res = await visit(page, path);
      expect(res?.status(), path).toBe(404);
    }
    await expect(page.getByRole('navigation', { name: 'Console' })).toHaveCount(0);
  });
});
