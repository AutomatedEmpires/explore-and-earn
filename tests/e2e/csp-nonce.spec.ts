// The CSP is nonce-based with 'strict-dynamic': a browser runs only the scripts that carry the
// response's nonce. A page prerendered at build time has scripts without one (or with a stale
// one), and nothing on it hydrates. Run against a production build to catch that:
// E2E_BASE_URL=https://<preview> pnpm e2e tests/e2e/csp-nonce.spec.ts
import { expect, test } from '@playwright/test';

const PAGES = ['/'];

for (const path of PAGES) {
  test(`every script on ${path} carries the nonce from its CSP header`, async ({ request }) => {
    const res = await request.get(path);
    expect(res.ok()).toBe(true);

    const csp = res.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, 'the response has a nonce CSP').toBeTruthy();

    const scripts = (await res.text()).match(/<script\b[^>]*>/gi) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) {
      expect(tag, 'script without the response nonce').toContain(`nonce="${nonce}"`);
    }
  });
}
