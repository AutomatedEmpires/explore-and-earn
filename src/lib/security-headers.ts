// Security headers for every response (spec section 13): a nonce-based CSP plus the standard
// hardening headers. The proxy builds them per request with a fresh nonce; Next.js reads the
// nonce back out of the request's CSP header and puts it on its own scripts.
//
// Pages must render at request time for the nonce to reach them, so the root layout awaits
// `connection()` (pinned by src/app/layout.test.tsx). When <ClerkProvider> is added, pass it
// `dynamic` too, so it reads the nonce from the `x-nonce` request header for Clerk's scripts.

type AppEnv = 'dev' | 'preview' | 'prod';

const NONCE = /^[A-Za-z0-9+/_-]+={0,2}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/i;

const CLERK = {
  /** Development instances (keyless mode, dev and preview). */
  devFrontendApi: 'https://*.clerk.accounts.dev',
  images: 'https://img.clerk.com',
  protect: 'https://*.protect.clerk.com',
  telemetry: ['https://clerk-telemetry.com', 'https://*.clerk-telemetry.com'],
  /** Cloudflare Turnstile, Clerk's bot protection. */
  turnstile: 'https://challenges.cloudflare.com',
};

const SENTRY_INGEST = [
  'https://*.ingest.sentry.io',
  'https://*.ingest.us.sentry.io',
  'https://*.ingest.de.sentry.io',
];

const POSTHOG = {
  api: ['https://us.i.posthog.com', 'https://eu.i.posthog.com'],
  assets: ['https://us-assets.i.posthog.com', 'https://eu-assets.i.posthog.com'],
};

/** An https origin and nothing else: scheme, host and an optional port. */
const HTTPS_ORIGIN = /^https:\/\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}(?::\d{1,5})?$/i;

/** A fresh base64 nonce (128 random bits). */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The Frontend API host encoded in a Clerk publishable key (`pk_live_<base64 "host$">`), or null.
 * In keyless development there is no key in the environment; the dev wildcard covers it.
 */
export function frontendApiFromPublishableKey(key: string | undefined): string | null {
  const match = /^pk_(?:test|live)_([A-Za-z0-9+/=_-]+)$/.exec(key ?? '');
  if (!match?.[1]) return null;
  let decoded: string;
  try {
    decoded = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
  const host = decoded.replace(/\$$/, '');
  return HOSTNAME.test(host) ? host.toLowerCase() : null;
}

/**
 * The origin of our Supabase project (from SUPABASE_URL) when files live in Supabase Storage, or
 * null with local or stub storage. Browsers PUT uploads straight to its signed upload URLs and
 * load public and signed images from it, so the CSP must allow exactly this origin.
 */
export function storageOrigin(env: {
  STORAGE_PROVIDER: string;
  SUPABASE_URL?: string | null;
}): string | null {
  if (env.STORAGE_PROVIDER !== 'supabase' || !env.SUPABASE_URL) return null;
  try {
    const origin = new URL(env.SUPABASE_URL).origin.toLowerCase();
    return HTTPS_ORIGIN.test(origin) ? origin : null;
  } catch {
    return null;
  }
}

/**
 * The security headers for one response. `clerkFrontendApi` is the production Clerk Frontend
 * API host (from `frontendApiFromPublishableKey`); development instances are allowed outside prod.
 */
export function buildSecurityHeaders(i: {
  nonce: string;
  appEnv: AppEnv;
  clerkFrontendApi?: string | null;
  /** Our Supabase Storage origin (`storageOrigin(env)`), for uploads and images. */
  storageOrigin?: string | null;
}): Record<string, string> {
  if (!NONCE.test(i.nonce)) throw new Error('buildSecurityHeaders: the nonce must be base64');
  if (i.clerkFrontendApi && !HOSTNAME.test(i.clerkFrontendApi)) {
    throw new Error('buildSecurityHeaders: clerkFrontendApi must be a bare hostname');
  }
  if (i.storageOrigin && !HTTPS_ORIGIN.test(i.storageOrigin)) {
    throw new Error('buildSecurityHeaders: storageOrigin must be a bare https origin');
  }
  const storage = i.storageOrigin ? [i.storageOrigin] : [];

  const dev = i.appEnv === 'dev';
  const clerkApi = [
    ...(i.clerkFrontendApi ? [`https://${i.clerkFrontendApi}`] : []),
    ...(i.appEnv === 'prod' ? [] : [CLERK.devFrontendApi]),
  ];

  // With 'strict-dynamic', CSP3 browsers ignore the host list and trust only nonced scripts and
  // what they load; the hosts remain for browsers that predate it.
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    [
      'script-src',
      [
        "'self'",
        `'nonce-${i.nonce}'`,
        "'strict-dynamic'",
        ...(dev ? ["'unsafe-eval'"] : []),
        ...clerkApi,
        CLERK.protect,
        CLERK.turnstile,
        ...POSTHOG.assets,
      ],
    ],
    // Clerk styles its components with runtime CSS-in-JS.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'blob:', 'data:', CLERK.images, ...storage]],
    ['font-src', ["'self'", 'data:']],
    [
      'connect-src',
      [
        "'self'",
        // Uploads go from the browser straight to the signed upload URL.
        ...storage,
        ...clerkApi,
        `${CLERK.protect}:*`,
        ...CLERK.telemetry,
        ...SENTRY_INGEST,
        ...POSTHOG.api,
        ...POSTHOG.assets,
      ],
    ],
    ['worker-src', ["'self'", 'blob:']],
    ['frame-src', ["'self'", CLERK.turnstile, CLERK.protect]],
    ['manifest-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  // Local dev is plain http.
  if (!dev) directives.push(['upgrade-insecure-requests', []]);

  const csp = directives
    .map(([name, values]) => (values.length ? `${name} ${values.join(' ')}` : name))
    .join('; ');

  const headers: Record<string, string> = {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'X-Frame-Options': 'DENY',
  };
  if (i.appEnv === 'prod') {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  }
  return headers;
}
