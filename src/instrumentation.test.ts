// The prod stub guard (plan Global Constraints): with APP_ENV=prod, a stub or local provider
// must stop the server instance from starting, not fail each request later.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetEnvCache } from '@/lib/env';
import { register } from './instrumentation';

const prodEnv = {
  APP_ENV: 'prod',
  APP_URL: 'https://exploreandearn.test',
  ADMIN_HOST: 'admin.exploreandearn.test',
  CLERK_SECRET_KEY: 'test-clerk-secret',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-clerk-publishable',
  CLERK_WEBHOOK_SECRET: 'test-clerk-webhook',
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  ANTHROPIC_API_KEY: 'test-anthropic',
  PHOTODNA_KEY: 'test-photodna',
  CLOUDMERSIVE_API_KEY: 'test-cloudmersive',
  RESEND_API_KEY: 'test-resend',
  AI_PROVIDER: 'anthropic',
  CHILD_SAFETY_PROVIDER: 'photodna',
  MALWARE_PROVIDER: 'cloudmersive',
  EMAIL_PROVIDER: 'resend',
  VAPID_PUBLIC_KEY: 'test-vapid-public',
  VAPID_PRIVATE_KEY: 'test-vapid-private',
  JOBS_SECRET: 'j'.repeat(32),
  UNSUBSCRIBE_SECRET: 'u'.repeat(32),
  SENTRY_DSN: '',
  BILLING_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_live_test_secret',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PORTAL_CONFIG_FULL: 'bpc_full',
  STRIPE_PORTAL_CONFIG_BILLING: 'bpc_billing',
  GEOCODER_PROVIDER: 'census',
  WEATHER_PROVIDER: 'nws',
  NWS_USER_AGENT: 'Explore&Earn (test@exploreandearn.test)',
  LINK_SAFETY_PROVIDER: 'webrisk',
  WEB_RISK_API_KEY: 'test-webrisk',
  NEXT_PUBLIC_MAPBOX_TOKEN: 'pk.test_mapbox',
};

function stubAll(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  resetEnvCache();
}

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('register (server start)', () => {
  it('throws on the Node.js runtime when a prod deploy is configured with a stub provider', async () => {
    stubAll({ ...prodEnv, NEXT_RUNTIME: 'nodejs', STORAGE_PROVIDER: 'local' });
    await expect(register()).rejects.toThrow('Stub provider not allowed in prod: STORAGE_PROVIDER');
  });

  it('starts when the prod environment is valid', async () => {
    stubAll({ ...prodEnv, NEXT_RUNTIME: 'nodejs', STORAGE_PROVIDER: 'supabase' });
    await expect(register()).resolves.toBeUndefined();
  });
});

describe('next.config (build)', () => {
  it('fails `next build` for a prod deploy with a stub provider', async () => {
    stubAll({ ...prodEnv, STORAGE_PROVIDER: 'supabase', MALWARE_PROVIDER: 'stub' });
    vi.resetModules();
    await expect(import('../next.config')).rejects.toThrow(
      'Stub provider not allowed in prod: MALWARE_PROVIDER',
    );
  });

  it('loads in dev without validating anything', async () => {
    vi.stubEnv('APP_ENV', 'dev');
    vi.resetModules();
    await expect(import('../next.config')).resolves.toHaveProperty('default');
  });
});
