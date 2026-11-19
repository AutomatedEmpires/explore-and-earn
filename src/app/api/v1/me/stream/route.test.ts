import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { unauthorized } from '@/lib/errors';
import { getCounts } from '@/server/counts';
import { requireUser, type CurrentUser } from '@/server/guards';
import { GET } from './route';

vi.mock('@/server/guards', () => ({
  requireUser: vi.fn(),
  requireSeeker: vi.fn(),
  requireHost: vi.fn(),
  requireOperator: vi.fn(),
}));

vi.mock('@/server/counts', () => ({ getCounts: vi.fn() }));

const user: CurrentUser = {
  id: '0190f7a2-0000-7000-8000-000000000002',
  clerkUserId: 'user_2',
  accountType: 'host',
  email: null,
};

const decoder = new TextDecoder();

async function nextChunk(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string | null> {
  const { done, value } = await reader.read();
  return done ? null : decoder.decode(value);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(requireUser).mockResolvedValue(user);
  vi.mocked(getCounts).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/v1/me/stream', () => {
  it('sends the counts at once, then every 15 seconds, until the client goes away', async () => {
    vi.mocked(getCounts)
      .mockResolvedValueOnce({ inbox: 2, notifications: 5, profileDot: false })
      .mockResolvedValueOnce({ inbox: 3, notifications: 5, profileDot: true });
    const abort = new AbortController();

    const res = await GET(
      new Request('http://localhost:3000/api/v1/me/stream', { signal: abort.signal }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/event-stream/);
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    if (!res.body) throw new Error('no body');
    const reader = res.body.getReader();

    expect(await nextChunk(reader)).toBe(
      'event: counts\ndata: {"inbox":2,"notifications":5,"profileDot":false}\n\n',
    );
    expect(getCounts).toHaveBeenCalledWith(expect.anything(), user.id);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(await nextChunk(reader)).toBe(
      'event: counts\ndata: {"inbox":3,"notifications":5,"profileDot":true}\n\n',
    );

    abort.abort();
    expect(await nextChunk(reader)).toBeNull();
    const calls = vi.mocked(getCounts).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(vi.mocked(getCounts).mock.calls.length).toBe(calls);
  });

  it('requires a signed-in user', async () => {
    vi.mocked(requireUser).mockRejectedValue(unauthorized());
    const res = await GET(new Request('http://localhost:3000/api/v1/me/stream'));
    expect(res.status).toBe(401);
    expect(getCounts).not.toHaveBeenCalled();
  });
});
