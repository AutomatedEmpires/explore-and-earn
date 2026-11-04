import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv as parseDotenv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { getEnv, parseEnv } from './env';

const dev = {
  APP_ENV: 'dev',
  APP_URL: 'http://localhost:3000',
  ADMIN_HOST: 'admin.localhost:3000',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/postgres',
  STORAGE_PROVIDER: 'local',
  AI_PROVIDER: 'stub',
  CHILD_SAFETY_PROVIDER: 'stub',
  MALWARE_PROVIDER: 'stub',
  EMAIL_PROVIDER: 'stub',
  EMAIL_FROM: 'Explore&Earn <noreply@example.test>',
  VAPID_PUBLIC_KEY: 'test-vapid-public',
  VAPID_PRIVATE_KEY: 'test-vapid-private',
  VAPID_SUBJECT: 'mailto:dev@example.test',
  JOBS_SECRET: 'j'.repeat(32),
  UNSUBSCRIBE_SECRET: 'u'.repeat(32),
  BILLING_PROVIDER: 'stub',
  GEOCODER_PROVIDER: 'stub',
  WEATHER_PROVIDER: 'stub',
  LINK_SAFETY_PROVIDER: 'stub',
} satisfies Record<string, string>;

const prod = {
  ...dev,
  APP_ENV: 'prod',
  APP_URL: 'https://exploreandearn.test',
  ADMIN_HOST: 'admin.exploreandearn.test',
  CLERK_SECRET_KEY: 'test-clerk-secret',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'test-clerk-publishable',
  CLERK_WEBHOOK_SECRET: 'test-clerk-webhook',
  STORAGE_PROVIDER: 'supabase',
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
  AI_PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'test-anthropic',
  CHILD_SAFETY_PROVIDER: 'photodna',
  PHOTODNA_KEY: 'test-photodna',
  MALWARE_PROVIDER: 'cloudmersive',
  CLOUDMERSIVE_API_KEY: 'test-cloudmersive',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'test-resend',
  BILLING_PROVIDER: 'stripe',
  STRIPE_SECRET_KEY: 'sk_test_prod',
  STRIPE_WEBHOOK_SECRET: 'whsec_test',
  STRIPE_PORTAL_CONFIG_FULL: 'bpc_full',
  STRIPE_PORTAL_CONFIG_BILLING: 'bpc_billing',
  GEOCODER_PROVIDER: 'census',
  WEATHER_PROVIDER: 'nws',
  NWS_USER_AGENT: 'Explore&Earn (support@exploreandearn.com)',
  LINK_SAFETY_PROVIDER: 'webrisk',
  WEB_RISK_API_KEY: 'test-web-risk',
  NEXT_PUBLIC_MAPBOX_TOKEN: 'pk.test',
} satisfies Record<string, string>;

function without<T extends Record<string, string>>(source: T, ...keys: (keyof T & string)[]) {
  const drop = new Set<string>(keys);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !drop.has(key)));
}

