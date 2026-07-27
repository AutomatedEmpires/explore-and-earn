import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const migrationsDir = new URL("../../supabase/migrations/", import.meta.url)
const migrationFiles = readdirSync(migrationsDir).filter((file) =>
  file.endsWith(".sql"),
)

const checks = [
  {
    code: "G004",
    pattern: /accepted_roles/i,
    message: "accepted_roles table or enum is not allowed in V1.",
  },
  {
    code: "G005",
    pattern: /search_documents/i,
    message: "search_documents table is not allowed in V1.",
  },
  {
    code: "G006",
    pattern: /(farm_listings|maritime_listings|remote_listings|seasonal_listings)/i,
    message: "category-specific listing tables are not allowed in V1.",
  },
]

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\r\n]*/g, " ")
}

let hasFailure = false
const fileContents = new Map()

for (const file of migrationFiles) {
  const content = readFileSync(join(migrationsDir.pathname, file), "utf8")
  fileContents.set(file, content)

  for (const check of checks) {
    if (check.pattern.test(content)) {
      hasFailure = true
      console.error(`${check.code}: ${file} ${check.message}`)
    }
  }
}

// ---------------------------------------------------------------------------
// G-SEC-RPC - Lane A static guardrail for SECURITY DEFINER RPC execute grants.
// Every identity-sensitive function in `public` must never be granted EXECUTE
// to anon/PUBLIC. The original 8 functions must also remain explicitly revoked
// by historical migration 023. Newer functions own their grants in their own
// migrations and are covered by the source-wide grant scan below.
// ---------------------------------------------------------------------------
const HISTORICAL_LOCKED_FUNCTIONS = [
  "set_host_attestation",
  "get_clerk_user_id",
  "current_seeker_profile_ids",
  "current_host_profile_ids",
  "current_host_listing_ids",
  "current_conversation_ids",
  "enforce_listing_cover_asset",
  "enforce_listing_media_override",
]
const LOCKED_FUNCTIONS = [
  ...HISTORICAL_LOCKED_FUNCTIONS,
  "create_my_host_profile",
  "ensure_my_seeker_profile",
  "ensure_my_application_conversation",
  "ensure_my_host_application_conversation",
  "get_my_conversation_contexts",
]

for (const [file, content] of fileContents) {
  const lower = content.toLowerCase()
  for (const fn of LOCKED_FUNCTIONS) {
    const grantRe = new RegExp(
      `grant\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+to\\s+([^;]*);`,
      "g",
    )
    let m
    while ((m = grantRe.exec(lower)) !== null) {
      if (/\banon\b/.test(m[1]) || /\bpublic\b/.test(m[1])) {
        hasFailure = true
        console.error(
          `G-SEC-RPC: ${file} grants EXECUTE on ${fn} to anon/public (forbidden).`,
        )
      }
    }
  }
}

const securityMigration = migrationFiles.find((f) => /^023_.*\.sql$/.test(f))
if (!securityMigration) {
  hasFailure = true
  console.error(
    "G-SEC-RPC: expected the Lane A security migration 023_*.sql to be present.",
  )
} else {
  const sql = fileContents.get(securityMigration).toLowerCase()
  const defaultPrivilegeRoles = new Set()
  const defaultPrivilegeRe = /alter\s+default\s+privileges[\s\S]*?revoke\s+execute\s+on\s+functions\s+from\s+([^;]*);/g
  let defaultPrivilegeMatch
  while ((defaultPrivilegeMatch = defaultPrivilegeRe.exec(sql)) !== null) {
    for (const role of ["anon", "authenticated", "public"]) {
      if (new RegExp(`\\b${role}\\b`).test(defaultPrivilegeMatch[1])) {
        defaultPrivilegeRoles.add(role)
      }
    }
  }
  if (
    !defaultPrivilegeRoles.has("anon")
    || !defaultPrivilegeRoles.has("authenticated")
    || !defaultPrivilegeRoles.has("public")
  ) {
    hasFailure = true
    console.error(
      `G-SEC-RPC: ${securityMigration} must revoke default EXECUTE on functions from anon, authenticated, and public.`,
    )
  }
  for (const fn of HISTORICAL_LOCKED_FUNCTIONS) {
    const revokeRe = new RegExp(
      `revoke\\s+execute\\s+on\\s+function\\s+(?:public\\.)?${fn}\\s*\\([^)]*\\)\\s+from\\s+([^;]*);`,
      "i",
    )
    const rm = sql.match(revokeRe)
    if (!rm) {
      hasFailure = true
      console.error(
        `G-SEC-RPC: ${securityMigration} must REVOKE EXECUTE on ${fn} from anon/authenticated/public.`,
      )
    } else if (
      !/\banon\b/.test(rm[1])
      || !/\bauthenticated\b/.test(rm[1])
      || !/\bpublic\b/.test(rm[1])
    ) {
      hasFailure = true
      console.error(
        `G-SEC-RPC: ${securityMigration} REVOKE on ${fn} must include anon, authenticated, and public.`,
      )
    }
  }
}

