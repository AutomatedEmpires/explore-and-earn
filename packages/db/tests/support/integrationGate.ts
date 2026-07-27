/**
 * Whether a DB-connected suite may run, and — the point of this module — whether
 * a decision to SKIP one is allowed to pass quietly.
 *
 * THE DEFECT THIS CLOSES. Three suites in this package speak to a real database
 * (entitlementEnforcementIntegration, listingHostStatusIntegration,
 * rlsIsolation). Each computed its own `enabled` from environment variables and
 * handed it to `describe.skipIf`. Under a plain `vitest run` — which is what the
 * house validation command is, and what a reviewer reads — every one of them
 * reported as a quiet grey line among sixty-odd green ones. The headline count
 * therefore included twenty-one tests that had asserted nothing about any
 * database, and the suites that actually prove migration 083's refusals were the
 * ones missing.
 *
 * So a skip is now REPORTED, by a test that always runs, and in an environment
 * that declares the database is present (DB_INTEGRATION_REQUIRED=1) a skip is a
 * FAILURE rather than a silence.
 *
 * Pure and env-injected so it can be unit-tested directly — see
 * tests/integrationGate.test.ts.
 */

export interface IntegrationGateEnv {
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SUPABASE_JWT_SECRET?: string;
  readonly SUPABASE_RLS_INTEGRATION?: string;
  readonly DB_INTEGRATION_REQUIRED?: string;
}

export interface IntegrationGate {
  /** True when the suite may talk to a database. */
  readonly enabled: boolean;
  /** True when this environment has declared a skip unacceptable. */
  readonly required: boolean;
  /** Human-readable cause, always populated when `enabled` is false. */
  readonly reason: string;
}

export interface IntegrationGateOptions {
  /** Suite name, used in the reported message. */
  readonly label: string;
  /**
   * Whether SUPABASE_RLS_INTEGRATION=1 and a loopback URL are additionally
   * required. The two entitlement/transition suites create and delete rows, so
   * they demand both; rlsIsolation only reads and does not.
   */
  readonly requiresOptIn: boolean;
}

function isLoopbackUrl(value: string | undefined): boolean {
  try {
    const hostname = new URL(value ?? "").hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

export function resolveIntegrationGate(
  options: IntegrationGateOptions,
  env: IntegrationGateEnv,
): IntegrationGate {
  const required = env.DB_INTEGRATION_REQUIRED === "1";

  const missing: string[] = [];
  if (!env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!env.SUPABASE_JWT_SECRET) missing.push("SUPABASE_JWT_SECRET");

  if (missing.length > 0) {
    return { enabled: false, required, reason: `missing ${missing.join(", ")}` };
  }

  if (options.requiresOptIn) {
    if (env.SUPABASE_RLS_INTEGRATION !== "1") {
      return { enabled: false, required, reason: "SUPABASE_RLS_INTEGRATION is not 1" };
    }
    // A non-loopback URL hard-disables the suite: it writes and deletes rows.
    if (!isLoopbackUrl(env.NEXT_PUBLIC_SUPABASE_URL)) {
      return {
        enabled: false,
        required,
        reason: "NEXT_PUBLIC_SUPABASE_URL is not loopback",
      };
    }
  }

  return { enabled: true, required, reason: "" };
}

/** The sentence a skipped suite prints. Separated so it can be asserted. */
export function integrationSkipMessage(label: string, gate: IntegrationGate): string {
  return `SKIPPED (no database): ${label} asserted NOTHING this run — ${gate.reason}. A green total does not include it.`;
}

/**
 * Report the gate. Returns `enabled` so a caller can use it directly.
 *
 * Prints to stderr on a skip so the line survives vitest's quiet reporter, and
 * throws when the environment declared a database present.
 */
export function announceIntegrationGate(
  label: string,
  gate: IntegrationGate,
  warn: (message: string) => void = console.warn,
): boolean {
  if (gate.enabled) return true;

  const message = integrationSkipMessage(label, gate);
  warn(message);

  if (gate.required) {
    throw new Error(
      `${label}: DB_INTEGRATION_REQUIRED=1 but the connected suite cannot run — ${gate.reason}`,
    );
  }

  return false;
}
