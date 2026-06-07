#!/usr/bin/env node
// tools/data/seed-demo-data.mjs
//
// Idempotent, NON-PRODUCTION demo seed for Explore&Earn business tables.
//
// FOUNDER-OPERATED. This script WRITES to the database (auth users + profiles +
// listings + applications). It is intentionally gated so it cannot run by
// accident and refuses to run against an unconfirmed target. Lane D does NOT
// execute this against production; see docs/runbooks/data-readiness.md.
//
// Idempotency strategy:
//   - Auth users are looked up by email and only created when missing.
//   - Profiles/listings/applications use deterministic UUIDv5 ids and are
//     upserted, so re-running converges to the same dataset (no duplicates).
//
// Safety gates (ALL required):
//   - env SEED_ALLOW_NONPROD=true
//   - env SEED_TARGET_REF=<your supabase project ref> AND it must equal the ref
//     parsed from SUPABASE_URL (forces the operator to name the exact target)
//   - flag --confirm
//
// Usage (against a dev/staging project or branch):
//   SEED_ALLOW_NONPROD=true SEED_TARGET_REF=<ref> \
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     pnpm --filter @explore-and-earn/web exec node ../../tools/data/seed-demo-data.mjs --confirm
//
// Requires "@supabase/supabase-js" (a dependency of @explore-and-earn/web).

import process from "node:process";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Deterministic UUIDv5 (RFC 4122) so re-runs reuse the same primary keys.
// ---------------------------------------------------------------------------
const NAMESPACE = "6f2a1c7e-3b5d-4e9a-8c11-ee2a0d9b4f10"; // fixed E&E seed namespace

function uuidv5(name, namespace = NAMESPACE) {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1");
  hash.update(nsBytes);
  hash.update(Buffer.from(name, "utf8"));
  const bytes = hash.digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Safety gates
// ---------------------------------------------------------------------------
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(2);
  }
  return value;
}

function parseRef(url) {
  const m = /https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url);
  return m ? m[1] : null;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

if (process.env.SEED_ALLOW_NONPROD !== "true") {
  console.error(
    "Refusing to run: set SEED_ALLOW_NONPROD=true to acknowledge this is a non-prod seed.",
  );
  process.exit(3);
}
if (!process.argv.includes("--confirm")) {
  console.error("Refusing to run: pass --confirm to proceed.");
  process.exit(3);
}
const targetRef = requireEnv("SEED_TARGET_REF");
const urlRef = parseRef(supabaseUrl);
if (!urlRef || urlRef !== targetRef) {
  console.error(
    `Refusing to run: SEED_TARGET_REF (${targetRef}) does not match the ref in SUPABASE_URL (${urlRef ?? "unparseable"}).`,
  );
  process.exit(3);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------------------------------------------------------------------------
// Demo fixtures (small but FK/enum-correct per migrations 003/006/007)
// ---------------------------------------------------------------------------
const HOSTS = [
  {
    key: "greenfield-farm",
    email: "host.greenfield@seed.exploreandearn.test",
    company_name: "Greenfield Family Farm",
    slug: "greenfield-family-farm",
    category_scopes: ["farm"],
  },
  {
    key: "harbor-maritime",
    email: "host.harbor@seed.exploreandearn.test",
    company_name: "Harbor Point Maritime",
    slug: "harbor-point-maritime",
    category_scopes: ["maritime"],
  },
];

const SEEKERS = [
  {
    key: "avery",
    email: "seeker.avery@seed.exploreandearn.test",
    display_name: "Avery Stone",
    desired_categories: ["farm", "seasonal"],
  },
  {
    key: "blake",
    email: "seeker.blake@seed.exploreandearn.test",
    display_name: "Blake Rivera",
    desired_categories: ["maritime"],
  },
  {
    key: "casey",
    email: "seeker.casey@seed.exploreandearn.test",
    display_name: "Casey Lin",
    desired_categories: ["remote", "mix"],
  },
];

const LISTINGS = [
  {
    key: "farm-harvest",
    host: "greenfield-farm",
    title: "Summer Harvest Crew",
    category: "farm",
    status: "live",
    housing_included: true,
    meals_included: true,
  },
  {
    key: "farm-orchard",
    host: "greenfield-farm",
    title: "Orchard Care Assistant",
    category: "farm",
    status: "live",
    housing_included: true,
    meals_included: false,
  },
  {
    key: "sea-deckhand",
    host: "harbor-maritime",
    title: "Seasonal Deckhand",
    category: "maritime",
    status: "live",
    housing_included: true,
    meals_included: true,
  },
];

const APPLICATIONS = [
  { listing: "farm-harvest", seeker: "avery", status: "applied" },
  { listing: "sea-deckhand", seeker: "blake", status: "reviewing" },
];

async function getOrCreateUser(email) {
  // Page through users to find an existing match (admin API has no direct
  // get-by-email). Datasets here are tiny, so a couple of pages is plenty.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const found = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );
    if (found) return found.id;
    if (data.users.length < 200) break;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    password: `seed-${uuidv5(email)}`,
    user_metadata: { seeded: true, source: "tools/data/seed-demo-data.mjs" },
  });
  if (error) throw error;
  return data.user.id;
}