// Clerk-native onboarding must stay behind narrow, JWT-derived functions. A
// direct profile-table INSERT grant would re-open identity/trust-field choice.
const profileOnboardingMigration = migrationFiles.find((f) => /^073_.*\.sql$/.test(f))
if (!profileOnboardingMigration) {
  hasFailure = true
  console.error("G-PROFILE-ONBOARDING: expected migration 073 to be present.")
} else {
  const sql = fileContents
    .get(profileOnboardingMigration)
    .toLowerCase()
    .replace(/\s+/g, " ")
  const required = [
    "create or replace function public.get_clerk_user_id()",
    "when (auth.jwt() ->> 'sub') ~ '^user_[a-za-z0-9_-]+$'",
    "alter table public.host_profiles alter column owner_user_id drop not null;",
    "revoke insert on table public.host_profiles from anon, authenticated;",
    "revoke insert on table public.seeker_profiles from anon, authenticated;",
    "create or replace function public.create_my_host_profile",
    "create or replace function public.ensure_my_seeker_profile",
    "security definer",
    "set search_path = ''",
    "public.get_clerk_user_id()",
    "message = 'profile_identity_required'",
    "message = 'profile_identity_disabled'",
    "array['farm', 'maritime', 'remote', 'seasonal']::text[]",
    "category_scopes is not null",
    "cardinality(category_scopes) between 1 and 4",
    "validate constraint host_profiles_category_scopes_lane_check",
    "v_slug := v_slug_base || '-' || v_profile_id::text",
    "grant execute on function public.create_my_host_profile(text, text[], text) to authenticated, service_role;",
    "grant execute on function public.ensure_my_seeker_profile() to authenticated, service_role;",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-PROFILE-ONBOARDING: ${profileOnboardingMigration} is missing ${needle}`,
      )
    }
  }
  if (
    /grant\s+insert[\s\S]*public\.(?:host_profiles|seeker_profiles)[\s\S]*authenticated/.test(sql)
  ) {
    hasFailure = true
    console.error(
      `G-PROFILE-ONBOARDING: ${profileOnboardingMigration} grants direct profile INSERT.`,
    )
  }
}

// Housing evidence is a cross-row invariant: every mutation/ownership trigger,
// owner-only column grants, and the effective public RPC must travel with 072.
const housingMigration = migrationFiles.find((f) => /^072_.*\.sql$/.test(f))
if (!housingMigration) {
  hasFailure = true
  console.error("G-HOUSING-PHOTOS: expected migration 072 to be present.")
} else {
  const sql = fileContents.get(housingMigration).toLowerCase().replace(/\s+/g, " ")
  const required = [
    "grant update (benefit_library) on public.host_profiles to authenticated;",
    "revoke select on table public.host_profiles from authenticated;",
    "revoke select (benefit_library) on public.host_profiles from anon, authenticated;",
    "revoke select on table public.listings from anon, authenticated;",
    "revoke select (benefit_details) on public.listings from anon, authenticated;",
    "create or replace function public.get_public_housing_photos",
    "grant execute on function public.get_public_housing_photos(uuid) to anon, authenticated, service_role;",
    "create or replace function public.get_public_benefit_details",
    "create or replace function public.get_owned_benefit_context",
    "create or replace function public.get_my_host_benefit_library",
    "create or replace function public.save_owned_benefit_detail",
    "create or replace function public.set_my_housing_library_photo",
    "grant execute on function public.save_owned_benefit_detail(uuid, text, jsonb) to authenticated, service_role;",
    "grant execute on function public.set_my_housing_library_photo(text, text) to authenticated, service_role;",
    "new.status not in ('under_review', 'live')",
    "new.provenance = 'sourced'",
    "lock table public.host_profiles in share row exclusive mode;",
    "lock table public.listings in share row exclusive mode;",
    "lock table storage.objects in share row exclusive mode;",
    "file_size_limit = 5242880",
    "'image/jpeg'",
    "'image/png'",
    "'image/webp'",
    "'image/heic'",
    "create or replace function private.stored_housing_photo_object_name",
    "create or replace function private.housing_photo_metadata_is_valid",
    "and private.housing_photo_metadata_is_valid(o.metadata)",
    "current_setting('request.headers', true)",
    "v_url_host <> v_request_host",
    "mamosbzcbigcclafhmmr.supabase.co",
    "'127.0.0.1', 'localhost', '::1'",
    "p_host_profile_id::text || '/library/housing/' || v_role",
    "p_host_profile_id::text || '/benefit/' || p_listing_id::text || '/housing/' || v_role",
    "split_part(name, '/', 2) = 'library'",
    "split_part(name, '/', 4) = 'housing'",
    "housing_photo_roles_missing:",
    "housing_photo_roles_in_use:",
    "housing_photo_object_in_use",
    "housing_photo_migration_restricted_listings=%",
    "set status = case",
    "when l.status = 'under_review' then 'draft'",
    "else 'paused'",
    "create or replace function private.preserve_claim_benefit_details",
    "create trigger trg_listings_claim_benefit_ownership",
    "'benefit_details', coalesce(old.benefit_details, '{}'::jsonb)",
    "new.benefit_details := '{}'::jsonb",
    "create trigger trg_listings_housing_photos",
    "create trigger trg_host_profiles_housing_library",
    "create trigger trg_storage_housing_photo_references",
    "before delete or update on storage.objects",
    "from storage.objects o",
    "revoke execute on function private.enforce_listing_housing_photos() from public, anon, authenticated;",
    "revoke execute on function private.preserve_claim_benefit_details() from public, anon, authenticated;",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(`G-HOUSING-PHOTOS: ${housingMigration} is missing ${needle}`)
    }
  }
  if (
    sql.includes("grant update on public.host_profiles to authenticated")
    || sql.includes("grant select on public.host_profiles to anon")
    || sql.includes("grant select (benefit_library) on public.host_profiles to anon")
    || sql.includes("grant select (benefit_library) on public.host_profiles to authenticated")
    || sql.includes("grant select (benefit_details) on public.listings to anon")
    || sql.includes("if tg_op = 'update' and old.bucket_id = new.bucket_id and old.name = new.name")
    || sql.includes("listing_media_overrides")
  ) {
    hasFailure = true
    console.error(`G-HOUSING-PHOTOS: ${housingMigration} broadens privileges or revives rejected storage.`)
  }
}

// An RLS policy on table A that sub-selects table B is permission-checked
// against the INVOKING role, column bitmap included -- unlike a policy on its
// own table, which is evaluated as the table owner. Migration 081 moved every
// anon/authenticated policy that reached host_profiles.clerk_user_id onto the
// SECURITY DEFINER helpers so that withdrawing the column grant cannot 42501
// storage uploads or the community feed. Reverting any of them to the inline
// sub-select reopens that hazard silently, so the shape is pinned here.
const policyIdentityMigration = migrationFiles.find((f) => /^081_.*\.sql$/.test(f))
if (!policyIdentityMigration) {
  hasFailure = true
  console.error("G-POLICY-HOST-IDENTITY: expected migration 081 to be present.")
} else {
  const sql = fileContents
    .get(policyIdentityMigration)
    .toLowerCase()
    .replace(/\s+/g, " ")
  const required = [
    "create policy host_announcements_owner_read_all",
    "create policy host_announcements_owner_insert",
    "create policy host_announcements_owner_update",
    "create policy listing_media_select_own_folder",
    "create policy listing_media_insert_own_folder",
    "create policy listing_media_update_own_folder",
    "create policy listing_media_delete_own_folder",
    "create policy profile_photos_select_own_folder",
    "create policy profile_photos_insert_own_folder",
    "create policy profile_photos_update_own_folder",
    "create policy profile_photos_delete_own_folder",
    "public.current_host_profile_ids()",
    "public.current_seeker_profile_ids()",
    // 072's Housing-evidence carve-out must survive the rewrite: those objects
    // are written only by the trusted service-role path, never by a client.
    "split_part(name, '/', 2) = 'library' and split_part(name, '/', 3) = 'housing'",
    "split_part(name, '/', 2) = 'benefit' and split_part(name, '/', 4) = 'housing'",
    // The migration proves the category is empty at apply time.
    "still reachable from anon/authenticated policies",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-POLICY-HOST-IDENTITY: ${policyIdentityMigration} is missing ${needle}`,
      )
    }
  }
  // The whole point is that no rewritten policy reaches the column any more.
  // Comments must be stripped FIRST: this migration explains the old expression
  // in its header, and a naive scan of the raw text would fail on the very
  // documentation that justifies the change.
  const executable = fileContents
    .get(policyIdentityMigration)
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
  const forbidden = [
    "from host_profiles hp",
    "from public.host_profiles hp",
    "hp.clerk_user_id",
    "sp.clerk_user_id",
  ]
  for (const needle of forbidden) {
    if (executable.includes(needle)) {
      hasFailure = true
      console.error(
        `G-POLICY-HOST-IDENTITY: ${policyIdentityMigration} still inlines ${needle} in executable SQL.`,
      )
    }
  }
}

