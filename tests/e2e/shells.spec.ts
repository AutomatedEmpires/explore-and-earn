// Sign-in, onboarding and the seeker and host shells (foundation plan, Task 23):
//
//   1. A new seeker signs in, chooses "I'm looking for work", confirms 18+ and lands on Seek.
//   2. A new host signs in, chooses "I'm hiring", names "Kettle Ridge Lodge", is asked for a
//      passkey (an Owner needs strong sign-in), adds one and lands on host Home.
//   3. Visiting /onboarding again sends each of them back to their shell.
//   4. Tabbing through either shell reaches every navigation item.
//
// Runs on both projects: desktop (top navigation, sidebar) and mobile (bottom tabs).
//
// Run it against a local stack (see tests/e2e/exit-criteria.spec.ts for the setup):
//   pnpm db:local                  in its own shell, then once: pnpm db:migrate
//   pnpm e2e tests/e2e/shells.spec.ts
//
// Clerk: a development instance only. The keys come from the environment or .env.local, or else
// from the file keyless mode writes, .clerk/.tmp/keyless.json. Each project creates two
// throwaway `+clerk_test` users and deletes them, and the host's organization, when it ends.
// The host steps need Organizations turned on in that instance (a fresh keyless app has them
// off); without them they are skipped, with the reason in the report.
import { existsSync, readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import postgres from 'postgres';
import { z } from 'zod';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const KEYLESS_FILE = '.clerk/.tmp/keyless.json';
const CLERK_API = 'https://api.clerk.com/v1';
const ORG_NAME = 'Kettle Ridge Lodge';
/** After a submit: the API call and, on a dev server, compiling the next page. */
const NAVIGATION = { timeout: 60_000 };

const SEEKER_DESKTOP = ['/', '/swipe', '/map', '/community', '/inbox', '/notifications'];
const SEEKER_MOBILE = ['/community', '/inbox', '/notifications', '/', '/swipe', '/map', '/profile'];
const HOST_DESKTOP = [
  '/host',
  '/host/listings',
  '/host/applicants',
  '/host/candidates',
  '/host/interviews',
  '/host/messages',
  '/host/promote',
  '/host/analytics',
  '/host/host-page',
  '/host/team',
  '/host/billing',
  '/host/settings',
];
const HOST_MOBILE = ['/host', '/host/applicants', '/host/messages', '/host/listings', '/host/more'];

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
    throw new Error('The shells run only uses a Clerk development instance (sk_test_ key)');
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

const ORGS_OFF =
  'The Clerk instance has Organizations turned off (a fresh keyless app does), so a host ' +
  'cannot create their organization. Turn Organizations on (docs/runbooks/foundation-setup.md).';

/** Whether the instance can hold organizations (a read; a host needs one to onboard). */
async function organizationsEnabled(): Promise<boolean> {
  if (!keys) throw new Error('Clerk is not set up');
  const res = await fetch(`${CLERK_API}/organizations?limit=1`, {
    headers: { authorization: `Bearer ${keys.secretKey}` },
  });
  if (res.ok) return true;
  const text = await res.text();
  if (text.includes('organization_not_enabled_in_instance')) return false;
  throw new Error(`Clerk GET /organizations: ${res.status} ${text}`);
}

/** A brand-new Clerk user, with no account type yet. */
async function createClerkUser(email: string): Promise<string> {
  const created = await clerkApi('POST', '/users', {
    email_address: [email],
    skip_password_requirement: true,
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
    // Clerk refuses passkeys when navigator.webdriver is set (it treats the browser as a bot).
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    const user = window.Clerk.user;
    if (!user) throw new Error('Not signed in');
    await user.createPasskey();
  });
}

// --- Helpers ---------------------------------------------------------------------------------

/** The links of the page's visible navigation landmarks, by href. */
function navLink(page: Page, name: string) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true }).first();
}

/** Presses Tab until focus has gone round the page, returning every href it landed on. */
async function hrefsReachedByTab(page: Page, presses = 80): Promise<Set<string>> {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  const reached = new Set<string>();
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab');
    const href = await page.evaluate(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLAnchorElement)) return null;
      return new URL(el.href).pathname;
    });
    if (href) reached.add(href);
  }
  return reached;
}

/** axe finds no serious or critical problems in our own markup (Clerk's widgets excluded). */
async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).exclude('[class*="cl-"]').analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
}

let sql: postgres.Sql | null = null;

async function clerkOrgIdOwnedBy(clerkUserId: string): Promise<string | null> {
  if (!sql) return null;
  const [row] = await sql<{ clerk_org_id: string }[]>`
    select o.clerk_org_id from app.organizations o
    join app.users u on u.id = o.owner_user_id
    where u.clerk_user_id = ${clerkUserId}
    order by o.created_at desc limit 1`;
  return row?.clerk_org_id ?? null;
}

type Actor = { context: BrowserContext; page: Page };

async function signInNewUser(browser: Browser, baseURL: string, email: string): Promise<Actor> {
  // The project's device (desktop, or the phone with its viewport and touch).
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = test.info().project.use;
  const context = await browser.newContext({
    baseURL,
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
  });
  const page = await context.newPage();
  await page.goto('/sign-in');
  // Our page around Clerk's themed sign-in form.
  await expect(page.getByRole('heading', { name: 'Sign in to Explore&Earn' })).toBeVisible();
  await clerk.signIn({ page, emailAddress: email });
  return { context, page };
}

// --- The run ---------------------------------------------------------------------------------

