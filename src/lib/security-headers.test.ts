import { describe, expect, it } from 'vitest';
import { buildSecurityHeaders, frontendApiFromPublishableKey, newNonce } from './security-headers';

function directives(csp: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) map.set(name, values);
  }
  return map;
}

describe('buildSecurityHeaders', () => {
  it('sends HSTS in prod only', () => {
    const prod = buildSecurityHeaders({ nonce: 'abc', appEnv: 'prod' });
    expect(prod['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}; includeSubDomains$/);
    expect(buildSecurityHeaders({ nonce: 'abc', appEnv: 'dev' })).not.toHaveProperty(
      'Strict-Transport-Security',
    );
    expect(buildSecurityHeaders({ nonce: 'abc', appEnv: 'preview' })).not.toHaveProperty(
      'Strict-Transport-Security',
    );
  });

  it('puts the nonce and strict-dynamic in script-src', () => {
    const csp = buildSecurityHeaders({ nonce: 'abc', appEnv: 'prod' })['Content-Security-Policy'];
    expect(csp).toContain("'nonce-abc'");
    const script = directives(csp ?? '').get('script-src') ?? [];
    expect(script.slice(0, 3)).toEqual(["'self'", "'nonce-abc'", "'strict-dynamic'"]);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("allows 'unsafe-eval' in dev only, for React's debugging", () => {
    const dev = buildSecurityHeaders({ nonce: 'abc', appEnv: 'dev' })['Content-Security-Policy'];
    expect(directives(dev ?? '').get('script-src')).toContain("'unsafe-eval'");
  });

  it('blocks framing, objects and foreign form targets', () => {
    const csp = directives(
      buildSecurityHeaders({ nonce: 'abc', appEnv: 'prod' })['Content-Security-Policy'] ?? '',
    );
    expect(csp.get('frame-ancestors')).toEqual(["'none'"]);
    expect(csp.get('object-src')).toEqual(["'none'"]);
    expect(csp.get('base-uri')).toEqual(["'self'"]);
    expect(csp.get('form-action')).toEqual(["'self'"]);
    expect(csp.get('default-src')).toEqual(["'self'"]);
    expect(csp.has('upgrade-insecure-requests')).toBe(true);
  });

  it('allows the Clerk, Sentry and PostHog hosts', () => {
    const csp = directives(
      buildSecurityHeaders({
        nonce: 'abc',
        appEnv: 'prod',
        clerkFrontendApi: 'clerk.exploreandearn.test',
      })['Content-Security-Policy'] ?? '',
    );
    const connect = csp.get('connect-src') ?? [];
    expect(connect).toContain('https://clerk.exploreandearn.test');
    expect(connect).toContain('https://*.ingest.us.sentry.io');
    expect(connect).toContain('https://us.i.posthog.com');
    expect(csp.get('script-src')).toContain('https://clerk.exploreandearn.test');
    expect(csp.get('img-src')).toContain('https://img.clerk.com');
    expect(csp.get('frame-src')).toContain('https://challenges.cloudflare.com');
    expect(csp.get('worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('allows Mapbox GL (tiles, telemetry and its blob workers)', () => {
    const csp = directives(
      buildSecurityHeaders({ nonce: 'abc', appEnv: 'prod' })['Content-Security-Policy'] ?? '',
    );
    expect(csp.get('connect-src')).toContain('https://api.mapbox.com');
    expect(csp.get('connect-src')).toContain('https://events.mapbox.com');
    expect(csp.get('worker-src')).toContain('blob:');
  });

  it("allows Clerk's development hosts outside prod", () => {
    const dev = directives(
      buildSecurityHeaders({ nonce: 'abc', appEnv: 'dev' })['Content-Security-Policy'] ?? '',
    );
    expect(dev.get('connect-src')).toContain('https://*.clerk.accounts.dev');
    const prod = directives(
      buildSecurityHeaders({ nonce: 'abc', appEnv: 'prod' })['Content-Security-Policy'] ?? '',
    );
    expect(prod.get('connect-src')).not.toContain('https://*.clerk.accounts.dev');
  });

  it('keeps everything outside prod out of search engines (SP3 spec 8.11)', () => {
    expect(buildSecurityHeaders({ nonce: 'abc', appEnv: 'preview' })['X-Robots-Tag']).toBe(
      'noindex',
    );
    expect(buildSecurityHeaders({ nonce: 'abc', appEnv: 'dev' })['X-Robots-Tag']).toBe('noindex');
    expect(buildSecurityHeaders({ nonce: 'abc', appEnv: 'prod' })['X-Robots-Tag']).toBeUndefined();
  });

  it('sends the standard hardening headers', () => {
    const h = buildSecurityHeaders({ nonce: 'abc', appEnv: 'dev' });
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=(self)');
    expect(h['X-Frame-Options']).toBe('DENY');
  });

  it('rejects a nonce or Clerk host that could break out of the header', () => {
    expect(() => buildSecurityHeaders({ nonce: "abc' 'unsafe-inline", appEnv: 'prod' })).toThrow();
    expect(() =>
      buildSecurityHeaders({
        nonce: 'abc',
        appEnv: 'prod',
        clerkFrontendApi: 'x.test; script-src *',
      }),
    ).toThrow();
  });
});

describe('newNonce', () => {
  it('returns a fresh base64 value each time', () => {
    const a = newNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22,}={0,2}$/);
    expect(newNonce()).not.toBe(a);
  });
});

describe('frontendApiFromPublishableKey', () => {
  it('decodes the Frontend API host from a publishable key', () => {
    const key = `pk_live_${Buffer.from('clerk.exploreandearn.test$').toString('base64')}`;
    expect(frontendApiFromPublishableKey(key)).toBe('clerk.exploreandearn.test');
  });

  it('returns null for a missing or malformed key', () => {
    expect(frontendApiFromPublishableKey(undefined)).toBeNull();
    expect(frontendApiFromPublishableKey('not-a-key')).toBeNull();
    expect(
      frontendApiFromPublishableKey(`pk_test_${Buffer.from('bad host; x$').toString('base64')}`),
    ).toBeNull();
  });
});
