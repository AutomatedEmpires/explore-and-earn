// @vitest-environment jsdom
// The discovery query in the URL (SP3 plan Task 22): read through parseQuery, written back
// with serializeQuery through router.replace without scrolling, keeping `source` and the host
// and dropping `cursor` and `intent`.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiscoveryQuery } from './use-discovery-query';

const nav = vi.hoisted(() => ({
  search: '',
  pathname: '/',
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), prefetch: vi.fn() }),
}));

beforeEach(() => {
  nav.replace.mockReset();
  nav.search = '';
  nav.pathname = '/';
});

describe('useDiscoveryQuery', () => {
  it('reads the query, the sort and the host from the URL', () => {
    nav.search = 'cat=farm&sort=newest&host=kettle-ridge-lodge&cat=bogus';
    const { result } = renderHook(() => useDiscoveryQuery());
    expect(result.current.query).toEqual({ categories: ['farm'] });
    expect(result.current.sort).toBe('newest');
    expect(result.current.hostSlug).toBe('kettle-ridge-lodge');
  });

  it('keeps source and drops cursor and intent when the query changes', () => {
    nav.search = 'cursor=x&intent=save%3A1&source=landing';
    const { result } = renderHook(() => useDiscoveryQuery());
    act(() => result.current.setQuery({ categories: ['farm'] }));
    expect(nav.replace).toHaveBeenCalledWith('/?cat=farm&source=landing', { scroll: false });
  });

  it('keeps the query and host when the sort changes, on any path', () => {
    nav.pathname = '/map';
    nav.search = 'state=CO&host=kettle-ridge-lodge&cursor=x';
    const { result } = renderHook(() => useDiscoveryQuery());
    act(() => result.current.setSort('distance'));
    expect(nav.replace).toHaveBeenCalledWith(
      '/map?state=CO&host=kettle-ridge-lodge&sort=distance',
      {
        scroll: false,
      },
    );
  });

  it('goes to the bare path when nothing is left', () => {
    nav.search = 'cat=farm&intent=alert';
    const { result } = renderHook(() => useDiscoveryQuery());
    act(() => result.current.setQuery({}));
    expect(nav.replace).toHaveBeenCalledWith('/', { scroll: false });
  });
});