test.describe('Sign-in, onboarding and shells', () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const run = Date.now().toString(36);
  const clerkUserIds: string[] = [];
  const actors: Actor[] = [];
  let seeker: Actor | null = null;
  let host: Actor | null = null;
  let hostClerkUserId = '';
  let appURL = '';
  let mobile = false;
  let orgs = false;

  test.beforeAll(async ({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium', 'Needs Chromium for virtual passkeys');
    appURL = testInfo.project.use.baseURL ?? 'http://localhost:3000';
    mobile = testInfo.project.use.isMobile === true;

    keys = clerkKeys();
    process.env.CLERK_SECRET_KEY = keys.secretKey;
    await clerkSetup({ ...keys, dotenv: false });
    orgs = await organizationsEnabled();
    if (process.env.DATABASE_URL) {
      sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
    }
  });

  test.afterAll(async () => {
    for (const a of actors) await a.context.close();
    if (keys) {
      const orgId = hostClerkUserId ? await clerkOrgIdOwnedBy(hostClerkUserId) : null;
      if (orgId) await clerkApi('DELETE', `/organizations/${orgId}`).catch(() => {});
      for (const id of clerkUserIds) await clerkApi('DELETE', `/users/${id}`).catch(() => {});
    }
    await sql?.end();
  });

  const emailFor = (role: string) =>
    `shells-${role}-${test.info().project.name}-${run}+clerk_test@example.com`;

  test('a new seeker onboards and lands on Seek', async ({ browser }) => {
    const email = emailFor('seeker');
    clerkUserIds.push(await createClerkUser(email));
    seeker = await signInNewUser(browser, appURL, email);
    actors.push(seeker);
    const { page } = seeker;

    // Without an account type, the shell sends them to onboarding.
    await page.goto('/');
    await expect(page).toHaveURL(`${appURL}/onboarding`);
    await expectAccessible(page);

    await page.getByRole('button', { name: /I'm looking for work/ }).click();
    await expect(page.getByText('Work worth going somewhere for.')).toBeVisible();
    const continueButton = page.getByRole('button', { name: 'Continue' });
    await continueButton.click();
    // The 18+ confirmation is required.
    await expect(page).toHaveURL(`${appURL}/onboarding`);
    await page.getByRole('checkbox', { name: "I'm 18 or older" }).check();
    await continueButton.click();

    await expect(page).toHaveURL(`${appURL}/`, NAVIGATION);
    await expect(navLink(page, 'Seek')).toHaveAttribute('aria-current', 'page');
    if (mobile) {
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    }
    await expect(page.getByText('Coming in sub-project 3: Discovery')).toBeVisible();
    await expectAccessible(page);
  });

  test('visiting /onboarding again sends a seeker back to Seek', async () => {
    if (!seeker) throw new Error('An earlier step failed');
    await seeker.page.goto('/onboarding');
    await expect(seeker.page).toHaveURL(`${appURL}/`);
  });

  test('Tab reaches every item of the seeker shell', async () => {
    if (!seeker) throw new Error('An earlier step failed');
    await seeker.page.goto('/');
    const reached = await hrefsReachedByTab(seeker.page);
    for (const href of mobile ? SEEKER_MOBILE : SEEKER_DESKTOP) {
      expect(reached, `Tab reaches ${href}`).toContain(href);
    }
  });

  test('a new host names their organization, adds a passkey and lands on Home', async ({
    browser,
  }) => {
    test.skip(!orgs, ORGS_OFF);
    const email = emailFor('host');
    hostClerkUserId = await createClerkUser(email);
    clerkUserIds.push(hostClerkUserId);
    host = await signInNewUser(browser, appURL, email);
    actors.push(host);
    const { page } = host;

    await page.goto('/onboarding');
    await page.getByRole('button', { name: /I'm hiring/ }).click();
    await page.getByRole('textbox', { name: 'Organization name' }).fill(ORG_NAME);
    await page.getByRole('button', { name: 'Create organization' }).click();

    // An Owner without a passkey or two-step sign-in is stopped at the security screen.
    await expect(page).toHaveURL(`${appURL}/host/security`, NAVIGATION);
    await expect(page.getByRole('heading', { name: 'Secure your account' })).toBeVisible();
    await expectAccessible(page);

    await addPasskey(page);
    await page.getByRole('link', { name: 'Continue to Home' }).click();

    await expect(page).toHaveURL(`${appURL}/host`, NAVIGATION);
    await expect(navLink(page, 'Home')).toBeVisible();
    await expect(navLink(page, 'Home')).toHaveAttribute('aria-current', 'page');
    if (!mobile) {
      await expect(
        page.getByRole('button', { name: `Switch organization, current: ${ORG_NAME}` }),
      ).toBeVisible();
    }
    await expectAccessible(page);
  });

  test('visiting /onboarding again sends a host back to Home', async () => {
    test.skip(!orgs, ORGS_OFF);
    if (!host) throw new Error('An earlier step failed');
    await host.page.goto('/onboarding');
    await expect(host.page).toHaveURL(`${appURL}/host`);
  });

  test('Tab reaches every item of the host shell', async () => {
    test.skip(!orgs, ORGS_OFF);
    if (!host) throw new Error('An earlier step failed');
    await host.page.goto('/host');
    const reached = await hrefsReachedByTab(host.page);
    for (const href of mobile ? HOST_MOBILE : HOST_DESKTOP) {
      expect(reached, `Tab reaches ${href}`).toContain(href);
    }
  });
});
