import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  new URL(
    "../../../supabase/migrations/094_host_seeker_discovery_bridge.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const APPLICATION_MIGRATION = readFileSync(
  new URL(
    "../../../supabase/migrations/091_application_submission_authority.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const CONNECTED_ASSERTION = readFileSync(
  new URL(
    "../../../tools/db-assert/sql/assert_host_seeker_discovery.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const ASSERTION_DRIVER = readFileSync(
  new URL("../../../tools/db-assert/assert-authorization.mjs", import.meta.url),
  "utf8",
);
const RPC_ASSERTION = readFileSync(
  new URL("../../../tools/db-assert/sql/assert_rpc_grants.sql", import.meta.url),
  "utf8",
).toLowerCase();
const PRODUCTION_ASSERTION = readFileSync(
  new URL(
    "../../../tools/db-assert/sql/assert_production_launch.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const DB_MIGRATE_WORKFLOW = readFileSync(
  new URL("../../../.github/workflows/db-migrate.yml", import.meta.url),
  "utf8",
).toLowerCase();
const DB_SECURITY_WORKFLOW = readFileSync(
  new URL("../../../.github/workflows/db-security.yml", import.meta.url),
  "utf8",
).toLowerCase();
const DB_ASSERT_PACKAGE = readFileSync(
  new URL("../../../tools/db-assert/package.json", import.meta.url),
  "utf8",
).toLowerCase();
const INVITE_CONCURRENCY_ASSERTION = readFileSync(
  new URL(
    "../../../tools/db-assert/assert-invite-delivery-concurrency.mjs",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const MIGRATION_ALLOCATIONS = readFileSync(
  new URL("../../../tools/scripts/migration-allocations.json", import.meta.url),
  "utf8",
);

function functionDefinition(source: string, functionName: string): string {
  const start = source.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

function functionSource(source: string, functionName: string): string {
  const definition = functionDefinition(source, functionName);
  const marker = definition.indexOf("as $$");
  expect(marker).toBeGreaterThan(-1);
  const contentStart = definition.indexOf("\n", marker) + 1;
  const end = definition.lastIndexOf("\n$$;");
  expect(end).toBeGreaterThan(contentStart);
  return definition.slice(contentStart, end);
}

function bodyFingerprint(source: string, functionName: string): string {
  const normalized = functionSource(source, functionName).replace(
    /[ \t\n\r]/g,
    "",
  );
  return createHash("md5").update(normalized).digest("hex");
}

describe("migration 094 host seeker discovery bridge", () => {
  const search = functionDefinition(
    MIGRATION,
    "public.search_host_sourceable_seekers",
  );
  const matches = functionDefinition(
    MIGRATION,
    "public.get_host_sourceable_matches",
  );
  const writer = functionDefinition(
    MIGRATION,
    "public.create_host_source_invite_with_credit",
  );
  const delivery = functionDefinition(
    MIGRATION,
    "public.deliver_seeker_invites",
  );
  const settle = functionDefinition(
    MIGRATION,
    "public.settle_invite_notification_delivery",
  );
  const recheck = functionDefinition(
    MIGRATION,
    "public.get_invite_notification_state",
  );
  const beginDelivery = functionDefinition(
    MIGRATION,
    "public.begin_invite_notification_delivery",
  );
  const claim = functionDefinition(
    MIGRATION,
    "public.claim_notification_deliveries",
  );
  const claimV2 = functionDefinition(
    MIGRATION,
    "public.claim_notification_deliveries_v2",
  );
  const digestGuard = functionDefinition(
    MIGRATION,
    "public.prevent_queued_invite_digest_membership_094",
  );
  const deadLetterGuard = functionDefinition(
    MIGRATION,
    "public.prevent_invite_dead_letter_requeue_094",
  );
  const withdraw = functionDefinition(
    MIGRATION,
    "public.withdraw_host_invite",
  );
  const hostView = functionDefinition(
    MIGRATION,
    "public.host_can_view_seeker",
  );
  const displayNames = functionDefinition(
    MIGRATION,
    "public.get_host_applicant_display_names",
  );
  const applicationWriter = functionDefinition(
    APPLICATION_MIGRATION,
    "public.submit_my_application",
  );
  const searchFingerprint = bodyFingerprint(
    MIGRATION,
    "public.search_host_sourceable_seekers",
  );
  const matchesFingerprint = bodyFingerprint(
    MIGRATION,
    "public.get_host_sourceable_matches",
  );
  const writerFingerprint = bodyFingerprint(
    MIGRATION,
    "public.create_host_source_invite_with_credit",
  );
  const deliveryFingerprint = bodyFingerprint(
    MIGRATION,
    "public.deliver_seeker_invites",
  );
  const settleFingerprint = bodyFingerprint(
    MIGRATION,
    "public.settle_invite_notification_delivery",
  );
  const recheckFingerprint = bodyFingerprint(
    MIGRATION,
    "public.get_invite_notification_state",
  );
  const beginDeliveryFingerprint = bodyFingerprint(
    MIGRATION,
    "public.begin_invite_notification_delivery",
  );
  const claimFingerprint = bodyFingerprint(
    MIGRATION,
    "public.claim_notification_deliveries",
  );
  const claimV2Fingerprint = bodyFingerprint(
    MIGRATION,
    "public.claim_notification_deliveries_v2",
  );
  const digestGuardFingerprint = bodyFingerprint(
    MIGRATION,
    "public.prevent_queued_invite_digest_membership_094",
  );
  const deadLetterGuardFingerprint = bodyFingerprint(
    MIGRATION,
    "public.prevent_invite_dead_letter_requeue_094",
  );
  const withdrawFingerprint = bodyFingerprint(
    MIGRATION,
    "public.withdraw_host_invite",
  );
  const hostViewFingerprint = bodyFingerprint(
    MIGRATION,
    "public.host_can_view_seeker",
  );
  const displayNamesFingerprint = bodyFingerprint(
    MIGRATION,
    "public.get_host_applicant_display_names",
  );

  it("adds fail-closed consent and replaces only the dead partial index", () => {
    const allocations = JSON.parse(MIGRATION_ALLOCATIONS) as {
      allocations: Record<string, { slug: string; status: string }>;
    };
    expect(allocations.allocations["094"]).toMatchObject({
      slug: "host_seeker_discovery_bridge",
      status: "reserved",
    });
    expect(MIGRATION).toContain(
      "drop index if exists public.idx_seeker_profiles_visible_onboarded",
    );
    expect(MIGRATION).toMatch(
      /alter table public\.seeker_profiles\s+add column if not exists host_discovery_enabled boolean not null default false/i,
    );
    expect(MIGRATION).toMatch(
      /grant update \(host_discovery_enabled\)\s+on public\.seeker_profiles\s+to authenticated/i,
    );
    expect(MIGRATION).toMatch(
      /create index if not exists idx_seeker_profiles_platform_onboarded\s+on public\.seeker_profiles \(id\)\s+where host_discovery_enabled is true\s+and visibility_status = 'platform'\s+and onboarding_complete is true\s+and deleted_at is null/i,
    );
    expect(MIGRATION.match(/create (?:unique )?index if not exists/g)).toHaveLength(2);
    expect(MIGRATION).toMatch(
      /create unique index if not exists idx_events_invite_created_authority_094\s+on public\.events \(subject_id\)\s+where event_type = 'invite_created'\s+and subject_type = 'invite'\s+and source_surface = 'invite_authority'\s+and properties ->> 'authority_version' = '094'/i,
    );
    expect(MIGRATION).not.toMatch(/using\s+(?:gin|gist)|pg_trgm|gin_trgm/i);
    expect(MIGRATION.match(/create policy/g)).toHaveLength(2);
    expect(MIGRATION).toMatch(
      /drop policy if exists match_scores_select_host on public\.match_scores;\s*create policy match_scores_select_host on public\.match_scores\s+for select to authenticated\s+using \(\s*exists \(\s*select 1\s+from public\.applications a\s+join public\.listings l on l\.id = a\.listing_id[\s\S]*?a\.listing_id = match_scores\.listing_id[\s\S]*?a\.seeker_profile_id = match_scores\.seeker_profile_id[\s\S]*?current_host_profile_ids\(\)/i,
    );
    expect(MIGRATION).not.toMatch(/alter\s+policy/i);
    expect(MIGRATION).not.toMatch(
      /create\s+policy[\s\S]{0,100}public\.seeker_profiles/i,
    );
    expect(MIGRATION).toContain(
      "drop policy if exists invites_update_host on public.invites",
    );
    expect(MIGRATION).toMatch(
      /create policy invites_select_party on public\.invites\s+for select to authenticated\s+using \(\s*host_profile_id in \(select public\.current_host_profile_ids\(\)\)\s+or \(\s*seeker_profile_id in \(select public\.current_seeker_profile_ids\(\)\)\s+and \(\s*status in \('delivered', 'viewed', 'applied', 'ignored'\)\s+or \(\s*status in \('expired', 'withdrawn'\)\s+and delivered_at is not null\s*\)\s*\)\s*\)\s*\)/i,
    );
    expect(MIGRATION).not.toMatch(
      /seeker_profile_id in \(select public\.current_seeker_profile_ids\(\)\)[\s\S]{0,250}?'created'/i,
    );
    expect(MIGRATION).not.toMatch(/create\s+policy\s+invites_update_host/i);
    expect(MIGRATION).toContain("invite_policy_inventory_drift");
    expect(MIGRATION).toContain("match_score_policy_inventory_drift");
    expect(MIGRATION).toContain("host_discovery_policy_rls_disabled");
    expect(CONNECTED_ASSERTION).toContain(
      "host discovery: invite/match-score rls is disabled",
    );
    expect(PRODUCTION_ASSERTION).toMatch(
      /select count\(\*\) = 2 and bool_and\(c\.relrowsecurity\)[\s\S]{0,180}'public\.invites'::regclass,[\s\S]{0,100}'public\.match_scores'::regclass/i,
    );
    for (const source of [MIGRATION, CONNECTED_ASSERTION, PRODUCTION_ASSERTION]) {
      for (const policyHash of [
        "d67462759e3b4fd145fb71131c41e42e",
        "d8237c2cc19af204163ad38685840885",
        "1922082763d7c9a267806360a3e0ee7e",
        "19f529e501c5b60cbef691bb5793e204",
        "efea6a7c51d72911569def4741592a97",
      ]) {
        expect(source).toContain(policyHash);
      }
    }
    expect(MIGRATION).toContain("array[v_authenticated]::oid[]");
    expect(CONNECTED_ASSERTION).toContain(
      "array['authenticated'::regrole::oid]::oid[]",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "array['authenticated'::regrole::oid]::oid[]",
    );
    expect(MIGRATION).not.toMatch(
      /alter\s+table\s+public\.seeker_profiles\s+disable\s+row\s+level\s+security/i,
    );
    const withoutConsentGrant = MIGRATION
      .replace(
        /grant update \(host_discovery_enabled\)\s+on public\.seeker_profiles\s+to authenticated;/i,
        "",
      )
      .replace(
        /revoke all on table public\.invite_authority_rollout_094[\s\S]*?grant select on table public\.invite_authority_rollout_094 to service_role;/i,
        "",
      );
    expect(withoutConsentGrant).not.toMatch(
      /grant\s+(?:select|insert|update|delete|all)\b[\s\S]*?\bon\s+(?:table\s+)?public\./i,
    );
  });

  it("publishes the exact service-only invoker read signatures and projections", () => {
    expect(search).toMatch(
      /p_host_profile_id uuid,\s*p_listing_id uuid,\s*p_query text,\s*p_limit integer default 20/i,
    );
    expect(search).toMatch(
      /returns table \(\s*seeker_profile_id uuid,\s*display_name text,\s*short_bio text,\s*already_invited boolean\s*\)/i,
    );
    expect(matches).toMatch(
      /p_host_profile_id uuid,\s*p_listing_id uuid,\s*p_limit integer default 20/i,
    );
    expect(matches).toMatch(
      /returns table \(\s*seeker_profile_id uuid,\s*display_name text,\s*short_bio text,\s*general_skill_tags text\[\],\s*desired_categories text\[\],\s*score smallint,\s*band text,\s*already_invited boolean\s*\)/i,
    );
    expect(matches).not.toContain("profile_photo_url");
    expect(matches).not.toMatch(/\bconfidence\b|\bcomponents\b/i);

    for (const rpc of [search, matches]) {
      expect(rpc).toMatch(/stable\s+security invoker\s+set search_path = ''/i);
      expect(rpc).toContain("message = 'invalid_request'");
      expect(rpc).toContain("message = 'listing_unavailable'");
      expect(rpc).toContain("l.status = 'live'");
      expect(rpc).toContain("l.provenance = 'verified'");
      expect(rpc).toContain("l.expires_at is not null");
      expect(rpc).toContain("l.expires_at > statement_timestamp()");
      expect(rpc).toContain("h.account_status = 'active'");
      expect(rpc).toContain("h.deleted_at is null");
      expect(rpc).toContain("s.host_discovery_enabled is true");
    }

    for (const signature of [
      "public.search_host_sourceable_seekers(uuid, uuid, text, integer)",
      "public.get_host_sourceable_matches(uuid, uuid, integer)",
    ]) {
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke execute on function ${signature.replace(/[()]/g, "\\$&")}\\s+from public, anon, authenticated;[\\s\\S]*?grant execute on function ${signature.replace(/[()]/g, "\\$&")}\\s+to service_role`,
          "i",
        ),
      );
    }
  });

  it("uses normalized literal search with exact, prefix, name, then bio ranking", () => {
    expect(search).toMatch(
      /v_query := btrim\(\s*regexp_replace\(\s*coalesce\(p_query, ''\),\s*'\[\[:space:\]\]\+',\s*' ',\s*'g'\s*\)\s*\)/i,
    );
    expect(search.match(/btrim\(\s*regexp_replace\(/g)).toHaveLength(3);
    expect(search).toContain(
      "strpos(normalized.normalized_name, lower(v_query)) > 0",
    );
    expect(search).toContain(
      "strpos(normalized.normalized_bio, lower(v_query)) > 0",
    );
    expect(search).not.toMatch(/\bilike\b|similar to/);

    const exact = search.indexOf("normalized.normalized_name = lower(v_query)");
    const prefix = search.indexOf(
      "strpos(normalized.normalized_name, lower(v_query)) = 1",
    );
    const substring = search.indexOf(
      "strpos(normalized.normalized_name, lower(v_query)) > 1",
    );
    const normalizedName = search.lastIndexOf("normalized.normalized_name");
    expect(exact).toBeGreaterThan(-1);
    expect(prefix).toBeGreaterThan(exact);
    expect(substring).toBeGreaterThan(prefix);
    expect(normalizedName).toBeGreaterThan(substring);

    expect(search).toContain("p_limit > 20");
    expect(search).toContain("char_length(v_query) < 2");
    expect(search).toContain("char_length(v_query) > 100");
    expect(CONNECTED_ASSERTION).toContain(
      "normalized exact/prefix/name/bio search order or invite annotation drifted",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "percent/underscore search is not an exact literal result set",
    );
    for (const proof of [
      "draft listing error drifted",
      "expired listing error drifted",
      "sourced listing error drifted",
      "hidden seeker error drifted",
      "incomplete seeker error drifted",
      "deleted seeker error drifted",
      "self seeker error drifted",
      "purchased credit success/consume drifted",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
  });

  it("keeps both read paths inside the sourceable candidate boundary", () => {
    for (const rpc of [search, matches]) {
      expect(rpc).toContain("s.visibility_status = 'platform'");
      expect(rpc).toContain("s.onboarding_complete is true");
      expect(rpc).toContain("s.deleted_at is null");
      expect(rpc).toMatch(
        /btrim\(s\.clerk_user_id\) <> btrim\(v_host_clerk_user_id\)/i,
      );
      expect(rpc).toMatch(
        /not exists \(\s*select 1\s*from public\.applications a\s*where a\.listing_id = p_listing_id\s*and a\.seeker_profile_id = s\.id\s*\)/i,
      );
      expect(rpc).toMatch(
        /exists \(\s*select 1\s*from public\.invites i\s*where i\.listing_id = p_listing_id\s*and i\.host_profile_id = p_host_profile_id\s*and i\.seeker_profile_id = s\.id\s*\) as already_invited/i,
      );
    }
    expect(matches).toContain("ms.score >= 50");
    expect(matches).toMatch(
      /order by\s*ms\.score desc,\s*ms\.computed_at desc,\s*s\.id\s*limit p_limit/i,
    );
    expect(matches).toContain("p_limit > 50");
    expect(matches).toContain(
      "coalesce(s.general_skill_tags, '{}'::text[])",
    );
    expect(matches).toContain("coalesce(s.desired_categories, '{}'::text[])");
    expect(CONNECTED_ASSERTION).toContain(
      "platform-visible but not discoverable",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "opted-out seeker error drifted",
    );
  });

  it("validates writer inputs before locks and returns only the seven domain errors", () => {
    expect(writer).toMatch(
      /p_host_profile_id uuid,\s*p_seeker_profile_id uuid,\s*p_listing_id uuid,\s*p_message text\s*\)\s*returns jsonb/i,
    );
    expect(writer).not.toMatch(/p_monthly_allowance|p_invited_by_user_id/i);
    expect(writer).toContain("char_length(p_message) > 500");
    const invalid = writer.indexOf("'error', 'invalid_request'");
    const pairLock = writer.indexOf("pg_advisory_xact_lock");
    expect(invalid).toBeGreaterThan(-1);
    expect(pairLock).toBeGreaterThan(invalid);

    const errors = [
      ...writer.matchAll(/'error', '([^']+)'/g),
    ].map((match) => match[1]);
    expect([...new Set(errors)].sort()).toEqual(
      [
        "already_applied",
        "already_invited",
        "host_not_eligible",
        "invalid_request",
        "invite_credits_required",
        "listing_not_actionable",
        "seeker_not_sourceable",
      ].sort(),
    );
    expect(CONNECTED_ASSERTION).toContain(
      "over-500-code-point message error drifted",
    );
    expect(CONNECTED_ASSERTION).toContain("null identifier error drifted");
    expect(writer).toContain(
      "v_seeker_host_discovery_enabled is not true",
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.create_invite_with_credit\(uuid, uuid, uuid, text, uuid, integer\)\s+from service_role/i,
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.restore_invite_credit\(uuid\)\s+from service_role/i,
    );
    expect(CONNECTED_ASSERTION).toContain(
      "standalone legacy credit restore remains executable",
    );
    expect(RPC_ASSERTION).toContain(
      "standalone restore_invite_credit authority remains open",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "'public.restore_invite_credit(uuid)'",
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.create_host_source_invite_with_credit\(uuid, uuid, uuid, text\)\s+from public, anon, authenticated;[\s\S]*?grant execute on function public\.create_host_source_invite_with_credit\(uuid, uuid, uuid, text\)\s+to service_role/i,
    );
    expect(CONNECTED_ASSERTION).toContain(
      "stale high caller allowance authorized spend after downgrade",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "refusal inserted an invite or spent credit",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "exact application/seeker/listing/host/invite row locks drifted",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "post-credit-lock clock/expiry recheck drifted",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "invite listing/seeker uniqueness drifted",
    );
  });

  it("shares the application pair lock and stabilizes every row before credit work", () => {
    const sharedKey =
      "'application_submission:' || p_listing_id::text || ':' || p_seeker_profile_id::text";
    expect(writer).toContain(sharedKey);
    expect(applicationWriter).toContain(
      "'application_submission:' || p_listing_id::text || ':' || v_seeker_profile_id::text",
    );
    expect(MIGRATION).toMatch(
      /with delivered_invites as \([\s\S]*?d\.notification_type = 'invite_received'[\s\S]*?d\.status = 'delivered'[\s\S]*?e\.listing_id = i\.listing_id[\s\S]*?e\.host_profile_id = i\.host_profile_id[\s\S]*?e\.seeker_profile_id = i\.seeker_profile_id[\s\S]*?d\.recipient_clerk_user_id = s\.clerk_user_id[\s\S]*?update public\.invites i[\s\S]*?i\.status = 'created'[\s\S]*?i\.delivered_at is null/i,
    );
    expect(MIGRATION).toMatch(
      /update public\.digest_memberships dm\s+set status = 'cancelled'[\s\S]*?dm\.cadence in \('daily', 'weekly'\)[\s\S]*?d\.notification_type = 'invite_received'[\s\S]*?e\.id = dm\.event_id[\s\S]*?e\.event_type in \('invite_created', 'invite_sent'\)[\s\S]*?e\.subject_type = 'invite'/i,
    );
    expect(MIGRATION).toMatch(
      /update public\.notification_deliveries d\s+set status = 'dead_letter'[\s\S]*?pre-094 invite digest member; provider outcome unknown[\s\S]*?exists \([\s\S]*?from public\.digest_memberships dm[\s\S]*?dm\.delivery_id = d\.id/i,
    );
    expect(MIGRATION).toMatch(
      /dm\.event_id = d\.event_id[\s\S]*?e\.event_type in \('invite_created', 'invite_sent'\)[\s\S]*?e\.subject_type = 'invite'/i,
    );
    expect(MIGRATION).toMatch(
      /update public\.notification_deliveries d\s+set failure_class = 'outcome_unknown'[\s\S]*?d\.status = 'dead_letter'[\s\S]*?d\.failure_class is distinct from 'outcome_unknown'[\s\S]*?d\.failure_class is distinct from 'known_unsent'/i,
    );
    expect(MIGRATION).toContain(
      "historical_invite_delivery_restore_conflict",
    );
    expect(MIGRATION).toMatch(
      /validate constraint notification_deliveries_invite_open_cadence_chk;[\s\S]*?historical_invite_delivery_restore_conflict[\s\S]*?reconcile the split pre-094 withdrawal\/restore path/i,
    );
    expect(MIGRATION).toMatch(
      /insert into public\.notification_deliveries \([\s\S]*?legacy_digest_outcome_unknown_094[\s\S]*?dm\.delivery_id[\s\S]*?is null|insert into public\.notification_deliveries \([\s\S]*?legacy_digest_outcome_unknown_094[\s\S]*?not exists/i,
    );
    expect(MIGRATION).toMatch(
      /add constraint notification_deliveries_invite_open_cadence_chk\s+check \([\s\S]*?notification_type <> 'invite_received'[\s\S]*?cadence = 'immediate'[\s\S]*?status in \([\s\S]*?'dead_letter'[\s\S]*?'cancelled'[\s\S]*?\) not valid/i,
    );
    expect(MIGRATION).toMatch(
      /validate constraint notification_deliveries_invite_open_cadence_chk/i,
    );
    expect(digestGuard).toMatch(/security invoker\s+set search_path = ''/i);
    expect(digestGuard).toContain("new.status = 'queued'");
    expect(digestGuard).toContain(
      "d.notification_type = 'invite_received'",
    );
    expect(digestGuard).toContain(
      "e.event_type in ('invite_created', 'invite_sent')",
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.prevent_queued_invite_digest_membership_094\(\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(MIGRATION).toMatch(
      /create trigger trg_digest_memberships_no_invite_queue_094\s+before insert or update of status, delivery_id, event_id\s+on public\.digest_memberships/i,
    );
    expect(deadLetterGuard).toMatch(/security invoker\s+set search_path = ''/i);
    expect(deadLetterGuard).toContain(
      "old.failure_class = 'outcome_unknown'",
    );
    expect(deadLetterGuard).toContain("old.status = 'processing'");
    expect(deadLetterGuard).toContain("new.claim_authority_version := null");
    expect(deadLetterGuard).toContain(
      "new.status is distinct from old.status",
    );
    expect(deadLetterGuard).toContain("'invite_dead_letter_immutable'");
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.prevent_invite_dead_letter_requeue_094\(\)\s+from public, anon, authenticated, service_role/i,
    );
    expect(MIGRATION).toMatch(
      /create trigger trg_notification_deliveries_invite_dead_letter_094\s+before update of status, failure_class, notification_type\s+on public\.notification_deliveries/i,
    );

    const pairLock = writer.indexOf("pg_advisory_xact_lock");
    const applicationLock = writer.indexOf("from public.applications a");
    const seekerLock = writer.indexOf("from public.seeker_profiles s");
    const listingLock = writer.indexOf("from public.listings l");
    const hostLock = writer.indexOf("from public.host_profiles h");
    const inviteLock = writer.indexOf("from public.invites i");
    const hostCheck = writer.indexOf("'error', 'host_not_eligible'");
    const listingCheck = writer.indexOf("'error', 'listing_not_actionable'");
    const applicationCheck = writer.indexOf("'error', 'already_applied'");
    const seekerCheck = writer.indexOf("'error', 'seeker_not_sourceable'");
    const inviteCheck = writer.indexOf("'error', 'already_invited'");
    const subscriptionLock = writer.indexOf(
      "from public.host_subscriptions hs",
    );
    const creditLock = writer.indexOf("'invite_credit:'");
    const creditRead = writer.indexOf("from public.invite_credit_events e");
    const inviteInsert = writer.indexOf("insert into public.invites");
    const creditInsert = writer.indexOf("insert into public.invite_credit_events");
    const eventInsert = writer.indexOf("insert into public.events");
    const clockCaptures = [
      ...writer.matchAll(/v_now := clock_timestamp\(\)/g),
    ].map((match) => match.index!);
    const expiryChecks = [
      ...writer.matchAll(/v_listing_expires_at <= v_now/g),
    ].map((match) => match.index!);

    expect(applicationLock).toBeGreaterThan(pairLock);
    expect(writer.slice(applicationLock, seekerLock)).toMatch(/for update/i);
    expect(seekerLock).toBeGreaterThan(applicationLock);
    expect(writer.slice(seekerLock, listingLock)).toMatch(/for share/i);
    expect(listingLock).toBeGreaterThan(seekerLock);
    expect(writer.slice(listingLock, hostLock)).toMatch(/for share/i);
    expect(hostLock).toBeGreaterThan(listingLock);
    expect(writer.slice(hostLock, inviteLock)).toMatch(/for share/i);
    expect(inviteLock).toBeGreaterThan(hostLock);
    expect(writer.slice(inviteLock, hostCheck)).toMatch(/for update/i);
    expect(clockCaptures).toHaveLength(2);
    expect(expiryChecks).toHaveLength(2);
    expect(clockCaptures[0]).toBeGreaterThan(inviteLock);
    expect(expiryChecks[0]).toBeGreaterThan(clockCaptures[0]);
    expect(hostCheck).toBeGreaterThan(inviteLock);
    expect(listingCheck).toBeGreaterThan(hostCheck);
    expect(applicationCheck).toBeGreaterThan(listingCheck);
    expect(seekerCheck).toBeGreaterThan(applicationCheck);
    expect(inviteCheck).toBeGreaterThan(seekerCheck);
    expect(subscriptionLock).toBeGreaterThan(inviteCheck);
    expect(writer.slice(subscriptionLock, creditLock)).toMatch(/for share/i);
    expect(creditLock).toBeGreaterThan(subscriptionLock);
    expect(clockCaptures[1]).toBeGreaterThan(creditLock);
    expect(expiryChecks[1]).toBeGreaterThan(clockCaptures[1]);
    expect(creditRead).toBeGreaterThan(expiryChecks[1]);
    expect(inviteInsert).toBeGreaterThan(creditRead);
    expect(creditInsert).toBeGreaterThan(inviteInsert);
    expect(eventInsert).toBeGreaterThan(creditInsert);
    expect(writer).toContain("'invite_created'");
    expect(writer).toContain("'invite_authority'");
    expect(writer).toContain("jsonb_build_object('authority_version', '094')");
    expect(writer).toMatch(
      /exception\s+when unique_violation then\s+return jsonb_build_object\('ok', false, 'error', 'already_invited'\)/i,
    );
    expect(writer).toMatch(
      /v_authoritative_monthly_allowance := case v_subscription_tier\s+when 'starter' then 3\s+when 'professional' then 10\s+when 'enterprise' then 20\s+else 0\s+end/i,
    );
    expect(writer).toContain(
      "public.host_subscription_tier_for_clerk_user(",
    );
    expect(writer).toContain(
      "v_monthly_used < v_authoritative_monthly_allowance",
    );
    expect(writer).not.toContain("v_monthly_used < p_monthly_allowance");
    expect(CONNECTED_ASSERTION).toContain(
      "authoritative subscription lock/allowance drifted",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "single-session, so it pins the shared application/invite advisory key",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "existing application must precede hidden seeker sourceability",
    );
  });

  it("delivers only locked, owned, unexpired invites and returns authoritative rows", () => {
    expect(delivery).toMatch(
      /p_seeker_profile_id uuid,\s*p_invite_ids uuid\[\]\s*\)\s*returns table \(\s*invite_id uuid,\s*status text\s*\)/i,
    );
    expect(delivery).toMatch(
      /language plpgsql\s+security invoker\s+set search_path = ''/i,
    );
    expect(delivery).toContain("cardinality(v_ids) < 1");
    expect(delivery).toContain("cardinality(v_ids) > 100");
    expect(delivery).toContain("array_position(v_ids, null) is not null");
    expect(delivery).toContain("count(distinct requested.id)");
    expect(delivery).toContain("message = 'invalid_request'");

    const lock = delivery.indexOf("from public.invites i");
    const clock = delivery.indexOf("v_now := clock_timestamp()");
    const update = delivery.indexOf("update public.invites i");
    const result = delivery.lastIndexOf("from public.invites i");
    expect(lock).toBeGreaterThan(-1);
    expect(delivery.slice(lock, clock)).toMatch(
      /seeker_profile_id = p_seeker_profile_id[\s\S]*id = any\(v_ids\)[\s\S]*order by i\.id[\s\S]*for update/i,
    );
    expect(clock).toBeGreaterThan(lock);
    expect(update).toBeGreaterThan(clock);
    expect(result).toBeGreaterThan(update);
    expect(delivery).toMatch(
      /i\.status = 'created'[\s\S]*i\.expires_at is not null[\s\S]*i\.expires_at > v_now/i,
    );
    expect(delivery).toMatch(
      /from public\.listings l,\s*public\.host_profiles h,\s*public\.seeker_profiles s[\s\S]*l\.id = i\.listing_id[\s\S]*l\.host_profile_id = i\.host_profile_id[\s\S]*l\.status = 'live'[\s\S]*l\.provenance = 'verified'[\s\S]*l\.expires_at > v_now/i,
    );
    expect(delivery).toMatch(
      /h\.id = i\.host_profile_id[\s\S]*h\.account_status = 'active'[\s\S]*h\.deleted_at is null[\s\S]*nullif\(btrim\(h\.clerk_user_id\), ''\) is not null/i,
    );
    expect(delivery).toMatch(
      /s\.id = i\.seeker_profile_id[\s\S]*s\.deleted_at is null[\s\S]*nullif\(btrim\(s\.clerk_user_id\), ''\) is not null/i,
    );
    expect(delivery).toMatch(
      /join public\.listings l on l\.id = i\.listing_id[\s\S]*join public\.host_profiles h on h\.id = i\.host_profile_id[\s\S]*join public\.seeker_profiles s on s\.id = i\.seeker_profile_id[\s\S]*i\.status in \('delivered', 'viewed'\)[\s\S]*l\.host_profile_id = i\.host_profile_id[\s\S]*l\.status = 'live'[\s\S]*l\.provenance = 'verified'[\s\S]*h\.account_status = 'active'[\s\S]*s\.deleted_at is null[\s\S]*order by i\.id/i,
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.deliver_seeker_invites\(uuid, uuid\[\]\)\s+from public, anon, authenticated;[\s\S]*?grant execute on function public\.deliver_seeker_invites\(uuid, uuid\[\]\)\s+to service_role/i,
    );
    expect(CONNECTED_ASSERTION).toContain(
      "atomic delivery lock/clock/status contract drifted",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "atomic delivery result/stamp/filter drifted",
    );
    for (const proof of [
      "paused listing invite was delivered",
      "unverified listing invite was delivered",
      "expired listing invite was delivered",
      "inactive host invite was delivered",
      "deleted host invite was delivered",
      "deleted seeker invite was delivered/stamped",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
  });

  it("keeps invite-only access at display name while application unlocks detail", () => {
    expect(hostView).toMatch(
      /stable\s+security definer\s+set search_path = ''/i,
    );
    expect(hostView).toContain("from public.applications a");
    expect(hostView).toContain("from public.conversations c");
    expect(hostView).not.toContain("from public.invites i");

    expect(displayNames).toMatch(
      /stable\s+security definer\s+set search_path = ''/i,
    );
    expect(displayNames).toContain("from public.applications a");
    expect(displayNames).toContain("from public.invites i");
    expect(displayNames).toContain("from public.conversations c");
    expect(displayNames).not.toContain("public.host_can_view_seeker(");
    expect(displayNames).toContain("cardinality(v_ids) > 200");

    expect(MIGRATION).toMatch(
      /revoke execute on function public\.host_can_view_seeker\(uuid\)\s+from public, anon, authenticated;[\s\S]*?grant execute on function public\.host_can_view_seeker\(uuid\)\s+to service_role/i,
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.get_host_applicant_display_names\(uuid\[\]\)\s+from public, anon;[\s\S]*?grant execute on function public\.get_host_applicant_display_names\(uuid\[\]\)\s+to authenticated, service_role/i,
    );
    for (const proof of [
      "applicant detail/name relationship boundary drifted",
      "invite-only host can resolve the narrow sent-list display name",
      "invite-only host cannot read the full seeker profile",
      "invite-only host cannot read seeker resume experience",
      "host cannot raw-select pre-application match internals",
      "application relationship unlocks the raw applicant match row",
      "application relationship unlocks the applicant profile",
      "application relationship unlocks applicant resume experience",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
  });

  it("serializes provider settlement and pre-send recheck with withdrawal", () => {
    for (const rpc of [settle, recheck, beginDelivery, claim, claimV2]) {
      expect(rpc).toMatch(/security invoker\s+set search_path = ''/i);
    }

    expect(settle).toMatch(
      /p_delivery_id uuid,\s*p_worker_id text,\s*p_provider_message_id text,\s*p_delivered_at timestamptz\s*\)\s*returns jsonb/i,
    );
    const mapping = settle.indexOf("from public.notification_deliveries d");
    const inviteLock = settle.indexOf("where i.id = v_invite_id");
    const deliveryLock = settle.lastIndexOf(
      "from public.notification_deliveries d",
    );
    const inviteUpdate = settle.indexOf("update public.invites i");
    const deliveryUpdate = settle.lastIndexOf(
      "update public.notification_deliveries d",
    );
    expect(mapping).toBeGreaterThan(-1);
    expect(settle.slice(mapping, inviteLock)).toContain(
      "join public.invites i on i.id = e.subject_id",
    );
    expect(settle.slice(mapping, inviteLock)).toContain(
      "d.recipient_clerk_user_id = s.clerk_user_id",
    );
    expect(inviteLock).toBeGreaterThan(mapping);
    expect(settle.slice(inviteLock, deliveryLock)).toMatch(/for update/i);
    expect(deliveryLock).toBeGreaterThan(inviteLock);
    expect(settle.slice(deliveryLock, inviteUpdate)).toMatch(/for update of d/i);
    expect(settle).toContain(
      "v_delivery_worker_id is distinct from p_worker_id",
    );
    expect(inviteUpdate).toBeGreaterThan(deliveryLock);
    expect(deliveryUpdate).toBeGreaterThan(inviteUpdate);
    expect(settle).toContain("if v_invite_status = 'withdrawn' then");
    expect(settle).toMatch(
      /set status = case\s+when i\.status = 'created' then 'delivered'\s+else i\.status\s+end/i,
    );
    expect(settle).toContain("i.status in ('created', 'expired')");
    expect(settle).toContain("coalesce(i.delivered_at, v_now)");
    expect(settle).toContain("coalesce(d.delivered_at, v_now)");
    expect(settle).not.toContain("coalesce(i.delivered_at, p_delivered_at)");
    expect(settle).not.toContain("coalesce(d.delivered_at, p_delivered_at)");
    expect(settle).not.toContain("v_invite_expires_at");
    expect(settle).not.toMatch(/expires_at\s*<=/i);

    expect(recheck).toMatch(
      /returns table \(\s*status text,\s*expires_at timestamptz\s*\)/i,
    );
    expect(recheck).toMatch(
      /p_invite_id uuid,\s*p_delivery_id uuid,\s*p_worker_id text/i,
    );
    const recheckMapping = recheck.indexOf(
      "from public.notification_deliveries d",
    );
    const recheckInviteLock = recheck.indexOf("from public.invites i", recheckMapping);
    const recheckDeliveryLock = recheck.indexOf(
      "from public.notification_deliveries d",
      recheckInviteLock + 1,
    );
    expect(recheckMapping).toBeGreaterThan(-1);
    expect(recheck.slice(recheckMapping, recheckInviteLock)).toContain(
      "join public.invites i on i.id = e.subject_id",
    );
    expect(recheck.slice(recheckMapping, recheckInviteLock)).toContain(
      "d.recipient_clerk_user_id = s.clerk_user_id",
    );
    expect(recheck.slice(recheckInviteLock, recheckDeliveryLock)).toContain(
      "for share",
    );
    expect(recheckDeliveryLock).toBeGreaterThan(recheckInviteLock);
    expect(recheck.slice(recheckDeliveryLock)).toContain("for update of d");
    for (const fence of [
      "v_delivery_status is distinct from 'processing'",
      "v_delivery_worker_id is distinct from p_worker_id",
      "v_delivery_lease_expires_at is null",
      "v_delivery_lease_expires_at <= v_now",
      "lease_expires_at = v_now + interval '330 seconds'",
      "'delivery_not_recheckable'",
    ]) {
      expect(recheck).toContain(fence);
    }
    for (const predicate of [
      "i.status in ('created', 'delivered', 'viewed')",
      "i.expires_at > clock_timestamp()",
      "l.host_profile_id = i.host_profile_id",
      "l.status = 'live'",
      "l.provenance = 'verified'",
      "l.expires_at > clock_timestamp()",
      "h.account_status = 'active'",
      "h.deleted_at is null",
      "s.deleted_at is null",
    ]) {
      expect(recheck).toContain(predicate);
    }

    expect(beginDelivery).toMatch(
      /p_invite_id uuid,\s*p_delivery_id uuid,\s*p_worker_id text/i,
    );
    expect(beginDelivery).toContain(
      "v_claim_authority_version is distinct from '094'",
    );
    expect(beginDelivery).toContain("provider_started_at = case");
    expect(beginDelivery).toContain("when v_actionable then coalesce(");
    expect(beginDelivery).toContain("lease_expires_at = v_now + interval '330 seconds'");
    expect(beginDelivery).toContain("'delivery_not_startable'");

    expect(claim).toContain(
      "d.notification_type <> 'invite_received'",
    );
    expect(claim).not.toContain("d.notification_type = 'invite_received'");
    expect(claim).not.toContain("claim_authority_version = '094'");

    expect(claimV2).toContain("d.provider_started_at is null");
    expect(claimV2).toContain("d.provider_started_at is not null");
    expect(claimV2).toContain("failure_class = 'known_unsent'");
    expect(claimV2).toContain("failure_class = 'outcome_unknown'");
    expect(claimV2).toContain(
      "'invite provider-started lease expired; provider outcome unknown'",
    );
    expect(claimV2).toMatch(
      /when d\.notification_type = 'invite_received' then\s+greatest\(330, least\(p_lease_seconds, 3600\)\)/i,
    );
    expect(claimV2).toContain("then '094'");
    expect(MIGRATION).toMatch(
      /add column if not exists provider_started_at timestamptz/i,
    );
    expect(MIGRATION).toMatch(
      /add column if not exists claim_authority_version text/i,
    );
    expect(MIGRATION).toMatch(
      /add constraint notification_deliveries_invite_claim_authority_094_chk[\s\S]*?status is not distinct from 'processing'[\s\S]*?claim_authority_version is not distinct from '094'[\s\S]*?status is distinct from 'processing'[\s\S]*?claim_authority_version is null[\s\S]*?not valid/i,
    );
    expect(MIGRATION).toContain(
      "'pre-094 invite processing; provider outcome unknown'",
    );
    expect(MIGRATION).toContain(
      "'pre-094 invite digest member; provider outcome unknown'",
    );

    for (const signature of [
      "public.settle_invite_notification_delivery(uuid, text, text, timestamptz)",
      "public.get_invite_notification_state(uuid, uuid, text)",
      "public.begin_invite_notification_delivery(uuid, uuid, text)",
      "public.claim_notification_deliveries(text, integer, integer)",
      "public.claim_notification_deliveries_v2(text, integer, integer)",
    ]) {
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke execute on function ${signature.replace(/[()]/g, "\\$&")}\\s+from public, anon, authenticated;[\\s\\S]*?grant execute on function ${signature.replace(/[()]/g, "\\$&")}\\s+to service_role`,
          "i",
        ),
      );
    }

    for (const proof of [
      "atomic provider settlement mapping/lock contract drifted",
      "pre-send exact worker lease/actionability lock drifted",
      "pre-send actionability invalidation drifted",
      "versioned pre/provider-phase claim behavior drifted",
      "post-send expiry settlement drifted",
      "withdrawn late settlement drifted",
      "provider-phase sweep or versioned 330-second claim drifted",
      "invite processing claim requires a non-null 094 authority marker",
      "processing exit did not clear claim authority",
      "historical nonrefundable invite restore conflict count drifted",
      "known-unsent invite dead letter was not requeueable",
      "final provider boundary phase/lease drifted",
      "nonactionable provider boundary marked submission",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
  });

  it("withdraws atomically and restores only the created invite's matching consume", () => {
    expect(withdraw).toMatch(
      /p_host_profile_id uuid,\s*p_invite_id uuid\s*\)\s*returns jsonb/i,
    );
    expect(withdraw).toMatch(
      /language plpgsql\s+security invoker\s+set search_path = ''/i,
    );

    const invalid = withdraw.indexOf("'error', 'invalid_request'");
    const inviteLock = withdraw.indexOf("from public.invites i");
    const concealment = withdraw.indexOf("'error', 'invite_not_withdrawable'");
    const retry = withdraw.indexOf("if v_status = 'withdrawn' then");
    const deliveryLock = withdraw.indexOf("from public.notification_deliveries d");
    const processingBlock = withdraw.indexOf("if v_delivery_processing then");
    const expiredLeaseSweep = withdraw.indexOf(
      "'invite provider-started lease expired; provider outcome unknown'",
    );
    const digestCancel = withdraw.indexOf("update public.digest_memberships dm");
    const deliveryCancel = withdraw.lastIndexOf(
      "update public.notification_deliveries d",
    );
    const creditLock = withdraw.indexOf("'invite_credit:'");
    const update = withdraw.indexOf("update public.invites i");
    const restoreEligible = withdraw.lastIndexOf("if v_restore_eligible then");
    const restore = withdraw.indexOf(
      "insert into public.invite_credit_events",
    );
    expect(invalid).toBeGreaterThan(-1);
    expect(inviteLock).toBeGreaterThan(invalid);
    expect(withdraw.slice(inviteLock, concealment)).toMatch(/for update of i/i);
    expect(concealment).toBeGreaterThan(inviteLock);
    expect(retry).toBeGreaterThan(concealment);
    expect(deliveryLock).toBeGreaterThan(retry);
    expect(withdraw.slice(deliveryLock, processingBlock)).toMatch(
      /order by d\.id[\s\S]*for update of d/i,
    );
    expect(expiredLeaseSweep).toBeGreaterThan(deliveryLock);
    expect(processingBlock).toBeGreaterThan(expiredLeaseSweep);
    expect(processingBlock).toBeGreaterThan(deliveryLock);
    expect(digestCancel).toBeGreaterThan(processingBlock);
    expect(deliveryCancel).toBeGreaterThan(digestCancel);
    expect(creditLock).toBeGreaterThan(retry);
    expect(creditLock).toBeGreaterThan(deliveryCancel);
    expect(update).toBeGreaterThan(creditLock);
    expect(restoreEligible).toBeGreaterThan(update);
    expect(restore).toBeGreaterThan(restoreEligible);
    expect(withdraw).toContain(
      "v_status not in ('created', 'delivered', 'viewed', 'withdrawn')",
    );
    expect(withdraw).toContain("d.status = 'delivered'");
    expect(withdraw).toContain("d.status = 'dead_letter'");
    expect(withdraw).toContain("d.failure_class = 'outcome_unknown'");
    expect(withdraw).toContain(
      "d.failure_class is distinct from 'outcome_unknown'",
    );
    expect(withdraw).toContain(
      "d.status in ('pending', 'deferred', 'failed_retryable')",
    );
    expect(withdraw).toMatch(
      /update public\.invites i\s+set status = 'withdrawn'\s+where i\.id = p_invite_id\s+and i\.status = v_status/i,
    );
    expect(withdraw).toMatch(
      /select\s+e\.host_profile_id,\s*'restore',\s*e\.source,\s*e\.credits,\s*e\.invite_id,\s*e\.period_key\s+from public\.invite_credit_events e\s+where e\.invite_id = p_invite_id\s+and e\.host_profile_id = p_host_profile_id\s+and e\.kind = 'consume'\s+on conflict do nothing/i,
    );
    expect(withdraw).toContain("'disposition', 'withdrawn'");
    expect(withdraw).toContain("'disposition', 'already_withdrawn'");
    expect(withdraw).toContain("'credit_restored', false");
    expect(withdraw).toContain("'credit_restored', v_credit_restored");

    const errors = [...withdraw.matchAll(/'error', '([^']+)'/g)].map(
      (match) => match[1],
    );
    expect([...new Set(errors)].sort()).toEqual(
      [
        "invalid_request",
        "invite_authority_rollout_draining",
        "invite_delivery_in_progress",
        "invite_not_withdrawable",
      ].sort(),
    );
    expect(withdraw).not.toMatch(
      /sqlerrm|message_text|get stacked diagnostics/i,
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function public\.withdraw_host_invite\(uuid, uuid\)\s+from public, anon, authenticated;[\s\S]*?grant execute on function public\.withdraw_host_invite\(uuid, uuid\)\s+to service_role/i,
    );
    for (const proof of [
      "atomic invite/delivery/cancel/credit lock order drifted",
      "processing delivery did not block refund",
      "expired/null processing withdrawal self-terminalization drifted",
      "expired pre-provider claim refund drifted",
      "known-unsent dead-letter/event-anchored digest cancellation/refund drifted",
      "delivered/dead-letter audit or no-refund invariant drifted",
      "created withdrawal/restoration result drifted",
      "withdrawn retry idempotency result drifted",
      "delivered withdrawal result drifted",
      "viewed withdrawal result drifted",
      "withdrawal status/no-spend/restore invariant drifted",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
  });

  it("wires rollback-only, RPC-grant, and production deployment proof", () => {
    const migrationLink = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: link the production project",
    );
    const migrationState = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: inspect production migration state",
    );
    const dbFirstPush = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: push migration 094 before the web release",
    );
    const immediateProof = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: verify migration 094 production authority immediately",
    );
    const vercelGate = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: wait for this commit's vercel production deployment",
    );
    const appFirstPush = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: push migrations after the web release",
    );
    const finalProof = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: verify production schema contract",
    );
    const drainProof = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: wait for migration 094 authority drain",
    );
    const finalHealth = DB_MIGRATE_WORKFLOW.indexOf(
      "- name: verify post-migration production runtime",
    );
    expect(migrationLink).toBeGreaterThan(-1);
    expect(migrationState).toBeGreaterThan(migrationLink);
    expect(dbFirstPush).toBeGreaterThan(migrationState);
    expect(immediateProof).toBeGreaterThan(dbFirstPush);
    expect(vercelGate).toBeGreaterThan(immediateProof);
    expect(appFirstPush).toBeGreaterThan(vercelGate);
    expect(finalProof).toBeGreaterThan(appFirstPush);
    expect(drainProof).toBeGreaterThan(finalProof);
    expect(finalHealth).toBeGreaterThan(drainProof);
    expect(DB_MIGRATE_WORKFLOW).toContain("db_first_094=true");
    expect(DB_MIGRATE_WORKFLOW).toContain("$local - $remote | sort");
    expect(DB_MIGRATE_WORKFLOW).toContain(". == [\"094\"]");
    expect(DB_MIGRATE_WORKFLOW).toContain(
      "refusing db push so neither an older gap nor a future migration bypasses app-first ordering",
    );
    expect(DB_MIGRATE_WORKFLOW).toContain(
      "clock_timestamp() >= applied_at + interval '330 seconds'",
    );
    expect(DB_MIGRATE_WORKFLOW).not.toContain("sleep 330");
    const finalEpochWrite = MIGRATION.lastIndexOf(
      "update public.invite_authority_rollout_094",
    );
    const transactionCommit = MIGRATION.lastIndexOf("\ncommit;");
    expect(finalEpochWrite).toBeGreaterThan(
      MIGRATION.indexOf("create or replace function public.withdraw_host_invite"),
    );
    expect(transactionCommit).toBeGreaterThan(finalEpochWrite);
    expect(MIGRATION.slice(finalEpochWrite, transactionCommit)).toMatch(
      /set applied_at = clock_timestamp\(\)[\s\S]*where singleton is true;/i,
    );
    expect(CONNECTED_ASSERTION).toMatch(/^\s*begin;/m);
    expect(CONNECTED_ASSERTION).toMatch(/^\s*rollback;/m);
    expect(CONNECTED_ASSERTION.match(/checkpoint_section\(/g)).toHaveLength(9);
    expect(CONNECTED_ASSERTION).toContain(
      "assert_suite_complete('host seeker discovery', 9, 15, 37)",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "search hides a sourced listing behind listing_unavailable",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "dual-role host cannot raw-select a discovery candidate",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "dual-role host retains raw access only to its own seeker row",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "dual-role seeker cannot opt a foreign profile into host discovery",
    );
    expect(CONNECTED_ASSERTION).toContain(
      "seeker owner can opt their own profile into host discovery",
    );
    for (const label of [
      "authenticated host cannot bypass atomic withdrawal by direct update",
      "seeker cannot read a refundable created invite before delivery authority",
      "owning host retains its created invite sent-list row",
      "refunded undelivered withdrawal stays hidden from its seeker",
      "undelivered expired invite stays hidden from its seeker",
      "delivered withdrawn invite remains visible to its seeker",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(label);
    }
    expect(CONNECTED_ASSERTION).toMatch(
      /i\.id = '94007000-0000-4000-8000-000000000016'[\s\S]{0,160}i\.status = 'withdrawn'[\s\S]{0,100}i\.delivered_at is null/i,
    );
    expect(ASSERTION_DRIVER).toContain(
      'join(here, "sql", "assert_host_seeker_discovery.sql")',
    );
    for (const functionName of [
      "search_host_sourceable_seekers",
      "get_host_sourceable_matches",
      "create_host_source_invite_with_credit",
      "deliver_seeker_invites",
      "settle_invite_notification_delivery",
      "get_invite_notification_state",
      "begin_invite_notification_delivery",
      "claim_notification_deliveries",
      "claim_notification_deliveries_v2",
      "withdraw_host_invite",
      "prevent_queued_invite_digest_membership_094",
      "prevent_invite_dead_letter_requeue_094",
    ]) {
      expect(RPC_ASSERTION).toContain(`'${functionName}'`);
    }
    for (const field of [
      "migration_094_applied",
      "host_seeker_discovery_contract_safe",
    ]) {
      expect(PRODUCTION_ASSERTION).toContain(`as ${field}`);
      expect(DB_MIGRATE_WORKFLOW).toContain(`.[0].${field} == true`);
    }
    expect(PRODUCTION_ASSERTION).toContain(
      "p.polname = 'seeker_profiles_select_own'",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "p.polcmd = 'r'",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "a.grantee = 0",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "position('profile_photo_url' in lower(p.prosrc)) = 0",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "host_discovery_enabled",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "notification_deliveries_invite_open_cadence_chk",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "trg_digest_memberships_no_invite_queue_094",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "trg_notification_deliveries_invite_dead_letter_094",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "notification_deliveries_invite_claim_authority_094_chk",
    );
    expect(PRODUCTION_ASSERTION).toContain("provider_started_at");
    expect(PRODUCTION_ASSERTION).toContain("claim_authority_version");
    expect(PRODUCTION_ASSERTION).toContain("invite_authority_rollout_094");
    expect(PRODUCTION_ASSERTION).toContain(
      "'public.claim_notification_deliveries_v2(text,integer,integer)'",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "'public.begin_invite_notification_delivery(uuid,uuid,text)'",
    );
    expect(PRODUCTION_ASSERTION).toContain("restore.kind = 'restore'");
    expect(DB_MIGRATE_WORKFLOW).toContain("migrations 077/091/092/093/094");
    expect(DB_ASSERT_PACKAGE).toContain(
      "node ./assert-invite-delivery-concurrency.mjs",
    );
    expect(DB_SECURITY_WORKFLOW).toContain(
      "node tools/db-assert/assert-invite-delivery-concurrency.mjs",
    );
    for (const marker of [
      "delivery-first state",
      "withdrawal-first state",
      "wait_event_type = 'lock'",
      "processing barrier state",
      "fenced_no_row",
      "invite claim/initial lease drifted",
      "worker-bound pre-send recheck drifted",
      "outcome-unknown state",
      "known_unsent",
      "known-unsent dead letter was not requeueable",
      "begin_invite_notification_delivery",
      "claim_notification_deliveries_v2",
      "withdrawn delivery was reclaimed",
      "delivery_not_settleable",
    ]) {
      expect(INVITE_CONCURRENCY_ASSERTION).toContain(marker);
    }
  });

  it("pins all fourteen deployed function bodies with parenthesis-sensitive fingerprints", () => {
    expect(searchFingerprint).toBe("b62212f712bb1c3831246d593ff46597");
    expect(matchesFingerprint).toBe("72d7872064cef20ebda5b8278b977f12");
    expect(writerFingerprint).toBe("2193dbaa51bb7dcc186ba65d00b195eb");
    expect(deliveryFingerprint).toBe("65136e64ab86ffa0174ab267c784dc2e");
    expect(settleFingerprint).toBe("b6b7a56e7a50f36abee1428de746e283");
    expect(recheckFingerprint).toBe("e48ec2e60bdfb886f91a4972c0cd21ed");
    expect(beginDeliveryFingerprint).toBe("3ef77cd99536a5ba9dac3e959cf6b2d9");
    expect(claimFingerprint).toBe("1544e504941d2f22fd1b10b20f1f9213");
    expect(claimV2Fingerprint).toBe("75fdee070acebe21e4772d719619d280");
    expect(digestGuardFingerprint).toBe("372344d0cec4b61d97249b6a40ed615a");
    expect(deadLetterGuardFingerprint).toBe("cccd7a864734cafd44112da290c1ba1e");
    expect(withdrawFingerprint).toBe("a248a4973e83513ef7c1b6c7ab6ed79f");
    expect(hostViewFingerprint).toBe("60715a76f7b8dd9518b5cf6773690014");
    expect(displayNamesFingerprint).toBe("7f97c3497c19d35cf8245cf1a8db8d34");
    for (const fingerprint of [
      searchFingerprint,
      matchesFingerprint,
      writerFingerprint,
      deliveryFingerprint,
      settleFingerprint,
      recheckFingerprint,
      beginDeliveryFingerprint,
      claimFingerprint,
      claimV2Fingerprint,
      digestGuardFingerprint,
      deadLetterGuardFingerprint,
      withdrawFingerprint,
      hostViewFingerprint,
      displayNamesFingerprint,
    ]) {
      expect(PRODUCTION_ASSERTION).toContain(fingerprint);
    }
    expect(PRODUCTION_ASSERTION).toContain(
      "md5(translate(lower(p.prosrc), e' \\t\\n\\r', ''))",
    );
    expect(PRODUCTION_ASSERTION).not.toContain("e' \\t\\n\\r()'");
  });
});
