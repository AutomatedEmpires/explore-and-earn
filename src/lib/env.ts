import { z } from 'zod';

const secret = z.string().min(32, 'must be at least 32 characters');
const optional = z.string().min(1).optional();

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

    // Billing (SP2)
    BILLING_PROVIDER: z.enum(['stripe', 'stub']),
    STRIPE_SECRET_KEY: z
      .string()
      .regex(/^sk_(test|live)_/, 'must start with sk_test_ or sk_live_')
      .optional(),
    STRIPE_WEBHOOK_SECRET: z
      .string()
      .regex(/^whsec_/, 'must start with whsec_')
      .optional(),
    STRIPE_PORTAL_CONFIG_FULL: z.string().regex(/^bpc_/, 'must start with bpc_').optional(),
    STRIPE_PORTAL_CONFIG_BILLING: z.string().regex(/^bpc_/, 'must start with bpc_').optional(),

    // Geocoding, weather and link safety (SP2)
    GEOCODER_PROVIDER: z.enum(['census', 'stub']),
    WEATHER_PROVIDER: z.enum(['nws', 'stub']),
    NWS_USER_AGENT: optional,
    LINK_SAFETY_PROVIDER: z.enum(['webrisk', 'stub']),
    WEB_RISK_API_KEY: optional,

    // Maps (SP2). A public token; required outside dev.
    NEXT_PUBLIC_MAPBOX_TOKEN: z.string().regex(/^pk\./, 'must start with pk.').optional(),
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
    if (env.BILLING_PROVIDER === 'stripe') {
      need('STRIPE_SECRET_KEY', 'when BILLING_PROVIDER=stripe');
      need('STRIPE_WEBHOOK_SECRET', 'when BILLING_PROVIDER=stripe');
      need('STRIPE_PORTAL_CONFIG_FULL', 'when BILLING_PROVIDER=stripe');
      need('STRIPE_PORTAL_CONFIG_BILLING', 'when BILLING_PROVIDER=stripe');
    }
    if (env.STRIPE_SECRET_KEY?.startsWith('sk_live_') && env.APP_ENV !== 'prod') {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'STRIPE_SECRET_KEY must be a test key outside prod',
      });
    }
    if (env.WEATHER_PROVIDER === 'nws') need('NWS_USER_AGENT', 'when WEATHER_PROVIDER=nws');
    if (env.LINK_SAFETY_PROVIDER === 'webrisk') {
      need('WEB_RISK_API_KEY', 'when LINK_SAFETY_PROVIDER=webrisk');
    }

    if (env.APP_ENV !== 'dev') {
      need('CLERK_SECRET_KEY', `when APP_ENV=${env.APP_ENV}`);
      need('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', `when APP_ENV=${env.APP_ENV}`);
      need('CLERK_WEBHOOK_SECRET', `when APP_ENV=${env.APP_ENV}`);
      need('NEXT_PUBLIC_MAPBOX_TOKEN', `when APP_ENV=${env.APP_ENV}`);
    }

    if (env.APP_ENV === 'prod') {
      const providers = [
        'AI_PROVIDER',
        'CHILD_SAFETY_PROVIDER',
        'MALWARE_PROVIDER',
        'EMAIL_PROVIDER',
        'STORAGE_PROVIDER',
        'BILLING_PROVIDER',
        'GEOCODER_PROVIDER',
        'WEATHER_PROVIDER',
        'LINK_SAFETY_PROVIDER',
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

/**
 * Validates an environment record. Empty values count as missing.
 * Throws an Error listing every problem, one per line, each starting with the variable name.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') cleaned[key] = value;
  }

  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.map(String).join('.') || '(root)';
      return `- ${key}: ${issue.message}`;
    });
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
