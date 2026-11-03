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

function without<T extends Record<string, string>>(source: T, ...keys: (keyof T)[]) {
  const copy: Record<string, string | undefined> = { ...source };
  for (const key of keys) delete copy[key as string];
  return copy;
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

describe('getEnv', () => {
  it('parses process.env once and caches the result', () => {
    const first = getEnv();
    expect(getEnv()).toBe(first);
  });
});
