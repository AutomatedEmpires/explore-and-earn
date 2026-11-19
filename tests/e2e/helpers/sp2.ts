// Playwright helpers for the SP2 end-to-end tests (first used in Phase B2). They run against
// `pnpm dev` on `pnpm db:local` with stub providers (BILLING_PROVIDER=stub, EMAIL_PROVIDER=stub).
//
// Environment: each value comes from the shell, else .env.local, else .env.local.example.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import type { APIRequestContext, Page } from '@playwright/test';
import { sql, type SQL } from 'drizzle-orm';
import { closeClient, createDb, queryRows, type Db } from '@/lib/db';
import type { PlanCode } from '@/modules/billing';
import { setSetting, type SettingKey, type SettingValue } from '@/modules/settings';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const EMAIL_DIR = path.join(ROOT, '.data', 'emails');
/** The operator id recorded on settings the e2e helpers change. */
const E2E_OPERATOR_ID = '00000000-0000-7000-8000-00000000e2e0';

function fileEnv(name: string): Record<string, string | undefined> {
  const file = path.join(ROOT, name);
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
}

const env: Record<string, string | undefined> = {
  ...fileEnv('.env.local.example'),
  ...fileEnv('.env.local'),
  ...process.env,
};

function requireEnv(key: string): string {
  const value = env[key];
  if (!value) throw new Error(`e2e: ${key} is not set (shell, .env.local or .env.local.example)`);
  return value;
}

/** Opens a database client for one call and always closes it. */
async function withDb<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const db = createDb(requireEnv('DATABASE_URL'));
  try {
    return await fn(db);
  } finally {
    await closeClient(db);
  }
}

/** Runs the jobs endpoint until a round processes nothing (at most 50 rounds). */
export async function drainJobs(request: APIRequestContext): Promise<void> {
  const secret = requireEnv('JOBS_SECRET');
  for (let round = 0; round < 50; round++) {
    const res = await request.post('/api/jobs/run', { headers: { 'x-jobs-secret': secret } });
    if (!res.ok()) throw new Error(`drainJobs: /api/jobs/run answered ${res.status()}`);
    const body = (await res.json()) as { processed?: number };
    if (!body.processed) return;
  }
  throw new Error('drainJobs: the outbox did not drain after 50 rounds');
}

/** Creates `count` founding codes with `pnpm ops:founding-codes` and returns them. */
export function runFoundingCodes(count: number): string[] {
  const out = execFileSync(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    ['ops:founding-codes', '--count', String(count), '--note', 'e2e'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, ...env },
      shell: process.platform === 'win32',
    },
  );
  const codes = out.match(/EE-[0-9A-Z]{4}-[0-9A-Z]{4}/g) ?? [];
  if (codes.length !== count) {
    throw new Error(`runFoundingCodes: expected ${count} codes, got ${codes.length}`);
  }
  return codes;
}

/** Sets any setting through the settings module (validated and audited like the console). */
export async function setSettingValue<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): Promise<void> {
  await withDb((db) => setSetting(db, key, value, { operatorId: E2E_OPERATOR_ID }));
}

/** Sets `launch.public_at` (null: before launch). Shared by every test; prefer entitleHost. */
export async function setLaunchAt(iso: string | null): Promise<void> {
  await setSettingValue('launch.public_at', iso);
}

/** Raw rows from the e2e database. */
export async function dbRows<T = Record<string, unknown>>(query: SQL | string): Promise<T[]> {
  return withDb((db) => queryRows<T>(db, typeof query === 'string' ? sql.raw(query) : query));
}

/**
 * Entitles the signed-in Owner on `page` with a fresh founding code (Plan decision 17), using
 * only the billing routes: checkout, then complete, then drains the jobs. Never touches
 * `launch.public_at`. Default plan: Professional monthly.
 */
export async function entitleHost(
  page: Page,
  o: { plan?: PlanCode; interval?: 'month' | 'year' } = {},
): Promise<void> {
  await setSettingValue('founding.max_hosts', 1000);
  const [foundingCode] = runFoundingCodes(1);
  const body = {
    plan: o.plan ?? 'professional',
    interval: o.interval ?? 'month',
    extraSlots: 0,
    foundingCode,
  };

  const checkout = await page.evaluate(async (input) => {
    const res = await fetch('/api/v1/host/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    return { status: res.status, body: (await res.json()) as { url?: string } };
  }, body);
  if (checkout.status !== 200 || !checkout.body.url) {
    throw new Error(`entitleHost: checkout answered ${checkout.status}`);
  }

  const sessionId = new URL(checkout.body.url, page.url()).searchParams.get('session_id');
  if (!sessionId) throw new Error('entitleHost: the success URL has no session_id');

  const complete = await page.evaluate(async (id) => {
    const res = await fetch(`/api/v1/host/billing/complete?session_id=${encodeURIComponent(id)}`);
    return res.status;
  }, sessionId);
  if (complete !== 200) throw new Error(`entitleHost: complete answered ${complete}`);

  await drainJobs(page.request);
}

type StoredEmail = { to: string; subject: string; html: string; text: string; sentAt: string };

function newestEmail(to: string, subject?: RegExp): StoredEmail | null {
  if (!existsSync(EMAIL_DIR)) return null;
  const address = to.trim().toLowerCase();
  let newest: StoredEmail | null = null;
  for (const file of readdirSync(EMAIL_DIR)) {
    if (!file.endsWith('.json')) continue;
    let m: StoredEmail;
    try {
      m = JSON.parse(readFileSync(path.join(EMAIL_DIR, file), 'utf8')) as StoredEmail;
    } catch {
      continue;
    }
    if (m.to.toLowerCase() !== address || (subject && !subject.test(m.subject))) continue;
    if (!newest || m.sentAt > newest.sentAt) newest = m;
  }
  return newest;
}

/** The newest stub email to `to` (optionally matching `subject`), polling for up to 10 s. */
export async function readEmail(to: string, o: { subject?: RegExp } = {}): Promise<StoredEmail> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const m = newestEmail(to, o.subject);
    if (m) return m;
    if (Date.now() > deadline) throw new Error(`readEmail: no email to ${to}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** The `/join/<token>` path from the newest team invitation to `to`. */
export async function readJoinLink(to: string): Promise<string> {
  const m = await readEmail(to, { subject: /^Join .+ on Explore&Earn$/ });
  const link = /\/join\/[A-Za-z0-9_-]+/.exec(m.html)?.[0];
  if (!link) throw new Error(`readJoinLink: no /join/ link in the email to ${to}`);
  return link;
}
