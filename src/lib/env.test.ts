import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv as parseDotenv } from 'node:util';
import { describe, expect, it } from 'vitest';
import { getEnv, parseEnv } from './env';

/** The public, committed defaults in .env.local.example. */
const example = parseDotenv(
  readFileSync(path.resolve(import.meta.dirname, '../../.env.local.example'), 'utf8'),
);

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

  it('keeps the operator passkey requirement unless ALLOW_OPERATOR_WITHOUT_PASSKEY=true', () => {
    expect(parseEnv(dev).ALLOW_OPERATOR_WITHOUT_PASSKEY).toBe(false);
    expect(parseEnv({ ...dev, ALLOW_OPERATOR_WITHOUT_PASSKEY: 'false' })).toMatchObject({
      ALLOW_OPERATOR_WITHOUT_PASSKEY: false,
    });
    expect(parseEnv({ ...dev, ALLOW_OPERATOR_WITHOUT_PASSKEY: 'true' })).toMatchObject({
      ALLOW_OPERATOR_WITHOUT_PASSKEY: true,
    });
    expect(() => parseEnv({ ...dev, ALLOW_OPERATOR_WITHOUT_PASSKEY: 'yes' })).toThrow(
      /ALLOW_OPERATOR_WITHOUT_PASSKEY/,
    );
  });

  it('refuses ALLOW_OPERATOR_WITHOUT_PASSKEY=true in prod', () => {
    expect(() => parseEnv({ ...prod, ALLOW_OPERATOR_WITHOUT_PASSKEY: 'true' })).toThrow(
      'ALLOW_OPERATOR_WITHOUT_PASSKEY is not allowed in prod',
    );
    expect(parseEnv({ ...prod, ALLOW_OPERATOR_WITHOUT_PASSKEY: 'false' })).toMatchObject({
      ALLOW_OPERATOR_WITHOUT_PASSKEY: false,
    });
  });
});

describe('the public placeholder secrets from .env.local.example', () => {
  const placeholders = {
    JOBS_SECRET: example.JOBS_SECRET ?? '',
    UNSUBSCRIBE_SECRET: example.UNSUBSCRIBE_SECRET ?? '',
    VAPID_PUBLIC_KEY: example.VAPID_PUBLIC_KEY ?? '',
    VAPID_PRIVATE_KEY: example.VAPID_PRIVATE_KEY ?? '',
  };

  it('are what the example file ships', () => {
    for (const value of Object.values(placeholders)) expect(value).toMatch(/^dev-/);
  });

  it('are accepted in dev', () => {
    expect(() => parseEnv({ ...dev, ...placeholders })).not.toThrow();
  });

  it.each(['preview', 'prod'])('are each refused, by name, when APP_ENV=%s', (appEnv) => {
    for (const [key, value] of Object.entries(placeholders)) {
      expect(() => parseEnv({ ...prod, APP_ENV: appEnv, [key]: value })).toThrow(
        new RegExp(`${key}: .*placeholder`),
      );
    }
  });
});

describe('STORAGE_PROVIDER=stub (in-memory storage)', () => {
  it('is refused for a running server: no browser can upload to it', () => {
    expect(() => parseEnv({ ...dev, STORAGE_PROVIDER: 'stub' })).toThrow(/STORAGE_PROVIDER/);
    expect(() =>
      parseEnv({ ...prod, APP_ENV: 'preview', STORAGE_PROVIDER: 'stub' }),
    ).toThrow(/STORAGE_PROVIDER/);
  });

  it('is allowed under a test runner', () => {
    expect(parseEnv({ ...dev, STORAGE_PROVIDER: 'stub', VITEST: 'true' }).STORAGE_PROVIDER).toBe(
      'stub',
    );
    expect(() => parseEnv({ ...dev, STORAGE_PROVIDER: 'stub', NODE_ENV: 'test' })).not.toThrow();
  });
});

describe('getEnv', () => {
  it('parses process.env once and caches the result', () => {
    const first = getEnv();
    expect(getEnv()).toBe(first);
  });
});
