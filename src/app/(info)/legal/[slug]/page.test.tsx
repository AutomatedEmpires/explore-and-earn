// @vitest-environment jsdom
// /legal/<slug> (SP8 spec 8.5; lead scope on explore-and-earn#149): the published version, or a
// plain holding page with the support address while only drafts exist. Draft text is never
// shown. The age screen's "Read the Terms" lands here, so /legal/terms must not 404.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishedLegal } from '@/modules/content';
import LegalPage, { generateMetadata } from './page';

const state = vi.hoisted(() => ({
  published: null as PublishedLegal | null,
  supportEmail: '',
  asked: [] as string[],
}));

vi.mock('@/lib/db', () => ({ getDb: () => ({}) }));

// The content module's own tests cover which versions count as published; here it is a stand-in.
vi.mock('@/modules/content', () => ({
  LEGAL_TITLES: { terms: 'Terms of Service', privacy: 'Privacy Policy' },
  isLegalSlug: (slug: string) => slug === 'terms' || slug === 'privacy',
  getPublishedLegal: vi.fn(async (_db: unknown, slug: string) => {
    state.asked.push(slug);
    return state.published;
  }),
}));

vi.mock('@/modules/settings', () => ({
  getSetting: vi.fn(async () => state.supportEmail),
}));

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);
vi.mock('next/navigation', () => ({ notFound }));

async function show(slug: string): Promise<void> {
  render(await LegalPage({ params: Promise.resolve({ slug }) }));
}

beforeEach(() => {
  state.published = null;
  state.supportEmail = '';
  state.asked = [];
});

describe('/legal/[slug]', () => {
  it('says the Terms are still being finalized, with the support address, while unpublished', async () => {
    state.supportEmail = 'help@example.test';
    await show('terms');

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText(/still finalizing our Terms of Service/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'help@example.test' })).toHaveAttribute(
      'href',
      'mailto:help@example.test',
    );
    expect(screen.getByRole('link', { name: 'Back to jobs' })).toHaveAttribute('href', '/');
    // Only the published version is ever asked for; drafts never reach this page.
    expect(state.asked).toEqual(['terms']);
    expect(document.body.textContent).not.toMatch(/Draft for counsel review|Version \d/);
  });

  it('leaves the address out until the founder sets one', async () => {
    await show('privacy');
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@/ })).toBeNull();
  });

  it('shows the published version with its number and effective date', async () => {
    state.published = {
      slug: 'terms',
      version: 2,
      title: 'Terms of Service',
      bodyMd: '## 1. The contract\n\nThese terms are a contract. <script>alert(1)</script>',
      effectiveAt: new Date('2027-01-15T00:00:00Z'),
    };
    await show('terms');

    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    expect(screen.getByText('Version 2 · Effective January 15, 2027')).toBeInTheDocument();
    expect(screen.getByText(/These terms are a contract\./)).toBeInTheDocument();
    // The body is text, never HTML.
    expect(document.querySelector('script')).toBeNull();
    expect(screen.queryByText(/still finalizing/)).toBeNull();
  });

  it('is not found for a slug that is not a legal document', async () => {
    await expect(show('terms-of-anything')).rejects.toThrow('NEXT_NOT_FOUND');
    expect(state.asked).toEqual([]);
  });

  it('keeps the holding page out of search results', async () => {
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'terms' }) })).toEqual({
      title: 'Terms of Service · Explore&Earn',
      robots: { index: false, follow: true },
    });
    state.published = {
      slug: 'terms',
      version: 1,
      title: 'Terms of Service',
      bodyMd: 'Text.',
      effectiveAt: new Date('2027-01-15T00:00:00Z'),
    };
    expect(await generateMetadata({ params: Promise.resolve({ slug: 'terms' }) })).toEqual({
      title: 'Terms of Service · Explore&Earn',
    });
  });
});
