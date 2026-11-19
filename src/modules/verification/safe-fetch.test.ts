// The SSRF-safe website fetch (SP2 spec 8.4): only public addresses, HTTPS on 443, the vetted
// address pinned for the connection, at most 3 redirects, a 1 MB cap and a 5 s total timeout.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  SafeFetchError,
  htmlToText,
  isPublicAddress,
  pinnedLookup,
  safeFetchText,
  type Transport,
} from './safe-fetch';

const encoder = new TextEncoder();

async function* chunks(...parts: (string | Uint8Array)[]): AsyncGenerator<Uint8Array> {
  for (const p of parts) yield typeof p === 'string' ? encoder.encode(p) : p;
}

type Answer = Awaited<ReturnType<Transport>>;

const page = (html: string, headers: Record<string, string> = {}): Answer => ({
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  body: chunks(html),
});

const redirect = (location: string, status = 302): Answer => ({
  status,
  headers: { location },
  body: chunks(''),
});

/** Every host resolves to a public address unless `map` says otherwise. */
const resolveWith =
  (map: Record<string, string[]> = {}) =>
  async (host: string) =>
    map[host] ?? ['93.184.216.34'];

/** A transport that answers from `answers` by URL and records every call. */
function fakeTransport(answers: Record<string, Answer | (() => Answer)>) {
  const calls: { address: string; url: string; timeoutMs: number }[] = [];
  const transport: Transport = async (address, url, timeoutMs) => {
    calls.push({ address, url: url.toString(), timeoutMs });
    const a = answers[url.toString()];
    if (!a) throw new Error(`unexpected request to ${url.toString()}`);
    return typeof a === 'function' ? a() : a;
  };
  return { transport, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isPublicAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::1',
    '::',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    '::ffff:7f00:1',
    '2002:7f00:1::1',
    '64:ff9b::a00:1',
    'not-an-ip',
    '',
  ])('is false for %s', (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(['93.184.216.34', '2606:4700::1111', '8.8.8.8', '172.32.0.1', '::ffff:93.184.216.34'])(
    'is true for %s',
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
});

describe('safeFetchText', () => {
  it('fetches an https page from the vetted address and returns its visible text', async () => {
    const { transport, calls } = fakeTransport({
      'https://kettle.com/': page(
        '<html><head><title>Kettle Ridge</title><style>body{color:red}</style></head>' +
          '<body><h1>Kettle   Ridge Lodge</h1><script>steal("secret")</script>' +
          '<p>Rooms &amp; jobs in\n the Cascades</p></body></html>',
      ),
    });
    const out = await safeFetchText('https://kettle.com', {
      resolve: resolveWith({ 'kettle.com': ['93.184.216.34'] }),
      transport,
    });
    expect(out).toEqual({
      status: 200,
      finalUrl: 'https://kettle.com/',
      text: 'Kettle Ridge Kettle Ridge Lodge Rooms & jobs in the Cascades',
    });
    expect(calls).toEqual([
      { address: '93.184.216.34', url: 'https://kettle.com/', timeoutMs: expect.any(Number) },
    ]);
    expect(calls[0]?.timeoutMs).toBeLessThanOrEqual(5000);
  });

  it('refuses plain http', async () => {
    const { transport, calls } = fakeTransport({});
    await expect(safeFetchText('http://a.com', { resolve: resolveWith(), transport })).rejects.toThrow(
      SafeFetchError,
    );
    expect(calls).toHaveLength(0);
  });

  it('refuses any port but 443, credentials and a malformed URL', async () => {
    const { transport, calls } = fakeTransport({});
    const deps = { resolve: resolveWith(), transport };
    await expect(safeFetchText('https://a.com:8443/', deps)).rejects.toMatchObject({
      reason: 'port_not_allowed',
    });
    await expect(safeFetchText('https://user:pw@a.com/', deps)).rejects.toMatchObject({
      reason: 'credentials_not_allowed',
    });
    await expect(safeFetchText('not a url', deps)).rejects.toMatchObject({ reason: 'invalid_url' });
    expect(calls).toHaveLength(0);
  });

  it('accepts an explicit :443', async () => {
    const { transport } = fakeTransport({ 'https://a.com/': page('<p>ok</p>') });
    const out = await safeFetchText('https://a.com:443/', { resolve: resolveWith(), transport });
    expect(out.text).toBe('ok');
  });

  it('refuses a host that resolves to a private address, even one of several', async () => {
    const { transport, calls } = fakeTransport({});
    await expect(
      safeFetchText('https://a.com/', {
        resolve: resolveWith({ 'a.com': ['10.0.0.5'] }),
        transport,
      }),
    ).rejects.toMatchObject({ reason: 'address_not_public' });
    await expect(
      safeFetchText('https://b.com/', {
        resolve: resolveWith({ 'b.com': ['93.184.216.34', '127.0.0.1'] }),
        transport,
      }),
    ).rejects.toMatchObject({ reason: 'address_not_public' });
    await expect(
      safeFetchText('https://[::1]/', { resolve: resolveWith(), transport }),
    ).rejects.toMatchObject({ reason: 'address_not_public' });
    await expect(
      safeFetchText('https://c.com/', { resolve: async () => [], transport }),
    ).rejects.toMatchObject({ reason: 'dns_failed' });
    expect(calls).toHaveLength(0);
  });

  it('refuses a redirect to http or to a host that resolves privately', async () => {
    const toHttp = fakeTransport({ 'https://a.com/': redirect('http://a.com/home') });
    await expect(
      safeFetchText('https://a.com/', { resolve: resolveWith(), transport: toHttp.transport }),
    ).rejects.toMatchObject({ reason: 'not_https' });

    const toPrivate = fakeTransport({ 'https://a.com/': redirect('https://internal.a.com/') });
    await expect(
      safeFetchText('https://a.com/', {
        resolve: resolveWith({ 'internal.a.com': ['192.168.1.10'] }),
        transport: toPrivate.transport,
      }),
    ).rejects.toMatchObject({ reason: 'address_not_public' });
    expect(toPrivate.calls.map((c) => c.url)).toEqual(['https://a.com/']);
  });

  it('follows up to 3 redirects, resolving relative locations, and refuses a 4th', async () => {
    const three = fakeTransport({
      'https://a.com/': redirect('/one', 301),
      'https://a.com/one': redirect('https://www.a.com/two', 307),
      'https://www.a.com/two': redirect('three', 308),
      'https://www.a.com/three': page('<p>landed</p>'),
    });
    const out = await safeFetchText('https://a.com/', {
      resolve: resolveWith(),
      transport: three.transport,
    });
    expect(out).toMatchObject({ status: 200, finalUrl: 'https://www.a.com/three', text: 'landed' });
    expect(three.calls).toHaveLength(4);

    const four = fakeTransport({
      'https://a.com/': redirect('/1'),
      'https://a.com/1': redirect('/2'),
      'https://a.com/2': redirect('/3'),
      'https://a.com/3': redirect('/4'),
      'https://a.com/4': page('<p>never</p>'),
    });
    await expect(
      safeFetchText('https://a.com/', { resolve: resolveWith(), transport: four.transport }),
    ).rejects.toMatchObject({ reason: 'too_many_redirects' });
    expect(four.calls).toHaveLength(4);
  });

  it('reads at most 1,000,000 bytes of a 2 MB body', async () => {
    let yielded = 0;
    async function* twoMegabytes(): AsyncGenerator<Uint8Array> {
      // 'a', whitespace that collapses, then 'b' as byte 1,000,000; everything after is 'c'.
      const first = encoder.encode(`a${' '.repeat(999_998)}b`);
      const second = encoder.encode('c'.repeat(1_000_000));
      for (const part of [first.subarray(0, 600_000), first.subarray(600_000), second]) {
        yielded += part.byteLength;
        yield part;
      }
    }
    const transport: Transport = async () => ({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: twoMegabytes(),
    });
    const out = await safeFetchText('https://a.com/', { resolve: resolveWith(), transport });
    expect(out.text).toBe('a b');
    // The reader stopped at the cap and never asked for the second megabyte.
    expect(yielded).toBe(1_000_000);

    // A single 2 MB chunk is cut at the cap too.
    const big = encoder.encode(`${'x'.repeat(1_000_000)}zzz`);
    const one: Transport = async () => ({
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: chunks(big),
    });
    const cut = await safeFetchText('https://a.com/', {
      resolve: resolveWith(),
      transport: one,
      maxBytes: 10,
    });
    expect(cut.text).toBe('xxxxxxxxxx');
  });

  it('rejects after 5 s in total when the transport never answers', async () => {
    vi.useFakeTimers();
    const transport: Transport = () => new Promise(() => {});
    const result = safeFetchText('https://a.com/', { resolve: resolveWith(), transport });
    const settled = vi.fn();
    result.then(settled, settled);

    await vi.advanceTimersByTimeAsync(4_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).rejects.toMatchObject({ reason: 'timeout' });
  });

  it('counts a slow body toward the same 5 s', async () => {
    vi.useFakeTimers();
    async function* slow(): AsyncGenerator<Uint8Array> {
      yield encoder.encode('<p>start</p>');
      await new Promise(() => {});
    }
    const transport: Transport = async () => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: slow(),
    });
    const result = safeFetchText('https://a.com/', { resolve: resolveWith(), transport });
    const assertion = expect(result).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it('cuts the text to 5,000 characters and drops non-text content', async () => {
    const long = `<p>${'word '.repeat(3_000)}</p><script>${'x'.repeat(100)}</script>`;
    const { transport } = fakeTransport({
      'https://a.com/': page(long),
      'https://a.com/logo.png': {
        status: 200,
        headers: { 'content-type': 'image/png' },
        body: chunks('PNG...'),
      },
    });
    const out = await safeFetchText('https://a.com/', { resolve: resolveWith(), transport });
    expect(out.text.length).toBeLessThanOrEqual(5_000);
    expect(out.text.startsWith('word word')).toBe(true);
    expect(out.text).not.toContain('x');

    const image = await safeFetchText('https://a.com/logo.png', {
      resolve: resolveWith(),
      transport,
    });
    expect(image).toEqual({ status: 200, finalUrl: 'https://a.com/logo.png', text: '' });
  });

  it('returns a non-2xx final status with its text', async () => {
    const { transport } = fakeTransport({
      'https://a.com/': { ...page('<h1>Not found</h1>'), status: 404 },
    });
    const out = await safeFetchText('https://a.com/', { resolve: resolveWith(), transport });
    expect(out).toEqual({ status: 404, finalUrl: 'https://a.com/', text: 'Not found' });
  });
});

describe('htmlToText', () => {
  it('drops scripts, styles and comments, including an unterminated script', () => {
    expect(
      htmlToText(
        '<!-- hidden --><p>One</p><SCRIPT type="x">bad()</SCRIPT><style>.a{}</style>' +
          '<noscript>Enable JS</noscript><p>Two &lt;3 &#38; &#x41;&nbsp;B</p><script>cut',
      ),
    ).toBe('One Two <3 & A B');
  });
});

describe('pinnedLookup', () => {
  it('answers every lookup with the vetted address', () => {
    const lookup = pinnedLookup('93.184.216.34');
    const one = vi.fn();
    lookup('evil.example', {}, one);
    expect(one).toHaveBeenCalledWith(null, '93.184.216.34', 4);

    const all = vi.fn();
    lookup('evil.example', { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: '93.184.216.34', family: 4 }]);

    const v6 = vi.fn();
    pinnedLookup('2606:4700::1111')('x', {}, v6);
    expect(v6).toHaveBeenCalledWith(null, '2606:4700::1111', 6);
  });
});
