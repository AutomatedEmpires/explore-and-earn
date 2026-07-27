/**
 * RLS isolation — integration test through PostgREST.
 *
 * NOT the primary RLS coverage. This file self-skips whenever its Supabase
 * credentials are absent, which is every run of the credential-less unit-test
 * job, so it cannot be relied on as a gate. The suite that actually runs on
 * every pull request against a database rebuilt from migration 001 is
 * `tools/db-assert/sql/assert_authorization_matrix.sql`, driven by
 * `tools/db-assert/assert-authorization.mjs` from the Database Security
 * workflow. Add new refusals there; keep this file for what it uniquely
 * exercises — the anon key and the PostgREST layer above the policies.
 *
 * It runs ONLY when real Supabase credentials are present, and SKIPS
 * cleanly otherwise — so it never gives false-green in a credential-less CI, but
 * gives the founder / a secret-injected CI a real cross-tenant regression guard.
 *
 * Run it:
 *   NEXT_PUBLIC_SUPABASE_URL=… NEXT_PUBLIC_SUPABASE_ANON_KEY=… \
 *   SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_JWT_SECRET=… \
 *   pnpm --filter @explore-and-earn/db test rlsIsolation
 *
 * Point it at a STAGING / branch database, never production.
 *
 * What it proves on `saved_searches` (clean owner-scoped RLS via
 * current_seeker_profile_ids(), migration 041): an authenticated token whose
 * Clerk sub owns NO seeker profile (a) can read zero rows even though the
 * service-role client can see the table, and (b) is DENIED any insert. If RLS is
 * ever disabled or the owner policy regresses, the write would succeed and this
 * test fails loudly.
 *
 * Full two-tenant A-cannot-see-B isolation additionally requires creating
 * seeker_profiles, whose user_id is a NOT-NULL FK to auth.users — i.e. real
 * Supabase Auth users via the admin API. That heavier setup is intentionally
 * left as a follow-up; the scope-denial assertions below already fail on the
 * most likely regressions (RLS off / policy widened to USING (true)).
 */
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  announceIntegrationGate,
  resolveIntegrationGate,
} from "./support/integrationGate.js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

const GATE_LABEL = "rlsIsolation";
const gate = resolveIntegrationGate(
  { label: GATE_LABEL, requiresOptIn: false },
  process.env,
);
const enabled = gate.enabled;

// ALWAYS RUNS — see support/integrationGate.ts.
describe(`${GATE_LABEL} — coverage gate`, () => {
  it("either runs against a database or says out loud that it did not", () => {
    expect(announceIntegrationGate(GATE_LABEL, gate)).toBe(gate.enabled);
  });
});

/** Mint a Supabase-compatible HS256 JWT (role=authenticated, given sub). */
async function mintToken(sub: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return new SignJWT({ role: "authenticated", aud: "authenticated", sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

describe.skipIf(!enabled)("RLS isolation — saved_searches (integration)", () => {
  it("an unknown-sub token reads zero rows while service-role can read the table", async () => {
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const adminRead = await admin.from("saved_searches").select("id");
    // Service-role bypasses RLS — proves the table is reachable (count is context).
    expect(adminRead.error).toBeNull();

    const token = await mintToken(`rls-it-unknown-${Date.now()}`);
    const scoped = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const scopedRead = await scoped.from("saved_searches").select("id");

    expect(scopedRead.error).toBeNull();
    // The token's Clerk sub owns no profile, so its scope is empty — it must see
    // NONE of the table's rows regardless of how many exist.
    expect(scopedRead.data ?? []).toHaveLength(0);
  });

  it("an unknown-sub token is DENIED inserting into a scope it does not own", async () => {
    const token = await mintToken(`rls-it-unknown-${Date.now()}`);
    const scoped = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const insert = await scoped.from("saved_searches").insert({
      // A random profile id the token does not own — the WITH CHECK policy
      // (seeker_profile_id IN current_seeker_profile_ids()) must reject this.
      seeker_profile_id: "00000000-0000-0000-0000-000000000000",
      label: "rls-it-should-be-denied",
    });

    expect(insert.error).not.toBeNull();
  });
});
