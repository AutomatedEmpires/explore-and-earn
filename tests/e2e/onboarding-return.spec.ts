// The guest's action survives sign-up and onboarding (design audit 1: C-1 and C-3; spec 5.1).
//
//   1. A guest taps Apply and signs up. Sign-up hands the new account to onboarding as
//      `/onboarding?returnTo=/apply/<id>?source=feed` (the unit tests in src/app/sign-up and
//      src/app/sign-in pin that URL; Clerk's own form is not driven here). The new seeker moves
//      through the steps with the browser's Back and Forward and the in-card Back, confirms
//      18+, and lands on Apply, not on Seek.
//   2. A `returnTo` that leads off the site is dropped: the seeker lands on Seek. Visiting
//      onboarding again with a returnTo then goes straight there.
//
// Runs on both projects, desktop and mobile. Run it against a local stack, as for
// tests/e2e/shells.spec.ts:
//   pnpm db:local                  in its own shell, then once: pnpm db:migrate
//   pnpm e2e tests/e2e/onboarding-return.spec.ts
//
// Clerk: a development instance only (sk_test_ key), from the environment or .env.local, or else
// from the file keyless mode writes, .clerk/.tmp/keyless.json. Each project creates two
// throwaway `+clerk_test` seekers and deletes them when it ends.
import { existsSync, readFileSync } from 'node:fs';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { z } from 'zod';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const KEYLESS_FILE = '.clerk/.tmp/keyless.json';
const CLERK_API = 'https://api.clerk.com/v1';
/** After a submit: the API call and, on a dev server, compiling the next page. */
const NAVIGATION = { timeout: 60_000 };

/** Where a guest's Apply returns to (SP3 spec 8.7): straight to the apply page. */
const APPLY = '/apply/019a4a3c-0000-7000-8000-00000000e2e1?source=feed';

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
    throw new Error('This run only uses a Clerk development instance (sk_test_ key)');
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

/** A brand-new Clerk user, with no account type yet: what a guest is right after sign-up. */
async function createClerkUser(email: string): Promise<string> {
  const created = await clerkApi('POST', '/users', {
    email_address: [email],
    skip_password_requirement: true,
  });
  return z.object({ id: z.string() }).parse(created).id;
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
  await expect(page.getByRole('heading', { name: 'Sign in to Explore&Earn' })).toBeVisible();
  await clerk.signIn({ page, emailAddress: email });
  return { context, page };
}

/** The onboarding URL, as sign-up and the page guards build it. */
function onboardingUrl(returnTo: string, step?: 'seeker' | 'host'): string {
  const params = new URLSearchParams({ returnTo });
  if (step) params.set('step', step);
  return `/onboarding?${params.toString()}`;
}

const choose = (page: Page) => page.getByRole('heading', { name: 'Welcome to Explore&Earn' });
const ageStep = (page: Page) =>
  page.getByRole('heading', { name: 'Work worth going somewhere for.' });
const hostStep = (page: Page) => page.getByRole('heading', { name: 'Name your organization' });

async function confirmAdult(page: Page): Promise<void> {
  await page.getByRole('checkbox', { name: "I'm 18 or older" }).check();
  await page.getByRole('button', { name: 'Continue' }).click();
}

test.describe("The guest's action through sign-up and onboarding", () => {
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  const run = Date.now().toString(36);
  const clerkUserIds: string[] = [];
  const actors: Actor[] = [];
  let appURL = '';

  test.beforeAll(async () => {
    appURL = test.info().project.use.baseURL ?? 'http://localhost:3000';
    keys = clerkKeys();
    process.env.CLERK_SECRET_KEY = keys.secretKey;
    await clerkSetup({ ...keys, dotenv: false });
  });

  test.afterAll(async () => {
    for (const a of actors) await a.context.close();
    if (keys) {
      for (const id of clerkUserIds) await clerkApi('DELETE', `/users/${id}`).catch(() => {});
    }
  });

  const emailFor = (name: string) =>
    `return-${name}-${test.info().project.name}-${run}+clerk_test@example.com`;

  async function newSeeker(browser: Browser, name: string): Promise<Page> {
    const email = emailFor(name);
    clerkUserIds.push(await createClerkUser(email));
    const actor = await signInNewUser(browser, appURL, email);
    actors.push(actor);
    return actor.page;
  }

  test('Back moves between the steps, and the seeker lands on the Apply they started', async ({
    browser,
  }) => {
    const page = await newSeeker(browser, 'apply');
    await page.goto(onboardingUrl(APPLY));
    await expect(choose(page)).toBeVisible();

    // Each step is in the URL, with returnTo kept.
    await page.getByRole('button', { name: /I'm looking for work/ }).click();
    await expect(ageStep(page)).toBeVisible();
    await expect(page).toHaveURL(`${appURL}${onboardingUrl(APPLY, 'seeker')}`);

    // The browser's Back returns to the choice, and Forward to the step.
    await page.goBack();
    await expect(choose(page)).toBeVisible();
    await expect(page).toHaveURL(`${appURL}${onboardingUrl(APPLY)}`);
    await page.goForward();
    await expect(ageStep(page)).toBeVisible();

    // The in-card Back does the same as the browser's.
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(choose(page)).toBeVisible();
    await expect(page).toHaveURL(`${appURL}${onboardingUrl(APPLY)}`);

    // The other step, and a refresh keeps it.
    await page.getByRole('button', { name: /I'm hiring/ }).click();
    await expect(hostStep(page)).toBeVisible();
    await page.reload();
    await expect(hostStep(page)).toBeVisible();
    await expect(page).toHaveURL(`${appURL}${onboardingUrl(APPLY, 'host')}`);
    await page.goBack();
    await expect(choose(page)).toBeVisible();

    await page.getByRole('button', { name: /I'm looking for work/ }).click();
    await confirmAdult(page);

    await expect(page).toHaveURL(`${appURL}${APPLY}`, NAVIGATION);
    await expect(page.getByRole('heading', { name: 'Apply' })).toBeVisible();
  });

  test('a returnTo that leaves the site is dropped, and a finished seeker goes straight on', async ({
    browser,
  }) => {
    const page = await newSeeker(browser, 'offsite');
    await page.goto(onboardingUrl('//evil.test/jobs', 'seeker'));
    await expect(ageStep(page)).toBeVisible();
    await confirmAdult(page);
    await expect(page).toHaveURL(`${appURL}/`, NAVIGATION);

    // Already onboarded (another tab, or a guard sending them back): straight to the action.
    await page.goto(onboardingUrl(APPLY));
    await expect(page).toHaveURL(`${appURL}${APPLY}`, NAVIGATION);
  });
});