describe('parseEnv', () => {
  it('parses a dev environment with stub and local providers', () => {
    const env = parseEnv(dev);
    expect(env.APP_ENV).toBe('dev');
    expect(env.STORAGE_PROVIDER).toBe('local');
    expect(env.LOCAL_STORAGE_DIR).toBe('.data/storage');
    expect(env.CLERK_SECRET_KEY).toBeUndefined();
  });

  it('parses a complete prod environment', () => {
    const env = parseEnv(prod);
    expect(env.APP_ENV).toBe('prod');
    expect(env.AI_PROVIDER).toBe('anthropic');
    expect(env.ANTHROPIC_API_KEY).toBe('test-anthropic');
  });

  it('throws naming DATABASE_URL when it is missing', () => {
    expect(() => parseEnv(without(dev, 'DATABASE_URL'))).toThrow(/DATABASE_URL/);
  });

  it('rejects an unknown APP_ENV', () => {
    expect(() => parseEnv({ ...dev, APP_ENV: 'staging' })).toThrow(/APP_ENV/);
  });

  it('refuses a stub malware provider in prod', () => {
    expect(() => parseEnv({ ...prod, MALWARE_PROVIDER: 'stub' })).toThrow(
      'Stub provider not allowed in prod: MALWARE_PROVIDER',
    );
  });

  it.each([
    'AI_PROVIDER',
    'CHILD_SAFETY_PROVIDER',
    'MALWARE_PROVIDER',
    'EMAIL_PROVIDER',
    'STORAGE_PROVIDER',
  ])('refuses %s=stub in prod', (name) => {
    expect(() => parseEnv({ ...prod, [name]: 'stub' })).toThrow(
      `Stub provider not allowed in prod: ${name}`,
    );
  });

  it('refuses local storage in prod', () => {
    expect(() => parseEnv({ ...prod, STORAGE_PROVIDER: 'local' })).toThrow(/STORAGE_PROVIDER/);
  });

  it('allows stub providers in preview', () => {
    expect(() =>
      parseEnv({ ...prod, APP_ENV: 'preview', MALWARE_PROVIDER: 'stub', AI_PROVIDER: 'stub' }),
    ).not.toThrow();
  });

  it('requires ANTHROPIC_API_KEY when AI_PROVIDER=anthropic', () => {
    expect(() => parseEnv({ ...dev, AI_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('treats an empty value as missing', () => {
    expect(() => parseEnv({ ...dev, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it('requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY when STORAGE_PROVIDER=supabase', () => {
    expect(() => parseEnv(without(prod, 'SUPABASE_URL'))).toThrow(/SUPABASE_URL/);
    expect(() => parseEnv(without(prod, 'SUPABASE_SERVICE_ROLE_KEY'))).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('requires the key of every real provider', () => {
    expect(() => parseEnv(without(prod, 'PHOTODNA_KEY'))).toThrow(/PHOTODNA_KEY/);
    expect(() => parseEnv(without(prod, 'CLOUDMERSIVE_API_KEY'))).toThrow(/CLOUDMERSIVE_API_KEY/);
    expect(() => parseEnv(without(prod, 'RESEND_API_KEY'))).toThrow(/RESEND_API_KEY/);
  });

  it('requires the Clerk keys outside dev (dev may run Clerk keyless)', () => {
    expect(() => parseEnv(without(prod, 'CLERK_SECRET_KEY'))).toThrow(/CLERK_SECRET_KEY/);
    expect(() => parseEnv(without(prod, 'CLERK_WEBHOOK_SECRET'))).toThrow(/CLERK_WEBHOOK_SECRET/);
    expect(() => parseEnv(without(prod, 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'))).toThrow(
      /NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/,
    );
  });

  it('requires secrets of at least 32 characters', () => {
    expect(() => parseEnv({ ...dev, JOBS_SECRET: 'short' })).toThrow(/JOBS_SECRET/);
    expect(() => parseEnv({ ...dev, UNSUBSCRIBE_SECRET: 'short' })).toThrow(/UNSUBSCRIBE_SECRET/);
  });
});

describe('parseEnv: SP2 providers', () => {
  it.each(['BILLING_PROVIDER', 'GEOCODER_PROVIDER', 'WEATHER_PROVIDER', 'LINK_SAFETY_PROVIDER'])(
    'refuses %s=stub in prod',
    (name) => {
      expect(() => parseEnv({ ...prod, [name]: 'stub' })).toThrow(
        `Stub provider not allowed in prod: ${name}`,
      );
    },
  );

  it.each([
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PORTAL_CONFIG_FULL',
    'STRIPE_PORTAL_CONFIG_BILLING',
  ] as const)('requires %s when BILLING_PROVIDER=stripe', (key) => {
    expect(() => parseEnv(without(prod, key))).toThrow(new RegExp(key));
  });

  it('checks the shape of the Stripe keys', () => {
    expect(() => parseEnv({ ...prod, STRIPE_SECRET_KEY: 'pk_test_x' })).toThrow(
      /STRIPE_SECRET_KEY/,
    );
    expect(() => parseEnv({ ...prod, STRIPE_WEBHOOK_SECRET: 'secret' })).toThrow(
      /STRIPE_WEBHOOK_SECRET/,
    );
    expect(() => parseEnv({ ...prod, STRIPE_PORTAL_CONFIG_FULL: 'cfg_x' })).toThrow(
      /STRIPE_PORTAL_CONFIG_FULL/,
    );
    expect(() => parseEnv({ ...prod, NEXT_PUBLIC_MAPBOX_TOKEN: 'sk.secret' })).toThrow(
      /NEXT_PUBLIC_MAPBOX_TOKEN/,
    );
  });

  it.each(['dev', 'preview'])('refuses a live Stripe key when APP_ENV=%s', (appEnv) => {
    expect(() =>
      parseEnv({ ...prod, APP_ENV: appEnv, STRIPE_SECRET_KEY: 'sk_live_x' }),
    ).toThrow('STRIPE_SECRET_KEY must be a test key outside prod');
  });

  it('accepts a test Stripe key in dev and either key in prod', () => {
    expect(parseEnv({ ...prod, APP_ENV: 'dev', STRIPE_SECRET_KEY: 'sk_test_x' }).BILLING_PROVIDER).toBe(
      'stripe',
    );
    expect(parseEnv(prod).STRIPE_SECRET_KEY).toBe('sk_test_prod');
    expect(parseEnv({ ...prod, STRIPE_SECRET_KEY: 'sk_live_x' }).STRIPE_SECRET_KEY).toBe(
      'sk_live_x',
    );
  });

  it('requires NWS_USER_AGENT when WEATHER_PROVIDER=nws', () => {
    expect(() => parseEnv(without(prod, 'NWS_USER_AGENT'))).toThrow(/NWS_USER_AGENT/);
    expect(() => parseEnv({ ...dev, WEATHER_PROVIDER: 'nws' })).toThrow(/NWS_USER_AGENT/);
  });

  it('requires WEB_RISK_API_KEY when LINK_SAFETY_PROVIDER=webrisk', () => {
    expect(() => parseEnv(without(prod, 'WEB_RISK_API_KEY'))).toThrow(/WEB_RISK_API_KEY/);
    expect(() => parseEnv({ ...dev, LINK_SAFETY_PROVIDER: 'webrisk' })).toThrow(
      /WEB_RISK_API_KEY/,
    );
  });

  it('requires NEXT_PUBLIC_MAPBOX_TOKEN in preview and prod, not in dev', () => {
    expect(() =>
      parseEnv(without({ ...prod, APP_ENV: 'preview' }, 'NEXT_PUBLIC_MAPBOX_TOKEN')),
    ).toThrow(/NEXT_PUBLIC_MAPBOX_TOKEN/);
    expect(() => parseEnv(without(prod, 'NEXT_PUBLIC_MAPBOX_TOKEN'))).toThrow(
      /NEXT_PUBLIC_MAPBOX_TOKEN/,
    );
    expect(parseEnv(dev).NEXT_PUBLIC_MAPBOX_TOKEN).toBeUndefined();
  });

  it('requires each SP2 provider choice', () => {
    for (const key of [
      'BILLING_PROVIDER',
      'GEOCODER_PROVIDER',
      'WEATHER_PROVIDER',
      'LINK_SAFETY_PROVIDER',
    ] as const) {
      expect(() => parseEnv(without(dev, key))).toThrow(new RegExp(key));
    }
  });
});

describe('.env.local.example', () => {
  it('parses, with the SP2 providers set to stub', () => {
    const file = readFileSync(path.resolve('.env.local.example'), 'utf8');
    const env = parseEnv(parseDotenv(file));
    expect(env.BILLING_PROVIDER).toBe('stub');
    expect(env.GEOCODER_PROVIDER).toBe('stub');
    expect(env.WEATHER_PROVIDER).toBe('stub');
    expect(env.LINK_SAFETY_PROVIDER).toBe('stub');
    expect(env.NWS_USER_AGENT).toBe('Explore&Earn (support@exploreandearn.com)');
  });
});

describe('getEnv', () => {
  it('parses process.env once and caches the result', () => {
    const first = getEnv();
    expect(getEnv()).toBe(first);
  });
});
