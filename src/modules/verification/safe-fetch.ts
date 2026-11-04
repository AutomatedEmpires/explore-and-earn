// An SSRF-safe fetch of a host's website for business verification (SP2 spec 8.4). The URL is
// host-supplied, so the fetch:
// - accepts HTTPS on port 443 only, with no credentials in the URL;
// - resolves the host itself and refuses it unless every address is public;
// - connects to the vetted address (a pinned lookup), so DNS rebinding can't swap it later;
// - follows at most 3 redirects, re-checking each one;
// - reads at most 1 MB and gives up 5 s after it starts, redirects included;
// - returns only the page's visible text, cut to 5,000 characters.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

/** Why safeFetchText refused or failed. */
export type SafeFetchReason =
  | 'invalid_url'
  | 'not_https'
  | 'port_not_allowed'
  | 'credentials_not_allowed'
  | 'dns_failed'
  | 'address_not_public'
  | 'too_many_redirects'
  | 'timeout'
  | 'request_failed';

export class SafeFetchError extends Error {
  readonly reason: SafeFetchReason;

  constructor(reason: SafeFetchReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SafeFetchError';
    this.reason = reason;
  }
}

/**
 * Sends one GET for `url` to `address` (already vetted) and answers once headers arrive. The
 * body is read by the caller; `timeoutMs` bounds the whole exchange.
 */
export type Transport = (
  address: string,
  url: URL,
  timeoutMs: number,
) => Promise<{ status: number; headers: Record<string, string>; body: AsyncIterable<Uint8Array> }>;

export type SafeFetchDeps = {
  /** The addresses a hostname resolves to. Default: the system resolver, every address. */
  resolve?: (host: string) => Promise<string[]>;
  transport?: Transport;
  /** The total time allowed, redirects and body included. Default 5,000 ms. */
  timeoutMs?: number;
  /** The most body bytes read from the final response. Default 1,000,000. */
  maxBytes?: number;
  /** Redirects followed before giving up. Default 3. */
  maxRedirects?: number;
};

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const MAX_TEXT_LENGTH = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const USER_AGENT = 'Explore&Earn business verification (support@exploreandearn.com)';

// --- Public addresses -------------------------------------------------------------------------

/** IPv4 ranges that are never public: [base, prefix length]. */
const PRIVATE_V4: [number, number][] = [
  [v4('0.0.0.0'), 8], // "this network", including 0.0.0.0
  [v4('10.0.0.0'), 8],
  [v4('100.64.0.0'), 10], // carrier-grade NAT
  [v4('127.0.0.0'), 8],
  [v4('169.254.0.0'), 16], // link-local, including cloud metadata
  [v4('172.16.0.0'), 12],
  [v4('192.0.0.0'), 24],
  [v4('192.0.2.0'), 24],
  [v4('192.88.99.0'), 24],
  [v4('192.168.0.0'), 16],
  [v4('198.18.0.0'), 15],
  [v4('198.51.100.0'), 24],
  [v4('203.0.113.0'), 24],
  [v4('224.0.0.0'), 4], // multicast
  [v4('240.0.0.0'), 4], // reserved, including broadcast
];

function v4(address: string): number {
  return address.split('.').reduce((n, part) => n * 256 + Number(part), 0);
}

function inV4Range(ip: number, base: number, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(ip / size) === Math.floor(base / size);
}

function isPublicV4(ip: number): boolean {
  return !PRIVATE_V4.some(([base, bits]) => inV4Range(ip, base, bits));
}

