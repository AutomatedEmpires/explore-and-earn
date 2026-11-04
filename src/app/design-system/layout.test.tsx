// The gallery is internal: in production it does not exist, even if a request gets past the
// proxy's 404.
import { afterEach, describe, expect, it, vi } from 'vitest';

const appEnv = vi.hoisted(() => ({ value: 'dev' as 'dev' | 'preview' | 'prod' }));

vi.mock('@/lib/env', () => ({ getEnv: () => ({ APP_ENV: appEnv.value }) }));

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound,
}));

afterEach(() => {
  appEnv.value = 'dev';
  notFound.mockClear();
});

describe('DesignSystemLayout', () => {
  it('is not found in prod', async () => {
    appEnv.value = 'prod';
    const { default: DesignSystemLayout } = await import('./layout');
    expect(() => DesignSystemLayout({ children: 'gallery', params: Promise.resolve({}) })).toThrow(
      'NEXT_NOT_FOUND',
    );
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it.each(['dev', 'preview'] as const)('renders its pages in %s', async (env) => {
    appEnv.value = env;
    const { default: DesignSystemLayout } = await import('./layout');
    expect(DesignSystemLayout({ children: 'gallery', params: Promise.resolve({}) })).toBe(
      'gallery',
    );
    expect(notFound).not.toHaveBeenCalled();
  });

  it('keeps the gallery out of search engines', async () => {
    const { metadata } = await import('./layout');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
