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
    "housing_photo_migration_paused_listings=%",
    "set status = 'paused'",
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

if (hasFailure) {
  process.exit(1)
}

console.log(`db-assert: checked ${migrationFiles.length} migration file(s)`)
