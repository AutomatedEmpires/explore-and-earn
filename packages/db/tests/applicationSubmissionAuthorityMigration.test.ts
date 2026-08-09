import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "supabase",
    "migrations",
    "091_application_submission_authority.sql",
  ),
  "utf8",
);
const ASSERTION_SQL = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "tools",
    "db-assert",
    "sql",
    "assert_application_submission_authority.sql",
  ),
  "utf8",
);
const AUTHORIZATION_MATRIX = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "tools",
    "db-assert",
    "sql",
    "assert_authorization_matrix.sql",
  ),
  "utf8",
);
const PRODUCTION_ASSERTION = readFileSync(
  join(
    here,
    "..",
    "..",
    "..",
    "tools",
    "db-assert",
    "sql",
    "assert_production_launch.sql",
  ),
  "utf8",
);
const DB_MIGRATE_WORKFLOW = readFileSync(
  join(here, "..", "..", "..", ".github", "workflows", "db-migrate.yml"),
  "utf8",
);

function functionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end + 3);
}

describe("migration 091 application submission authority", () => {
  it("exposes public inventory and hosts only while a real future listing is live", () => {
    expect(MIGRATION).toMatch(
      /create policy listings_select_public[\s\S]*?status = 'live'[\s\S]*?expires_at is not null[\s\S]*?expires_at > now\(\)/i,
    );
    expect(MIGRATION).toMatch(
      /create policy host_profiles_select_public[\s\S]*?exists \([\s\S]*?l\.host_profile_id = host_profiles\.id[\s\S]*?l\.status = 'live'[\s\S]*?l\.expires_at is not null[\s\S]*?l\.expires_at > now\(\)/i,
    );
    expect(ASSERTION_SQL).toContain(
      "anon cannot see an expired live-status listing",
    );
    expect(ASSERTION_SQL).toContain(
      "anon cannot see a null-expiry live-status listing",
    );
    expect(ASSERTION_SQL).toContain("anon cannot see an expired-only host");
    expect(ASSERTION_SQL).toContain("anon cannot see a null-expiry-only host");
  });

  it("mirrors every field in the TypeScript resume-completeness contract", () => {
    const resume = functionBody(
      MIGRATION,
      "private.application_resume_is_complete",
    );
    expect(resume).toMatch(/nullif\(btrim\(sp\.display_name\), ''\) is not null/i);
    expect(resume).toMatch(/nullif\(btrim\(sp\.relative_location\), ''\) is not null/i);
    expect(resume).toMatch(/nullif\(btrim\(sp\.seeking_timeline\), ''\) is not null/i);
    expect(resume).toMatch(
      /cardinality\(coalesce\(sp\.general_skill_tags, '\{\}'::text\[\]\)\) > 0[\s\S]*?experience\.skill_tags/i,
    );
    expect(resume).toMatch(
      /nullif\(btrim\(sp\.short_bio\), ''\) is not null[\s\S]*?seeker_resume_experiences/i,
    );
    expect(resume).toMatch(/sp\.deleted_at is null/i);
  });

  it("stabilizes every mutable eligibility row before one database-clock decision", () => {
    const eligibility = functionBody(
      MIGRATION,
      "private.assert_application_submission_eligibility",
    );
    const profileLock = eligibility.indexOf("from public.seeker_profiles sp");
    const experienceLock = eligibility.indexOf(
      "from public.seeker_resume_experiences experience",
    );
    const listingLock = eligibility.indexOf("from public.listings l");
    const hostLock = eligibility.indexOf("from public.host_profiles h");
    const inviteLock = eligibility.indexOf("from public.invites i");
    const clockDecision = eligibility.indexOf("v_now := clock_timestamp()");
    const listingExpiry = eligibility.indexOf("v_listing_expires_at <= v_now");
    const inviteExpiry = eligibility.indexOf("v_invite_expires_at <= v_now");

    expect(profileLock).toBeGreaterThan(-1);
    expect(experienceLock).toBeGreaterThan(profileLock);
    expect(listingLock).toBeGreaterThan(experienceLock);
    expect(hostLock).toBeGreaterThan(listingLock);
    expect(inviteLock).toBeGreaterThan(hostLock);
    expect(clockDecision).toBeGreaterThan(inviteLock);
    expect(listingExpiry).toBeGreaterThan(clockDecision);
    expect(inviteExpiry).toBeGreaterThan(listingExpiry);
    expect(eligibility.match(/v_now := clock_timestamp\(\)/g)).toHaveLength(1);
    expect(eligibility).toMatch(
      /seeker_resume_experiences experience[\s\S]*?for share/i,
    );
    expect(eligibility).toMatch(/from public\.listings l[\s\S]*?for share/i);
    expect(eligibility).toMatch(/from public\.host_profiles h[\s\S]*?for share/i);
    expect(eligibility).toMatch(/from public\.invites i[\s\S]*?for update/i);
  });

  it("fails closed on listing host, provenance, state, and expiry truth", () => {
    const eligibility = functionBody(
      MIGRATION,
      "private.assert_application_submission_eligibility",
    );
    expect(eligibility).toMatch(/not v_listing_found/i);
    expect(eligibility).toMatch(/not v_host_found/i);
    expect(eligibility).toMatch(/v_listing_status is distinct from 'live'/i);
    expect(eligibility).toMatch(/v_listing_expires_at is null/i);
    expect(eligibility).toMatch(/v_listing_expires_at <= v_now/i);
    expect(eligibility).toMatch(
      /v_listing_provenance is distinct from 'verified'/i,
    );
    expect(eligibility).toMatch(/v_host_profile_id is null/i);
    expect(eligibility).toMatch(
      /nullif\(btrim\(v_host_clerk_user_id\), ''\) is null/i,
    );
    expect(eligibility).toMatch(/v_host_deleted_at is not null/i);
    expect(eligibility).toContain("listing_not_accepting_applications");
    expect(eligibility).toMatch(
      /btrim\(v_host_clerk_user_id\) = btrim\(v_seeker_clerk_user_id\)/i,
    );
    expect(eligibility).toContain("cannot_apply_to_own_listing");

    for (const proof of [
      "unknown listing is refused as unavailable",
      "expired listing is refused",
      "null-expiry listing is refused",
      "draft listing is refused",
      "listing without a usable host identity is refused",
      "sourced listing is refused",
      "whitespace-wrapped host identity cannot apply to own listing",
    ]) {
      expect(ASSERTION_SQL).toContain(proof);
    }
  });

  it("accepts only a same-seeker same-listing same-host active future invite", () => {
    const eligibility = functionBody(
      MIGRATION,
      "private.assert_application_submission_eligibility",
    );
    expect(eligibility).toMatch(
      /v_invite_seeker_profile_id is distinct from p_seeker_profile_id/i,
    );
    expect(eligibility).toMatch(
      /v_invite_listing_id is distinct from p_listing_id/i,
    );
    expect(eligibility).toMatch(
      /v_invite_host_profile_id is distinct from v_host_profile_id/i,
    );
    expect(eligibility).toMatch(
      /v_invite_status not in \('created', 'delivered', 'viewed'\)/i,
    );
    expect(eligibility).toMatch(/v_invite_expires_at is null/i);
    expect(eligibility).toMatch(/v_invite_expires_at <= v_now/i);

    for (const proof of [
      "null-expiry invite is not actionable",
      "expired invite is not actionable",
      "actionable invite owned by another seeker is not actionable for caller",
      "same-seeker invite for another listing is not actionable",
      "invite whose host does not own the listing is not actionable",
      "inactive invite is not actionable",
    ]) {
      expect(ASSERTION_SQL).toContain(proof);
    }
  });

  it("derives identity and returns one stable four-column RPC row", () => {
    const rpc = functionBody(MIGRATION, "public.submit_my_application");
    expect(rpc).toMatch(
      /p_listing_id uuid,\s*p_cover_message text default null,\s*p_origin_invite_id uuid default null/i,
    );
    expect(rpc).toMatch(
      /returns table \(\s*application_id uuid,\s*seeker_profile_id uuid,\s*listing_id uuid,\s*disposition text\s*\)/i,
    );
    expect(rpc).toMatch(/v_clerk_user_id := nullif\(btrim\(public\.get_clerk_user_id\(\)\), ''\)/i);
    expect(rpc).not.toMatch(/p_clerk_user_id|p_seeker_profile_id|p_source/i);
    expect(rpc).toMatch(/security definer[\s\S]*?set search_path = ''/i);
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.submit_my_application\(uuid, text, uuid\)[\s\S]*?from public, anon, authenticated, service_role[\s\S]*?grant execute[\s\S]*?to authenticated/i,
    );
  });

  it("locks an existing application before listing/invite eligibility and serializes first insert", () => {
    const rpc = functionBody(MIGRATION, "public.submit_my_application");
    const advisory = rpc.indexOf("pg_advisory_xact_lock");
    const applicationLock = rpc.indexOf("from public.applications a");
    const eligibility = rpc.indexOf(
      "private.assert_application_submission_eligibility",
    );
    const insert = rpc.indexOf("insert into public.applications");

    expect(advisory).toBeGreaterThan(-1);
    expect(applicationLock).toBeGreaterThan(advisory);
    expect(rpc.slice(applicationLock, eligibility)).toMatch(/for update/i);
    expect(eligibility).toBeGreaterThan(applicationLock);
    expect(insert).toBeGreaterThan(eligibility);
  });

  it("owns create, direct duplicate, reactivation, and invite adoption semantics", () => {
    const rpc = functionBody(MIGRATION, "public.submit_my_application");
    expect(rpc).toMatch(/char_length\(p_cover_message\) > 2000/i);
    expect(rpc).toContain("cover_message_too_long");
    expect(rpc).toMatch(/v_application_status = 'withdrawn'[\s\S]*?status = 'applied'/i);
    expect(rpc).toMatch(
      /when p_cover_message is null then a\.cover_message[\s\S]*?else p_cover_message/i,
    );
    expect(rpc).toMatch(
      /when p_origin_invite_id is null then a\.source[\s\S]*?when p_origin_invite_id is null then a\.origin_invite_id/i,
    );
    expect(rpc).toContain("v_disposition := 'reactivated'");
    expect(rpc).toContain("v_disposition := 'created'");
    expect(rpc).toContain("v_disposition := 'existing'");
    expect(rpc).toMatch(
      /elsif p_origin_invite_id is null then[\s\S]*?message = 'already_applied'/i,
    );
    expect(ASSERTION_SQL).toContain(
      "active direct duplicate is stable already_applied",
    );
    expect(ASSERTION_SQL).toContain(
      "seeker cannot reactivate withdrawn row with direct UPDATE",
    );
    expect(ASSERTION_SQL).toContain(
      "invite adoption attribution/linkage is wrong",
    );
    expect(ASSERTION_SQL).toContain(
      "direct reactivation lost historical attribution/cover",
    );
  });

  it("moves invite acceptance and linkage inside the application transaction", () => {
    const rpc = functionBody(MIGRATION, "public.submit_my_application");
    expect(rpc).toMatch(
      /if v_invite_status = 'created'[\s\S]*?set status = 'delivered'[\s\S]*?delivered_at = coalesce/i,
    );
    expect(rpc).toMatch(
      /set status = 'applied',[\s\S]*?application_id = v_application_id,[\s\S]*?responded_at = v_now/i,
    );
    expect(rpc).toMatch(/where id = p_origin_invite_id[\s\S]*?status in \('delivered', 'viewed'\)/i);
    expect(rpc).toMatch(/get diagnostics v_rows = row_count[\s\S]*?v_rows <> 1[\s\S]*?application_conflict/i);
    expect(ASSERTION_SQL).toContain(
      "invite conversion facts are not atomic/canonical",
    );
    expect(ASSERTION_SQL).toContain(
      "invite retry did not return durable application",
    );
  });

  it("closes direct insert and sensitive update privileges while preserving real lifecycle actions", () => {
    expect(MIGRATION).toMatch(
      /drop policy if exists applications_insert_seeker[\s\S]*?revoke insert on public\.applications from public, anon, authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /revoke update on public\.applications from public, anon, authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /revoke update \(status, withdrawn_reason, reactivated_at, cover_message\)[\s\S]*?from public, anon, authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /grant update \(status, withdrawn_reason\)[\s\S]*?to authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /create policy applications_update_seeker[\s\S]*?status in \('applied', 'reviewing', 'saved_by_host', 'offered'\)[\s\S]*?status in \('withdrawn', 'accepted'\)/i,
    );
    expect(MIGRATION).toMatch(
      /create policy invites_update_seeker[\s\S]*?status in \('created', 'delivered', 'viewed'\)[\s\S]*?status = 'ignored'/i,
    );
    expect(ASSERTION_SQL).toContain(
      "authenticated cannot re-author cover message directly",
    );
    expect(ASSERTION_SQL).toContain(
      "authenticated cannot forge reactivated_at directly",
    );
  });

  it("keeps the defense trigger scoped to submission/reactivation and JWT ownership", () => {
    const trigger = functionBody(
      MIGRATION,
      "private.enforce_application_submission_row",
    );
    const updateReturn = trigger.indexOf(
      "elsif not (old.status = 'withdrawn' and new.status = 'applied') then",
    );
    const identityCheck = trigger.indexOf(
      "sp.clerk_user_id = public.get_clerk_user_id()",
    );
    expect(updateReturn).toBeGreaterThan(-1);
    expect(identityCheck).toBeGreaterThan(updateReturn);
    expect(trigger).toContain("application_identity_mismatch");
    expect(trigger).toContain("application_initial_status_invalid");
    expect(trigger).toContain("application_attribution_invalid");
    expect(ASSERTION_SQL).toContain(
      "future grant cannot submit as another seeker",
    );
  });

  it("updates the legacy authorization matrix to use RPC positive control", () => {
    expect(AUTHORIZATION_MATRIX).toContain(
      "seeker B cannot bypass the submission RPC with a direct insert",
    );
    expect(AUTHORIZATION_MATRIX).toContain(
      "seeker B files through the JWT-derived submission RPC",
    );
    expect(AUTHORIZATION_MATRIX).toMatch(
      /submit_my_application\('111a1000-0000-4000-8000-00000000000a', null, null\)/i,
    );
  });

  it("makes production migration verification gate on the 091 authority", () => {
    for (const field of [
      "migration_091_applied",
      "application_submission_rpc_safe",
      "application_submission_writes_closed",
      "application_submission_guards_present",
    ]) {
      expect(PRODUCTION_ASSERTION).toContain(`as ${field}`);
      expect(DB_MIGRATE_WORKFLOW).toContain(`.[0].${field} == true`);
    }
    expect(PRODUCTION_ASSERTION).toContain(
      "public.submit_my_application(uuid,text,uuid)",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "trg_applications_submission_authority",
    );
    expect(PRODUCTION_ASSERTION).toContain("applications_update_seeker");
    expect(PRODUCTION_ASSERTION).toContain("invites_update_seeker");
  });
});