// A host-editable coordinate pair must stay complete and geographically
// bounded even when a caller bypasses the application parser.
const coordinateMigration = migrationFiles.find((f) => /^074_.*\.sql$/.test(f))
if (!coordinateMigration) {
  hasFailure = true
  console.error("G-LISTING-COORDINATES: expected migration 074 to be present.")
} else {
  const sql = fileContents
    .get(coordinateMigration)
    .toLowerCase()
    .replace(/\s+/g, " ")
  const required = [
    "add constraint listings_coordinates_pair_check",
    "(latitude is null and longitude is null) or (latitude is not null and longitude is not null)",
    "validate constraint listings_coordinates_pair_check",
    "add constraint listings_coordinates_bounds_check",
    "latitude between -90 and 90",
    "longitude between -180 and 180",
    "validate constraint listings_coordinates_bounds_check",
    "add constraint listings_coordinates_location_check",
    "or nullif(btrim(location_display), '') is not null",
    "validate constraint listings_coordinates_location_check",
    "create or replace function private.preserve_listing_coordinate_truth()",
    "new.location_display is distinct from old.location_display",
    "claim_coordinate_snapshot_missing",
    "new.latitude := (v_snapshot->>'latitude')::double precision",
    "create trigger trg_listings_claim_coordinate_ownership",
    "grant update (latitude, longitude) on public.listings to authenticated;",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-LISTING-COORDINATES: ${coordinateMigration} is missing ${needle}`,
      )
    }
  }
}

// Either participant may open a message thread only through a JWT-owned,
// application-derived RPC. Direct client INSERT is closed completely; both
// functions serialize against terminal lifecycle changes and retain the
// application-scoped unique-index race gate.
const seekerConversationMigration = migrationFiles.find((f) => /^075_.*\.sql$/.test(f))
if (!seekerConversationMigration) {
  hasFailure = true
  console.error("G-SEEKER-CONVERSATION: expected migration 075 to be present.")
} else {
  const sql = fileContents
    .get(seekerConversationMigration)
    .toLowerCase()
    .replace(/\s+/g, " ")
  const required = [
    "create or replace function public.ensure_my_application_conversation",
    "create or replace function public.ensure_my_host_application_conversation",
    "create or replace function public.get_my_conversation_contexts",
    "drop policy if exists conversations_insert_party on public.conversations;",
    "revoke insert on table public.conversations from anon, authenticated;",
    "returns uuid",
    "security definer",
    "set search_path = ''",
    "public.get_clerk_user_id()",
    "s.clerk_user_id = v_clerk_user_id",
    "h.clerk_user_id = v_clerk_user_id",
    "a.id = p_application_id",
    "l.host_profile_id",
    "v_application_status not in",
    "on conflict (seeker_profile_id, host_profile_id, application_id)",
    "where application_id is not null",
    "cardinality(coalesce(p_conversation_ids, '{}'::uuid[])) between 1 and 200",
    "a.id = c.application_id",
    "a.seeker_profile_id = c.seeker_profile_id",
    "l.host_profile_id = c.host_profile_id",
    "c.listing_id is null or c.listing_id = a.listing_id",
    "s.clerk_user_id = actor.clerk_user_id",
    "h.clerk_user_id = actor.clerk_user_id",
    "revoke execute on function public.ensure_my_application_conversation(uuid) from public, anon;",
    "grant execute on function public.ensure_my_application_conversation(uuid) to authenticated, service_role;",
    "revoke execute on function public.ensure_my_host_application_conversation(uuid) from public, anon;",
    "grant execute on function public.ensure_my_host_application_conversation(uuid) to authenticated, service_role;",
    "revoke execute on function public.get_my_conversation_contexts(uuid[]) from public, anon;",
    "grant execute on function public.get_my_conversation_contexts(uuid[]) to authenticated, service_role;",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-SEEKER-CONVERSATION: ${seekerConversationMigration} is missing ${needle}`,
      )
    }
  }
  const lifecycleLockCount = sql.match(/for share of a, l/g)?.length ?? 0
  if (lifecycleLockCount < 2) {
    hasFailure = true
    console.error(
      `G-SEEKER-CONVERSATION: ${seekerConversationMigration} must lock lifecycle rows in both RPCs.`,
    )
  }
  if (
    /grant\s+insert\s+on\s+(?:table\s+)?public\.conversations\s+to\s+[^;]*authenticated/.test(
      sql,
    ) ||
    /create\s+policy[\s\S]*conversations[\s\S]*for\s+insert/.test(sql)
  ) {
    hasFailure = true
    console.error(
      `G-SEEKER-CONVERSATION: ${seekerConversationMigration} opens direct conversation INSERT.`,
    )
  }
}

