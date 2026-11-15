// Clerk sign-in for discovery e2e (SP3 plan Task 27). Keys stay in the environment.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import type { Page } from '@playwright/test';

const KEYLESS_FILE = '.clerk/.tmp/keyless.json';
const CLERK_API = 'https://api.clerk.com/v1';
const SEEKER_EMAIL = 'discovery-seeker+clerk_test@example.com';
const HOST_EMAIL = 'discovery-host+clerk_test@example.com';
const HOST_ORG = 'Discovery E2E Host';

type ClerkKeys = { publishableKey: string; secretKey: string };
type AccountChoice =
  | { accountType: 'seeker'; adultAttested: true }
  | { accountType: 'host'; organizationName: string };

let ready: Promise<void> | null = null;

function loadLocalEnv(): void {
  for (const name of ['.env.local.example', '.env.local']) {
    if (!existsSync(name)) continue;
    const parsed = parseEnv(readFileSync(name, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (value && process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function clerkKeys(): ClerkKeys {
  loadLocalEnv();
  const fromEnv = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const secret = process.env.CLERK_SECRET_KEY;
  let keys: ClerkKeys | null = fromEnv && secret ? { publishableKey: fromEnv, secretKey: secret } : null;
  if (!keys && existsSync(KEYLESS_FILE)) {
    const parsed: unknown = JSON.parse(readFileSync(KEYLESS_FILE, 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'publishableKey' in parsed &&
      'secretKey' in parsed &&
      typeof parsed.publishableKey === 'string' &&
      typeof parsed.secretKey === 'string' &&
      parsed.publishableKey &&
      parsed.secretKey
    ) {
      keys = { publishableKey: parsed.publishableKey, secretKey: parsed.secretKey };
    }
  }
  if (!keys) {
    throw new Error(
      'No Clerk keys. Set CLERK_SECRET_KEY and NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or run pnpm dev once so keyless mode can write its key file.',
    );
  }
  if (!keys.secretKey.startsWith('sk_test_')) {
    throw new Error('Discovery sign-in only uses a Clerk development instance (sk_test_ key)');
  }
  return keys;
}

function ensureClerk(): Promise<void> {
  ready ??= (async () => {
    const keys = clerkKeys();
    await clerkSetup({
      publishableKey: keys.publishableKey,
      secretKey: keys.secretKey,
      dotenv: false,
    });
  })();
  return ready;
}

function clerkMessage(json: unknown): string {
  if (typeof json !== 'object' || json === null || !('errors' in json) || !Array.isArray(json.errors)) {
    return '';
  }
  const first = json.errors[0];
  if (typeof first !== 'object' || first === null || !('message' in first)) return '';
  return typeof first.message === 'string' ? first.message : '';
}

async function clerkJson(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const keys = clerkKeys();
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${keys.secretKey}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

function hasEmail(json: unknown, email: string): boolean {
  if (!Array.isArray(json)) return false;
  const wanted = email.toLowerCase();
  return json.some((user) => {
    if (typeof user !== 'object' || user === null || !('email_addresses' in user)) return false;
    const addresses = user.email_addresses;
    if (!Array.isArray(addresses)) return false;
    return addresses.some((item) => {
      if (typeof item !== 'object' || item === null || !('email_address' in item)) return false;
      return typeof item.email_address === 'string' && item.email_address.toLowerCase() === wanted;
    });
  });
}

async function ensureUser(email: string): Promise<void> {
  if (!email.includes('+clerk_test')) {
    throw new Error('Discovery sign-in only creates +clerk_test users');
  }
  const listed = await clerkJson('GET', `/users?email_address=${encodeURIComponent(email)}`);
  if (listed.status !== 200) {
    const detail = clerkMessage(listed.json);
    throw new Error(`sign-in: Clerk user lookup failed (${listed.status})${detail ? ` ${detail}` : ''}`);
  }
  if (hasEmail(listed.json, email)) return;
  const created = await clerkJson('POST', '/users', {
    email_address: [email],
    skip_password_requirement: true,
  });
  if (created.status === 200 || created.status === 422) return;
  const detail = clerkMessage(created.json);
  throw new Error(`sign-in: Clerk user create failed (${created.status})${detail ? ` ${detail}` : ''}`);
}

async function chooseAccount(page: Page, body: AccountChoice): Promise<void> {
  const status = await page.evaluate(async (input) => {
    const res = await fetch('/api/v1/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.status;
  }, body);
  if (status !== 200 && status !== 409) throw new Error(`sign-in: onboarding answered ${status}`);
}

async function signIn(page: Page, email: string): Promise<void> {
  await ensureClerk();
  await ensureUser(email);
  await page.goto('/sign-in');
  await clerk.signIn({ page, emailAddress: email });
}

/** Signs in the stable discovery seeker, or a new one when `fresh` is set. */
export async function signInAsSeeker(page: Page, opts?: { fresh?: boolean }): Promise<void> {
  const email = opts?.fresh
    ? `discovery-seeker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}+clerk_test@example.com`
    : SEEKER_EMAIL;
  await signIn(page, email);
  await chooseAccount(page, { accountType: 'seeker', adultAttested: true });
}

/** Signs in the stable discovery host and names an organization that is not a seeded employer. */
export async function signInAsHost(page: Page): Promise<void> {
  await signIn(page, HOST_EMAIL);
  await chooseAccount(page, { accountType: 'host', organizationName: HOST_ORG });
}
