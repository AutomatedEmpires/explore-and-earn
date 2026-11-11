// `pnpm e2e:seed`: writes tests/e2e/.seed.json for the discovery fixtures.
// Local or CI throwaway databases only. Does not print secrets.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

function fileEnv(name: string): Record<string, string> {
  if (!existsSync(name)) return {};
  const parsed = parseEnv(readFileSync(name, 'utf8'));
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value) out[key] = value;
  }
  return out;
}

const fromFiles = { ...fileEnv('.env.local.example'), ...fileEnv('.env.local') };
for (const [key, value] of Object.entries(fromFiles)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

const STUBS = {
  AI_PROVIDER: 'stub',
  CHILD_SAFETY_PROVIDER: 'stub',
  MALWARE_PROVIDER: 'stub',
  BILLING_PROVIDER: 'stub',
  GEOCODER_PROVIDER: 'stub',
  WEATHER_PROVIDER: 'stub',
  LINK_SAFETY_PROVIDER: 'stub',
  EMAIL_PROVIDER: 'stub',
  STORAGE_PROVIDER: 'local',
} as const;
for (const [key, value] of Object.entries(STUBS)) process.env[key] = value;

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database]')
    .replace(/sk_(?:test|live)_\S+/g, '[key]');
}

function issueSummary(err: unknown): string {
  if (typeof err !== 'object' || err === null || !('details' in err)) return '';
  const details = err.details;
  if (typeof details !== 'object' || details === null || !('issues' in details)) return '';
  if (!Array.isArray(details.issues)) return '';
  const parts = details.issues.slice(0, 8).flatMap((issue) => {
    if (typeof issue !== 'object' || issue === null) return [];
    const code = 'code' in issue && typeof issue.code === 'string' ? issue.code : '';
    const field = 'field' in issue && typeof issue.field === 'string' ? issue.field : '';
    const label = `${code}${field ? `:${field}` : ''}`;
    return label ? [label] : [];
  });
  return parts.length > 0 ? ` (${parts.join(', ')})` : '';
}

function assertThrowawayDatabase(): void {
  if (process.env.APP_ENV === 'prod') {
    throw new Error('e2e seed: refusing to run when APP_ENV=prod');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('e2e seed: DATABASE_URL is not set');
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error('e2e seed: DATABASE_URL is not a URL');
  }
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!local && process.env.CI !== 'true') {
    throw new Error('e2e seed: refusing to seed a database that is not on localhost');
  }
}

assertThrowawayDatabase();

const { resetEnvCache } = await import('../src/lib/env');
resetEnvCache();
const { getDb, closeDb } = await import('../src/lib/db');
const { SEED_FILE, seedDiscoveryFixtures } = await import('../tests/e2e/fixtures/discovery-seed');

const db = getDb();
try {
  const fixtures = await seedDiscoveryFixtures(db);
  writeFileSync(SEED_FILE, `${JSON.stringify(fixtures, null, 2)}\n`);
  console.log('e2e seed wrote tests/e2e/.seed.json');
} catch (err) {
  const parts: string[] = [];
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    parts.push(`${current.message}${issueSummary(current)}`);
    current = current.cause;
  }
  console.error(redact(parts.join(' — ') || 'e2e seed failed'));
  process.exitCode = 1;
} finally {
  await Promise.race([closeDb(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
  process.exit(process.exitCode ?? 0);
}
