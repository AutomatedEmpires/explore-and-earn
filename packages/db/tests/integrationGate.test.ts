/**
 * A SKIPPED CONNECTED SUITE MUST NOT LOOK LIKE A PASSING ONE.
 *
 * Three suites in this package speak to a real database and self-skip when the
 * environment has none. Under a plain `vitest run` each reported as a grey line
 * inside a green total, so twenty-one tests — including every assertion about
 * migration 083's refusals — could contribute nothing to a run that read as full
 * coverage. support/integrationGate.ts makes the skip say so, and makes it a
 * failure in an environment that declared a database present.
 */
import { describe, expect, it } from "vitest";

import {
  announceIntegrationGate,
  integrationSkipMessage,
  resolveIntegrationGate,
  type IntegrationGateEnv,
} from "./support/integrationGate.js";

const FULL_ENV: IntegrationGateEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  SUPABASE_JWT_SECRET: "secret",
  SUPABASE_RLS_INTEGRATION: "1",
};

describe("resolveIntegrationGate", () => {
  it("enables a suite when every credential and the opt-in are present", () => {
    const gate = resolveIntegrationGate({ label: "s", requiresOptIn: true }, FULL_ENV);
    expect(gate).toEqual({ enabled: true, required: false, reason: "" });
  });

  it.each([
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_JWT_SECRET",
  ] as const)("disables the suite when %s is missing, and names it", (key) => {
    const env = { ...FULL_ENV, [key]: undefined };
    const gate = resolveIntegrationGate({ label: "s", requiresOptIn: true }, env);
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toContain(key);
  });

  it("keeps the write-heavy suites behind SUPABASE_RLS_INTEGRATION=1", () => {
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: true },
      { ...FULL_ENV, SUPABASE_RLS_INTEGRATION: undefined },
    );
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toContain("SUPABASE_RLS_INTEGRATION");
  });

  /**
   * The suites that opt in CREATE AND DELETE rows. A non-loopback URL is how one
   * of them would run against a shared or production database.
   */
  it("refuses a non-loopback URL for a suite that writes", () => {
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: true },
      { ...FULL_ENV, NEXT_PUBLIC_SUPABASE_URL: "https://prod.supabase.co" },
    );
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toContain("loopback");
  });

  it("does not demand the opt-in or loopback from a read-only suite", () => {
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: false },
      {
        NEXT_PUBLIC_SUPABASE_URL: "https://staging.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        SUPABASE_JWT_SECRET: "secret",
      },
    );
    expect(gate.enabled).toBe(true);
  });

  it("carries DB_INTEGRATION_REQUIRED through even when the gate opens", () => {
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: true },
      { ...FULL_ENV, DB_INTEGRATION_REQUIRED: "1" },
    );
    expect(gate).toEqual({ enabled: true, required: true, reason: "" });
  });
});

describe("announceIntegrationGate", () => {
  it("says nothing when the suite really runs", () => {
    const warnings: string[] = [];
    const gate = resolveIntegrationGate({ label: "s", requiresOptIn: true }, FULL_ENV);

    expect(announceIntegrationGate("s", gate, (m) => warnings.push(m))).toBe(true);
    expect(warnings).toEqual([]);
  });

  /**
   * The whole point. A skip that prints nothing is indistinguishable from a
   * pass in the summary line a reviewer reads.
   */
  it("REPORTS the skip, naming the suite and the cause", () => {
    const warnings: string[] = [];
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: true },
      { ...FULL_ENV, SUPABASE_JWT_SECRET: undefined },
    );

    expect(announceIntegrationGate("mySuite", gate, (m) => warnings.push(m))).toBe(
      false,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("SKIPPED");
    expect(warnings[0]).toContain("mySuite");
    expect(warnings[0]).toContain("SUPABASE_JWT_SECRET");
    expect(warnings[0]).toBe(integrationSkipMessage("mySuite", gate));
  });

  /**
   * In an environment that declared a database present, a skip is a coverage
   * hole rather than a local convenience, and it fails the run.
   */
  it("THROWS when DB_INTEGRATION_REQUIRED=1 and the suite cannot run", () => {
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: true },
      {
        ...FULL_ENV,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
        DB_INTEGRATION_REQUIRED: "1",
      },
    );

    expect(() => announceIntegrationGate("mySuite", gate, () => {})).toThrow(
      /DB_INTEGRATION_REQUIRED=1/,
    );
  });

  it("does NOT throw when the required environment can actually run the suite", () => {
    const gate = resolveIntegrationGate(
      { label: "s", requiresOptIn: true },
      { ...FULL_ENV, DB_INTEGRATION_REQUIRED: "1" },
    );

    expect(() => announceIntegrationGate("mySuite", gate, () => {})).not.toThrow();
  });
});
