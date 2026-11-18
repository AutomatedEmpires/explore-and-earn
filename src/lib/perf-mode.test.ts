import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';
import { isPerfMode, perfUserFromHeader, perfUserHeaderValue } from './perf-mode';

const secret = 'p'.repeat(32);
const id = '018f6b2e-6c3a-7b2e-8c3a-6c3a7b2e8c3a';

const base = {
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
  ANALYTICS_HASH_SECRET: 'a'.repeat(32),
  SUPPORT_REPLY_SECRET: 's'.repeat(32),
  BILLING_PROVIDER: 'stub',
  GEOCODER_PROVIDER: 'stub',
  WEATHER_PROVIDER: 'stub',
  LINK_SAFETY_PROVIDER: 'stub',
} satisfies Record<string, string>;

describe('perf user header', () => {
  const env = parseEnv({ ...base, PERF_MODE: '1', PERF_SECRET: secret });

  it('round-trips a user id only in perf mode', () => {
    expect(isPerfMode(env)).toBe(true);
    const header = perfUserHeaderValue(id, secret);
    expect(perfUserFromHeader(header, env)).toBe(id);
    expect(perfUserFromHeader(`${id}.not-the-signature`, env)).toBeNull();
    expect(perfUserFromHeader(header, parseEnv(base))).toBeNull();
    expect(perfUserFromHeader('abc', env)).toBeNull();
    expect(perfUserFromHeader(`not-a-uuid.${header.split('.')[1]}`, env)).toBeNull();
  });
});