// Service-only workflow functions must not inherit caller-controlled name
// resolution, and the public community bucket must not expose cross-owner
// object metadata.
const databaseHardeningMigration = migrationFiles.find((f) => /^076_.*\.sql$/.test(f))
if (!databaseHardeningMigration) {
  hasFailure = true
  console.error("G-DATABASE-HARDENING: expected migration 076 to be present.")
} else {
  const sql = stripSqlComments(fileContents.get(databaseHardeningMigration))
    .toLowerCase()
    .replace(/\s+/g, " ")
  const required = [
    "alter function public.create_invite_with_credit(uuid, uuid, uuid, text, uuid, integer) set search_path = '';",
    "alter function public.restore_invite_credit(uuid) set search_path = '';",
    "alter function public.transition_listing_claim(uuid, text, text, text) set search_path = '';",
    "alter function public.convert_claimed_listing(uuid, text, uuid, jsonb) set search_path = '';",
    "alter function public.claim_notification_deliveries(text, integer, integer) set search_path = '';",
    "alter function public.get_unprocessed_notification_events(integer) set search_path = '';",
    'drop policy if exists "community_photos_authenticated_select" on storage.objects;',
    'create policy "community_photos_owner_select" on storage.objects for select to authenticated using (',
    "bucket_id = 'community-photos' and (storage.foldername(name))[1] in ( select sp.id::text from public.seeker_profiles sp where sp.clerk_user_id = auth.jwt() ->> 'sub' )",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-DATABASE-HARDENING: ${databaseHardeningMigration} is missing ${needle}`,
      )
    }
  }
}

// Hosts publish their own listings (founder 2026-07-26). 082 widens 077's
// role-aware trigger with under_review -> live and closed -> draft. Two things
// are pinned here rather than only in the connected proof, because
// `pnpm guardrails` runs without a database while
// sql/assert_listing_host_status_transitions.sql runs only in db-security.yml:
// the two new edges must be present with their exact predicates, and 082 must
// not touch the publication floor it sits on top of.
const selfPublishMigration = migrationFiles.find((f) => /^082_.*\.sql$/.test(f))
if (!selfPublishMigration) {
  hasFailure = true
  console.error("G-HOST-SELF-PUBLISH: expected migration 082 to be present.")
} else {
  const sql = stripSqlComments(fileContents.get(selfPublishMigration))
    .toLowerCase()
    .replace(/\s+/g, " ")
  const required = [
    "create or replace function private.enforce_listing_host_status_transition()",
    "security invoker",
    "set search_path = ''",
    // Everything 077 enforced that 082 must not drop on the way past.
    "message = 'listing_initial_status_must_be_draft'",
    "message = 'listing_host_status_transition_forbidden'",
    "old.status = 'draft' and new.status = 'under_review'",
    "old.status = 'live' and new.status in ('paused', 'archived')",
    "old.status = 'paused' and new.status in ('live', 'archived')",
    // The two new edges, with the provenance split that keeps a sourced
    // closure (origin withdrew the posting) irreversible.
    "old.status = 'under_review' and new.status in ('draft', 'live')",
    "old.status = 'closed' and new.status = 'draft' and old.provenance is distinct from 'sourced' and new.provenance is distinct from 'sourced'",
    "revoke execute on function private.enforce_listing_host_status_transition() from public, anon, authenticated;",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-HOST-SELF-PUBLISH: ${selfPublishMigration} is missing ${needle}`,
      )
    }
  }
  // Removing the human approver must not relax the quality floor. 070's triad
  // CHECK and 072's housing-photo trigger are what still stop an unanswered
  // listing reaching under_review or live, so this migration touches neither.
  const forbidden = [
    "listings_publication_triad_chk",
    "listings_housing_included_evidence_chk",
    "listings_meals_included_evidence_chk",
    "drop constraint",
    "alter table public.listings",
    "drop trigger if exists trg_listings_housing_photos",
  ]
  for (const needle of forbidden) {
    if (sql.includes(needle)) {
      hasFailure = true
      console.error(
        `G-HOST-SELF-PUBLISH: ${selfPublishMigration} touches the publication floor (${needle}).`,
      )
    }
  }
}

