// The proxy sends a nonce CSP with 'strict-dynamic', so a browser runs only scripts that carry
// the request's nonce. Next.js adds the nonce only to pages it renders at request time; a page
// prerendered at build time ships scripts without one, and every one of them is refused.
import { describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection,
}));

// next/font is compiled by Next.js; outside it, stand in for the font loader.
vi.mock('next/font/google', () => ({
  Figtree: () => ({ className: 'figtree', variable: 'font-sans-variable', style: {} }),
}));

describe('RootLayout', () => {
  it('opts every page into request-time rendering, so its scripts get the CSP nonce', async () => {
    const { default: RootLayout } = await import('./layout');

    const tree: unknown = await RootLayout({ children: null });

    expect(connection).toHaveBeenCalledTimes(1);
    expect(tree).toBeTruthy();
  });
});
