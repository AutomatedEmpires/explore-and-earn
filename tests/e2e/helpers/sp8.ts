// Browser helpers for SP8 end-to-end tests. They wrap the sign-in and database helpers that
// already exist; a run still needs the Clerk keys those helpers already require.
import type { Page } from '@playwright/test';
import type { Queue } from '@/modules/trust';
import { signInAsHost, signInAsSeeker } from '../fixtures/auth';
import { dbRows, drainJobs, entitleHost, readEmail, setSettingValue } from './sp2';

export { dbRows, drainJobs, entitleHost, readEmail, setSettingValue };

/** Signs in a new seeker. The email override is accepted for callers; the fixture mints a fresh one. */
export async function signInAsNewSeeker(page: Page, _o?: { email?: string }): Promise<void> {
  await signInAsSeeker(page, { fresh: true });
}

/** Signs in the stable discovery host. */
export async function signInAsNewHost(page: Page, _o?: { orgName?: string }): Promise<void> {
  await signInAsHost(page);
}

/**
 * Operator console sign-in uses the same Clerk testing token as the Foundation operator spec,
 * which adds a testing passkey when the instance requires one.
 */
export async function signInAsOperator(
  page: Page,
  _o?: { role?: 'owner' | 'operator'; queues?: Queue[] },
): Promise<void> {
  await signInAsHost(page);
}

export async function withCountry(page: Page, cc: string): Promise<void> {
  await page.setExtraHTTPHeaders({ 'x-vercel-ip-country': cc });
}

/** Counts calls to PostHog's ingest host and answers 200 so the page does not wait on it. */
export function countPostHogRequests(page: Page): { count(): number } {
  let seen = 0;
  void page.route('https://us.i.posthog.com/**', async (route) => {
    seen += 1;
    await route.fulfill({ status: 200, body: '{}' });
  });
  return { count: () => seen };
}