// The paid listing allowance, checked without a database because `pnpm
// guardrails` runs without one while the connected proof
// (sql/assert_listing_allowance_enforcement.sql and
// assert-listing-slot-concurrency.mjs) runs only in db-security.yml.
//
// Four properties, each of which cost real money when it was absent:
//
//  * every writer of the purchased allowance must sweep the listings it just put
//    out of reach. The sweep had one caller, on the plan path, which the add-on
//    branch never reaches — so a cancelled add-on billed for one slot while the
//    database served four public listings.
//  * 083 must READ host_profiles.purchased_listing_slots BY NAME. It once
//    discovered the column from a list of four guesses, none of which was the
//    name the add-on shipped, so a host who bought five extra listings was
//    enforced at one while the application told them six.
//  * 085's revoke path must decide under the advisory lock. Reading the ledger
//    row before the lock and issuing an unguarded UPDATE let two overlapping
//    redeliveries of one cancellation both subtract.
//  * neither migration may hand the allowance column to a client role.
const allowanceMigration = migrationFiles.find((f) => /^083_.*\.sql$/.test(f))
const addOnMigration = migrationFiles.find((f) => /^085_.*\.sql$/.test(f))
if (!allowanceMigration || !addOnMigration) {
  hasFailure = true
  console.error("G-LISTING-ALLOWANCE: expected migrations 083 and 085 to be present.")
} else {
  const allowanceSql = stripSqlComments(fileContents.get(allowanceMigration))
    .toLowerCase()
    .replace(/\s+/g, " ")
  const addOnSql = stripSqlComments(fileContents.get(addOnMigration))
    .toLowerCase()
    .replace(/\s+/g, " ")

  const required = [
    [
      allowanceSql,
      "add column if not exists purchased_listing_slots integer not null default 0",
    ],
    [allowanceSql, "check (purchased_listing_slots >= 0)"],
    [allowanceSql, "h.purchased_listing_slots"],
    [allowanceSql, "create trigger trg_listings_plan_allowance"],
    [allowanceSql, "message = 'listing_allowance_exceeded'"],
    // Lock, then let the guarded UPDATE be the arbiter, then count the rows it
    // actually changed.
    [addOnSql, "where id = v_id and status = 'active'"],
    [addOnSql, "get diagnostics v_count = row_count;"],
    [addOnSql, "if v_count <> 1 then"],
  ]
  for (const [sql, needle] of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(`G-LISTING-ALLOWANCE: missing ${needle}`)
    }
  }

  // THE OVER-ALLOWANCE SWEEP MUST COVER THE ADD-ON TERM, NOT ONLY THE PLAN.
  //
  // public.close_host_listings_over_allowance had exactly ONE caller in the
  // system: syncHostSubscriptionTier, on the plan path. The add-on branch of
  // syncSubscriptionEvent returns before it, so an add-on that was cancelled,
  // went unpaid, or had its quantity reduced in the billing portal lowered the
  // allowance and left every listing above it live indefinitely -- Stripe
  // billing for one slot while the database served four public listings.
  //
  // The three functions below are the only writers of purchased_listing_slots,
  // which is the whole of the add-on term, so the sweep belongs inside them
  // rather than at a fourth call site the next branch would miss. Each must call
  // it, and each must call it AFTER the write that moved the allowance -- a
  // sweep that runs first reads the allowance the host is leaving.
  //
  // The comments are stripped above, so prose about the sweep cannot satisfy
  // this. The behaviour itself is proved in
  // sql/assert_listing_allowance_enforcement.sql, which needs a database.
  const addOnSweepSites = [
    [
      "credit_listing_slot_purchase",
      "purchased_listing_slots = purchased_listing_slots + p_quantity",
    ],
    [
      "revoke_listing_slot_purchase",
      "greatest(purchased_listing_slots - v_quantity, 0)",
    ],
    [
      "sync_listing_slot_subscription",
      "greatest(purchased_listing_slots + (v_target - v_current), 0)",
    ],
  ]
  for (const [fn, write] of addOnSweepSites) {
    const start = addOnSql.indexOf(`create or replace function public.${fn}(`)
    if (start < 0) {
      hasFailure = true
      console.error(`G-LISTING-ALLOWANCE: ${addOnMigration} is missing public.${fn}.`)
      continue
    }
    const end = addOnSql.indexOf("$$;", start)
    const body = addOnSql.slice(start, end < 0 ? undefined : end)
    const writeAt = body.indexOf(write)
    const sweepAt = body.indexOf("perform public.close_host_listings_over_allowance(")
    if (writeAt < 0) {
      hasFailure = true
      console.error(
        `G-LISTING-ALLOWANCE: public.${fn} no longer moves the purchased allowance.`,
      )
    } else if (sweepAt < 0) {
      hasFailure = true
      console.error(
        `G-LISTING-ALLOWANCE: public.${fn} moves the allowance without sweeping the over-allowance listings.`,
      )
    } else if (sweepAt < writeAt) {
      hasFailure = true
      console.error(
        `G-LISTING-ALLOWANCE: public.${fn} sweeps BEFORE it moves the allowance.`,
      )
    }
  }

  // Column-name discovery is the shape that failed open on a paid entitlement.
  // It has no acceptable form, so it is banned outright rather than bounded.
  //
  // The names are matched as SQL string literals and as qualified column
  // references, never as bare substrings: private.host_purchased_listing_allowance
  // is the function that reads the column CORRECTLY, and its own name contains
  // one of the guesses.
  for (const guess of [
    "purchased_listing_allowance",
    "additional_listing_allowance",
    "extra_listing_allowance",
    "purchased_extra_listings",
  ]) {
    const asLiteral = new RegExp(`'${guess}'`)
    const asColumn = new RegExp(`\\.${guess}\\b`)
    if (asLiteral.test(allowanceSql) || asColumn.test(allowanceSql)) {
      hasFailure = true
      console.error(
        `G-LISTING-ALLOWANCE: ${allowanceMigration} guesses at the allowance column name (${guess}).`,
      )
    }
  }

  // …and the catalogue lookup that made guessing possible.
  const readerStart = allowanceSql.indexOf(
    "create or replace function private.host_purchased_listing_allowance",
  )
  if (readerStart >= 0) {
    const reader = allowanceSql.slice(readerStart, readerStart + 1200)
    for (const machinery of ["pg_attribute", "attname", "execute format"]) {
      if (reader.includes(machinery)) {
        hasFailure = true
        console.error(
          `G-LISTING-ALLOWANCE: ${allowanceMigration} discovers the allowance column at run time (${machinery}).`,
        )
      }
    }
  }

  // 054 revoked UPDATE on host_profiles and 080 revoked table-wide SELECT. A
  // host who could write this column would grant themselves listings; one who
  // could read it would read every other host's add-on spend, because
  // host_profiles_select_public (013) is `to anon, authenticated`.
  for (const [file, sql] of [
    [allowanceMigration, allowanceSql],
    [addOnMigration, addOnSql],
  ]) {
    if (
      /grant\s+(select|update)\s*\([^)]*purchased_listing_slots[^)]*\)\s+on\s+(table\s+)?public\.host_profiles/.test(
        sql,
      )
    ) {
      hasFailure = true
      console.error(
        `G-LISTING-ALLOWANCE: ${file} grants a client role access to purchased_listing_slots.`,
      )
    }
  }
}