async function upsert(table, row, onConflict) {
  const { error } = await supabase.from(table).upsert(row, { onConflict });
  if (error) throw new Error(`${table} upsert failed: ${error.message}`);
}

async function main() {
  console.log(`Seeding demo data into ${supabaseUrl} (ref ${targetRef})...`);

  const hostIdByKey = {};
  for (const host of HOSTS) {
    const ownerUserId = await getOrCreateUser(host.email);
    const id = uuidv5(`host:${host.slug}`);
    hostIdByKey[host.key] = id;
    await upsert(
      "host_profiles",
      {
        id,
        owner_user_id: ownerUserId,
        company_name: host.company_name,
        slug: host.slug,
        category_scopes: host.category_scopes,
        public_status: "active",
      },
      "id",
    );
    console.log(`  host_profiles: ${host.slug}`);
  }

  const seekerIdByKey = {};
  for (const seeker of SEEKERS) {
    const userId = await getOrCreateUser(seeker.email);
    const id = uuidv5(`seeker:${seeker.key}`);
    seekerIdByKey[seeker.key] = id;
    await upsert(
      "seeker_profiles",
      {
        id,
        user_id: userId,
        display_name: seeker.display_name,
        desired_categories: seeker.desired_categories,
        visibility_status: "platform",
      },
      "id",
    );
    console.log(`  seeker_profiles: ${seeker.display_name}`);
  }

  const listingIdByKey = {};
  for (const listing of LISTINGS) {
    const id = uuidv5(`listing:${listing.key}`);
    listingIdByKey[listing.key] = id;
    await upsert(
      "listings",
      {
        id,
        host_profile_id: hostIdByKey[listing.host],
        title: listing.title,
        category: listing.category,
        status: listing.status,
        housing_included: listing.housing_included,
        meals_included: listing.meals_included,
        published_at:
          listing.status === "live" ? new Date().toISOString() : null,
      },
      "id",
    );
    console.log(`  listings: ${listing.title}`);
  }

  for (const app of APPLICATIONS) {
    const listingId = listingIdByKey[app.listing];
    const seekerId = seekerIdByKey[app.seeker];
    await upsert(
      "applications",
      {
        id: uuidv5(`application:${app.listing}:${app.seeker}`),
        listing_id: listingId,
        seeker_profile_id: seekerId,
        status: app.status,
      },
      "listing_id,seeker_profile_id",
    );
    console.log(
      `  applications: ${app.seeker} -> ${app.listing} (${app.status})`,
    );
  }

  console.log("Seed complete. Re-running is safe (idempotent).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