/** The 8 groups of a valid IPv6 address (an embedded dotted IPv4 tail included). */
function v6Groups(address: string): number[] {
  let s = address.toLowerCase();
  const lastColon = s.lastIndexOf(':');
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const n = v4(tail);
    s = `${s.slice(0, lastColon + 1)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const [head = '', rest] = s.split('::');
  const h = head ? head.split(':') : [];
  const r = rest === undefined ? [] : rest ? rest.split(':') : [];
  const fill = rest === undefined ? [] : Array<string>(8 - h.length - r.length).fill('0');
  return [...h, ...fill, ...r].map((g) => parseInt(g, 16));
}

/** The IPv4 address in groups `i` and `i + 1`. */
const embeddedV4 = (g: number[], i: number) => (g[i] ?? 0) * 65536 + (g[i + 1] ?? 0);

function isPublicV6(g: number[]): boolean {
  const [g0 = 0, g1 = 0] = g;
  // ::/96 (unspecified, loopback, IPv4-compatible) and ::ffff:0:0/96 (IPv4-mapped).
  if (g.slice(0, 5).every((x) => x === 0)) {
    return g[5] === 0xffff ? isPublicV4(embeddedV4(g, 6)) : false;
  }
  // Only global unicast (2000::/3) is public. That excludes unique-local fc00::/7, link-local
  // fe80::/10, multicast ff00::/8 and the NAT64 prefixes.
  if ((g0 & 0xe000) !== 0x2000) return false;
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  if (g0 === 0x2001 && g1 === 0x0000) return false; // Teredo
  if (g0 === 0x2001 && (g1 & 0xffe0) === 0x0020) return false; // ORCHIDv2
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x0010) return false; // ORCHID
  if (g0 === 0x3fff && (g1 & 0xf000) === 0x0000) return false; // documentation (3fff::/20)
  if (g0 === 0x2002) return isPublicV4(embeddedV4(g, 1)); // 6to4 embeds an IPv4 address
  return true;
}

/**
 * Whether `ip` is a public unicast address. False for loopback, private (10/8, 172.16/12,
 * 192.168/16), link-local (169.254/16, fe80::/10), carrier-grade NAT (100.64/10), unique-local
 * (fc00::/7), multicast, unspecified, documentation and reserved ranges, IPv4-mapped or 6to4
 * forms of any of these, and anything that isn't an IP address.
 */
export function isPublicAddress(ip: string): boolean {
  const raw = ip.trim().replace(/^\[(.*)\]$/, '$1');
  const zone = raw.indexOf('%');
  const address = zone >= 0 ? raw.slice(0, zone) : raw;
  const version = isIP(address);
  if (version === 4) return isPublicV4(v4(address));
  if (version === 6) return isPublicV6(v6Groups(address));
  return false;
}

// --- Default resolver and transport -----------------------------------------------------------

async function systemResolve(host: string): Promise<string[]> {
  const answers = await dnsLookup(host, { all: true });
  return answers.map((a) => a.address);
}

/** A socket `lookup` that answers every hostname with `address`, so the connection is pinned. */
export function pinnedLookup(address: string): LookupFunction {
  const family = isIP(address) === 6 ? 6 : 4;
  return (_hostname, options, callback) => {
    if (typeof options === 'object' && options !== null && options.all) {
      callback(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  };
}

/** `[::1]` -> `::1`. */
function bareHost(hostname: string): string {
  return hostname.replace(/^\[(.*)\]$/, '$1');
}

function flattenHeaders(headers: Record<string, string | string[] | undefined>) {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/**
 * The default transport: node https to the vetted address (pinned lookup), with SNI and the
 * certificate check for `url.hostname`, no connection reuse, and the socket destroyed once
 * `timeoutMs` has passed, body included.
 */
export const httpsTransport: Transport = (address, url, timeoutMs) =>
  new Promise((resolve, reject) => {
    const host = bareHost(url.hostname);
    const req = request(
      {
        host,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        lookup: pinnedLookup(address),
        ...(isIP(host) ? {} : { servername: host }),
        agent: false,
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1',
          'accept-encoding': 'identity',
        },
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, headers: flattenHeaders(res.headers), body: res });
      },
    );
    const timer = setTimeout(() => {
      req.destroy(new SafeFetchError('timeout', `No complete answer within ${timeoutMs} ms`));
    }, timeoutMs);
    timer.unref();
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end();
  });

// --- Fetch ------------------------------------------------------------------------------------

/** Parses and checks a URL: HTTPS, port 443 and no credentials. */
function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError('invalid_url', 'Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new SafeFetchError('not_https', 'Only https is allowed');
  // URL drops the scheme's default port, so an explicit :443 reads as ''.
  if (url.port !== '') throw new SafeFetchError('port_not_allowed', 'Only port 443 is allowed');
  if (url.username || url.password) {
    throw new SafeFetchError('credentials_not_allowed', 'URLs with credentials are not allowed');
  }
  url.hash = '';
  return url;
}

/** Resolves `url`'s host and returns its first address once every address is public. */
async function vetHost(url: URL, resolve: (host: string) => Promise<string[]>): Promise<string> {
  const host = bareHost(url.hostname);
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await resolve(host);
    } catch (err) {
      throw new SafeFetchError('dns_failed', 'The host name did not resolve', { cause: err });
    }
  }
  const [first] = addresses;
  if (first === undefined) throw new SafeFetchError('dns_failed', 'The host name did not resolve');
  if (!addresses.every(isPublicAddress)) {
    throw new SafeFetchError('address_not_public', 'The host resolves to a non-public address');
  }
  return first;
}

/** Stops a body we won't read (closing the stream behind it). */
async function discard(body: AsyncIterable<Uint8Array>): Promise<void> {
  await body[Symbol.asyncIterator]().return?.();
}

/** The first `maxBytes` bytes of `body`; stops reading there, or once `stop()` is true. */
async function readCapped(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
  stop: () => boolean,
): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body) {
    if (stop()) break;
    const room = maxBytes - size;
    if (chunk.byteLength >= room) {
      parts.push(chunk.subarray(0, room));
      size += room;
      break;
    }
    parts.push(chunk);
    size += chunk.byteLength;
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** Whitespace collapsed, cut to 5,000 characters without splitting a surrogate pair. */
function tidy(s: string): string {
  let out = s.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
  const last = out.charCodeAt(out.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1);
  return out;
}

/**
 * The visible text of an HTML page: comments and `script`, `style`, `noscript`, `template`
 * and `svg` elements removed (an element cut off by the byte cap too), tags stripped, entities
 * decoded, whitespace collapsed, at most 5,000 characters.
 */
export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ')
    .replace(/<[^>]*(?:>|$)/g, ' ');
  return tidy(decodeEntities(stripped));
}

function bodyText(bytes: Uint8Array, contentType: string | undefined): string {
  const type = (contentType ?? 'text/html').split(';')[0]?.trim().toLowerCase() ?? '';
  if (type === 'text/html' || type === 'application/xhtml+xml' || type === '') {
    return htmlToText(decode(bytes, contentType ?? ''));
  }
  if (type.startsWith('text/')) return tidy(decode(bytes, contentType ?? ''));
  return '';
}

/**
 * Fetches a host-supplied https URL safely (see the file comment) and returns the final status,
 * the final URL after redirects and the page's visible text (empty for non-text content).
 * Throws SafeFetchError when the URL, an address or a redirect is refused, on too many
 * redirects, on a transport failure, or 5 s after it started.
 */
export async function safeFetchText(
  url: string,
  deps: SafeFetchDeps = {},
): Promise<{ status: number; finalUrl: string; text: string }> {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      reject(new SafeFetchError('timeout', `No complete answer within ${timeoutMs} ms`));
    }, timeoutMs);
  });

  const run = async () => {
    const resolve = deps.resolve ?? systemResolve;
    const transport = deps.transport ?? httpsTransport;
    const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    let current = checkUrl(url);
    for (let redirects = 0; ; redirects++) {
      const address = await vetHost(current, resolve);
      if (timedOut) throw new SafeFetchError('timeout', 'Timed out');
      let res: Awaited<ReturnType<Transport>>;
      try {
        res = await transport(address, current, Math.max(1, deadline - Date.now()));
      } catch (err) {
        if (err instanceof SafeFetchError) throw err;
        throw new SafeFetchError('request_failed', 'The website could not be fetched', {
          cause: err,
        });
      }
      const location = res.headers.location;
      if (REDIRECT_STATUSES.has(res.status) && location) {
        await discard(res.body);
        if (redirects >= maxRedirects) {
          throw new SafeFetchError('too_many_redirects', `More than ${maxRedirects} redirects`);
        }
        let next: string;
        try {
          next = new URL(location, current).toString();
        } catch {
          throw new SafeFetchError('invalid_url', 'The redirect location is not a valid URL');
        }
        current = checkUrl(next);
        continue;
      }
      let bytes: Uint8Array;
      try {
        bytes = await readCapped(res.body, deps.maxBytes ?? DEFAULT_MAX_BYTES, () => timedOut);
      } catch (err) {
        if (err instanceof SafeFetchError) throw err;
        throw new SafeFetchError('request_failed', 'The website stopped answering', { cause: err });
      }
      return {
        status: res.status,
        finalUrl: current.toString(),
        text: bodyText(bytes, res.headers['content-type']),
      };
    }
  };

  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
