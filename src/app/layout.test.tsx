// The proxy sends a nonce CSP with 'strict-dynamic', so a browser runs only scripts that carry
// the request's nonce. Next.js adds the nonce only to pages it renders at request time; a page
// prerendered at build time ships scripts without one, and every one of them is refused.
// The layout also writes the visitor's consent into <meta name="ee-consent"> for initAnalytics
// (SP8 Plan decision 19).
import { isValidElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection,
}));

// next/font is compiled by Next.js; outside it, stand in for the font loader.
vi.mock('next/font/google', () => ({
  Figtree: () => ({ className: 'figtree', variable: 'font-sans-variable', style: {} }),
}));

const request = vi.hoisted(() => ({
  headers: {} as Record<string, string>,
  cookie: null as string | null,
  act: undefined as unknown,
  clerkUserId: null as string | null,
  fail: false,
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => {
    if (request.fail) throw new Error('outside a request scope');
    return new Headers(request.headers);
  }),
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === 'ee_consent' && request.cookie ? { name, value: request.cookie } : undefined,
  })),
}));

vi.mock('@clerk/nextjs/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/nextjs/server')>()),
  auth: vi.fn(async () => ({
    userId: request.clerkUserId,
    sessionClaims: request.act ? { act: request.act } : {},
  })),
}));

const account = vi.hoisted(() => ({
  optedOut: false,
  fail: false,
  read: vi.fn(),
}));
vi.mock('@/modules/identity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/identity')>()),
  findUserByClerkId: vi.fn(async (_db: unknown, clerkUserId: string) => {
    if (account.fail) throw new Error('database unavailable');
    return { id: '0190f7a2-0000-7000-8000-0000000000a1', clerkUserId };
  }),
  isAnalyticsOptedOut: vi.fn(async () => {
    account.read();
    return account.optedOut;
  }),
}));

vi.mock('@/lib/db', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db')>()),
  getDb: () => ({}),
}));

vi.mock('@/modules/content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/content')>()),
  getConsentNotBefore: vi.fn(async () => null),
}));

/** The content of the first <meta name="ee-consent"> in the rendered tree. */
function consentTag(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = consentTag(child);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const props = node.props as { name?: string; content?: string; children?: ReactNode };
  if (node.type === 'meta' && props.name === 'ee-consent') return props.content ?? null;
  return consentTag(props.children);
}

async function render(): Promise<unknown> {
  const { default: RootLayout } = await import('./layout');
  return RootLayout({ children: null });
}

beforeEach(() => {
  request.headers = {};
  request.cookie = null;
  request.act = undefined;
  request.clerkUserId = null;
  request.fail = false;
  account.optedOut = false;
  account.fail = false;
  account.read.mockClear();
  connection.mockClear();
});

describe('RootLayout', () => {
  it('opts every page into request-time rendering, so its scripts get the CSP nonce', async () => {
    const tree = await render();

    expect(connection).toHaveBeenCalledTimes(1);
    expect(tree).toBeTruthy();
  });

  it('writes the consent of a visitor outside the EU, of an EU visitor and under GPC', async () => {
    request.headers = { 'x-vercel-ip-country': 'US' };
    expect(consentTag(await render())).toBe('other:unset:0');

    request.headers = { 'x-vercel-ip-country': 'DE' };
    expect(consentTag(await render())).toBe('eu:unset:0');

    request.headers = { 'x-vercel-ip-country': 'US', 'sec-gpc': '1' };
    expect(consentTag(await render())).toBe('other:denied:0');
  });

  it("reads the visitor's cookie choice and marks a view-as session", async () => {
    const epoch = Math.floor(Date.now() / 1000);
    request.headers = { 'x-vercel-ip-country': 'FR' };
    request.cookie = `1.0190f7a2-0000-7000-8000-00000000c0de.a.${epoch}`;
    request.act = { sub: 'user_operator' };
    expect(consentTag(await render())).toBe('eu:granted:1');
  });

  it('loads nothing when the request cannot be read', async () => {
    request.fail = true;
    expect(consentTag(await render())).toBe('eu:unset:0');
  });

  // Review of PR 231: a signed-in account's recorded opt-out (users.analytics_opt_out_at) is a
  // refusal in the browser too, from any browser, as apiRoute treats it.
  it("refuses analytics for a signed-in account that opted out, from a browser with no signal", async () => {
    request.headers = { 'x-vercel-ip-country': 'US' };
    request.clerkUserId = 'user_opted_out';
    account.optedOut = true;
    expect(consentTag(await render())).toBe('other:denied:0');

    account.optedOut = false;
    expect(consentTag(await render())).toBe('other:unset:0');

    // A lookup that fails counts as an opt-out: analytics never loads on a guess.
    account.fail = true;
    expect(consentTag(await render())).toBe('other:denied:0');
  });

  it('reads the account only when the page would otherwise load analytics', async () => {
    request.clerkUserId = 'user_eu';
    request.headers = { 'x-vercel-ip-country': 'DE' };
    expect(consentTag(await render())).toBe('eu:unset:0');
    request.headers = { 'x-vercel-ip-country': 'US', 'sec-gpc': '1' };
    expect(consentTag(await render())).toBe('other:denied:0');
    request.headers = { 'x-vercel-ip-country': 'US' };
    request.clerkUserId = null;
    expect(consentTag(await render())).toBe('other:unset:0');
    expect(account.read).not.toHaveBeenCalled();
  });
});