// The founding-host program (087) is the only surface in the product that
// publishes a SCARCITY CLAIM, and a scarcity claim is the easiest thing in a
// codebase to make dishonest by accident. `pnpm guardrails` runs without a
// database while the connected proof (sql/assert_founding_host_program.sql) runs
// only in db-security.yml, so the four properties that make the claim true are
// pinned here as well:
//
//   * NO SEEDED ROW. Absence is the dark state the product ships in; a row
//     inserted by the migration would put a capacity and a deadline on the
//     public page that no founder ever chose.
//   * anon and authenticated may read the four offer columns and MUST NOT hold
//     a table-wide SELECT — the count is public, the row's operational columns
//     are not.
//   * neither client role may execute the claim function. A visitor who could
//     call it could exhaust the program without paying for a single seat.
//   * the claim must gate on all three terms (open, in date, below capacity) and
//     be idempotent per identity, because Stripe delivers at least once.
//
// Comments are stripped first: this migration's header explains each rule in
// prose, and a scan of the raw text would be satisfied by the documentation
// rather than by the SQL.
const foundingMigration = migrationFiles.find((f) => /^087_.*\.sql$/.test(f))
if (!foundingMigration) {
  hasFailure = true
  console.error("G-FOUNDING-HOST: expected migration 087 to be present.")
} else {
  const sql = stripSqlComments(fileContents.get(foundingMigration))
    .toLowerCase()
    .replace(/\s+/g, " ")

  const required = [
    "create table if not exists public.founding_host_program",
    "check (id = 1)",
    "check (claimed <= capacity)",
    "check (status in ('draft', 'open', 'full', 'ended'))",
    "revoke all on table public.founding_host_program from anon, authenticated;",
    "grant select (capacity, claimed, enrollment_deadline, status) on public.founding_host_program to anon, authenticated;",
    "alter table public.founding_host_program enable row level security;",
    "create table if not exists public.founding_host_claims",
    "create unique index if not exists uq_founding_host_claims_clerk_user on public.founding_host_claims (clerk_user_id);",
    "revoke all on table public.founding_host_claims from anon, authenticated;",
    "revoke all on table public.founding_host_claim_discrepancies from anon, authenticated;",
    "create or replace function public.claim_founding_host_seat( p_clerk_user_id text ) returns jsonb",
    "security definer",
    "set search_path = ''",
    "perform pg_advisory_xact_lock(hashtextextended('founding_host_seat', 0));",
    "for update",
    "'reason', 'not_configured'",
    "'already_claimed', true",
    "if v_row.status <> 'open' then",
    "if v_row.enrollment_deadline is null or now() >= v_row.enrollment_deadline then",
    "if v_row.claimed >= v_row.capacity then",
    "'reason', 'full'",
    "set claimed = claimed + 1, status = case when claimed + 1 >= capacity then 'full' else status end",
    "revoke execute on function public.claim_founding_host_seat(text) from public, anon, authenticated;",
    "grant execute on function public.claim_founding_host_seat(text) to service_role;",
    "revoke execute on function public.record_founding_claim_discrepancy(text, text, text) from public, anon, authenticated;",
    "grant execute on function public.record_founding_claim_discrepancy(text, text, text) to service_role;",
  ]
  for (const needle of required) {
    if (!sql.includes(needle)) {
      hasFailure = true
      console.error(`G-FOUNDING-HOST: ${foundingMigration} is missing ${needle}`)
    }
  }

  // A seeded row would publish numbers nobody chose. The dark state is the
  // shipped state, and it is the absence of a row that produces it.
  if (/insert\s+into\s+public\.founding_host_program/.test(sql)) {
    hasFailure = true
    console.error(
      `G-FOUNDING-HOST: ${foundingMigration} seeds a program row — the unconfigured state must ship dark.`,
    )
  }

  // A table-wide grant would hand anon the row's operational columns as well as
  // the offer, and a column revoke afterwards would be a silent no-op.
  if (
    /grant\s+select\s+on\s+(?:table\s+)?public\.founding_host_program/.test(sql) ||
    /grant\s+all\s+on\s+(?:table\s+)?public\.founding_host_program/.test(sql)
  ) {
    hasFailure = true
    console.error(
      `G-FOUNDING-HOST: ${foundingMigration} grants a client role table-wide access to the program row.`,
    )
  }

  // The claim function must stay unreachable from PostgREST, and the ledger must
  // stay unreadable: a claim count a visitor can enumerate per identity is a
  // list of who is paying what.
  for (const [pattern, message] of [
    [
      /grant\s+execute\s+on\s+function\s+public\.claim_founding_host_seat\s*\([^)]*\)\s+to\s+[^;]*\b(?:anon|authenticated|public)\b/,
      "grants EXECUTE on the claim function to a client role",
    ],
    [
      /grant\s+(?:select|all)\s*(?:\([^)]*\))?\s+on\s+(?:table\s+)?public\.founding_host_claims/,
      "grants a client role access to the claim ledger",
    ],
    [
      /create\s+policy[^;]*on\s+public\.founding_host_claims/,
      "opens a policy on the claim ledger",
    ],
  ]) {
    if (pattern.test(sql)) {
      hasFailure = true
      console.error(`G-FOUNDING-HOST: ${foundingMigration} ${message}.`)
    }
  }
}

if (hasFailure) {
  process.exit(1)
}

console.log(`db-assert: checked ${migrationFiles.length} migration file(s)`)
