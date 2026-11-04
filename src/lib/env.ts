import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');
const optional = z.string().min(1).optional();

/**
 * The values .env.local.example ships for its secrets ("dev-only-...", "dev-placeholder-...").
 * The repo is public, so outside dev they are no secret at all: anyone could forge unsubscribe
 * tokens or call the jobs endpoint. gitleaks allowlists them by value, so only this check
 * stops a preview or prod deploy that was filled in from the example.
 */
const PUBLIC_PLACEHOLDER = /^dev-(only|placeholder)-/;
const PLACEHOLDER_CHECKED = [
  'JOBS_SECRET',
  'UNSUBSCRIBE_SECRET',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
] as const;

const schema = z
  .object({
    // App
    APP_ENV: z.enum(['dev', 'preview', 'prod']),
    APP_URL: z.url(),
    ADMIN_HOST: z.string().min(1),
    DATABASE_URL: z.string().min(1),

    // Clerk. Optional in dev, where Clerk can run keyless; required in preview and prod.
    CLERK_SECRET_KEY: optional,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optional,
    CLERK_WEBHOOK_SECRET: optional,

    // Storage
    STORAGE_PROVIDER: z.enum(['supabase', 'local', 'stub']),
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: optional,
    LOCAL_STORAGE_DIR: z.string().min(1).default('.data/storage'),

    // AI
    AI_PROVIDER: z.enum(['anthropic', 'stub']),
    ANTHROPIC_API_KEY: optional,

    // Child safety
    CHILD_SAFETY_PROVIDER: z.enum(['photodna', 'stub']),
    PHOTODNA_KEY: optional,
    CHILD_SAFETY_STUB_HASHES: optional,

    // Malware
    MALWARE_PROVIDER: z.enum(['cloudmersive', 'stub']),
    CLOUDMERSIVE_API_KEY: optional,

    // Email
    EMAIL_PROVIDER: z.enum(['resend', 'stub']),
    RESEND_API_KEY: optional,
    EMAIL_FROM: z.string().min(1),

    // Push
    VAPID_PUBLIC_KEY: z.string().min(1),
    VAPID_PRIVATE_KEY: z.string().min(1),
    VAPID_SUBJECT: z.string().min(1),

    // Secrets
    JOBS_SECRET: secret,
    UNSUBSCRIBE_SECRET: secret,

    // Monitoring
    SENTRY_DSN: optional,
    NEXT_PUBLIC_POSTHOG_KEY: optional,
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, because: string) => {
      if (env[key] === undefined) {
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required ${because}` });
      }
    };

    if (env.STORAGE_PROVIDER === 'supabase') {
      need('SUPABASE_URL', 'when STORAGE_PROVIDER=supabase');
      need('SUPABASE_SERVICE_ROLE_KEY', 'when STORAGE_PROVIDER=supabase');
    }
    if (env.AI_PROVIDER === 'anthropic') need('ANTHROPIC_API_KEY', 'when AI_PROVIDER=anthropic');
    if (env.CHILD_SAFETY_PROVIDER === 'photodna') {
      need('PHOTODNA_KEY', 'when CHILD_SAFETY_PROVIDER=photodna');
    }
    if (env.MALWARE_PROVIDER === 'cloudmersive') {
      need('CLOUDMERSIVE_API_KEY', 'when MALWARE_PROVIDER=cloudmersive');
    }
    if (env.EMAIL_PROVIDER === 'resend') need('RESEND_API_KEY', 'when EMAIL_PROVIDER=resend');

    if (env.APP_ENV !== 'dev') {
      need('CLERK_SECRET_KEY', `when APP_ENV=${env.APP_ENV}`);
      need('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', `when APP_ENV=${env.APP_ENV}`);
      need('CLERK_WEBHOOK_SECRET', `when APP_ENV=${env.APP_ENV}`);

      for (const key of PLACEHOLDER_CHECKED) {
        if (PUBLIC_PLACEHOLDER.test(env[key])) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `the public placeholder from .env.local.example is not allowed when APP_ENV=${env.APP_ENV}; generate a real value`,
          });
        }
      }
    }

    if (env.APP_ENV === 'prod') {
      const providers = [
        'AI_PROVIDER',
        'CHILD_SAFETY_PROVIDER',
        'MALWARE_PROVIDER',
        'EMAIL_PROVIDER',
        'STORAGE_PROVIDER',
      ] as const;
      for (const name of providers) {
        const value: string = env[name];
        if (value === 'stub' || value === 'local') {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: `Stub provider not allowed in prod: ${name}`,
          });
        }
      }
    }
  });

export type Env = z.output<typeof schema>;

/** Whether `source` is a test runner's environment (Vitest sets VITEST). */
function isTestRun(source: Record<string, string | undefined>): boolean {
  return Boolean(source.VITEST) || source.NODE_ENV === 'test';
}

/**
 * Validates an environment record. Empty values count as missing.
 * Throws an Error listing every problem, one per line, each starting with the variable name.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }

  const lines: string[] = [];
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const key = issue.path.map(String).join('.') || '(root)';
      lines.push(`- ${key}: ${issue.message}`);
    }
  }
  // In-memory storage lives in one process: a browser cannot upload to its memory:// URLs, and
  // serverless instances do not share it. It exists for unit tests, which run under Vitest.
  if (cleaned.STORAGE_PROVIDER === 'stub' && !isTestRun(source)) {
    lines.push(
      '- STORAGE_PROVIDER: stub (in-memory) is for unit tests only; use local in dev and supabase elsewhere',
    );
  }
  if (!result.success || lines.length > 0) {
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Parses `process.env` on first use and returns the same object afterwards. Server only. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Clears the cache so the next `getEnv()` re-reads `process.env`. For tests. */
export function resetEnvCache(): void {
  cached = undefined;
}
