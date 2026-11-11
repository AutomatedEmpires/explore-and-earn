// The only e2e path that writes through the live SP2 modules (SP3 plan Task 27).
// Task 45 reuses these helpers with `{ drain: false }`.
import { sql } from 'drizzle-orm';
import { queryRows, type Db } from '@/lib/db';
import { isAppError } from '@/lib/errors';
// Identity before the other modules. Onboarding reads organizationNameSchema while the orgs
// barrel is still starting; loading identity first lets that export finish.
import '@/modules/identity';
import {
  billingGateway,
  ensureStripeCustomer,
  getSubscriptionState,
  lookupKey,
  syncSubscription,
  type BillingGateway,
  type FakeBillingGateway,
} from '@/modules/billing';
import { saveHostPage } from '@/modules/hostpages';
import { runWorker } from '@/modules/jobs';
import {
  BUILDER_SECTIONS,
  HOUSING_SLOTS,
  MEAL_SLOTS,
  SECTION_CONTENT_KEYS,
  ackKey,
  closeListing,
  createListing,
  deleteListing,
  getListingForEditor,
  getListingSummaries,
  patchDraft,
  requestPublish,
  type BuilderSection,
  type HousingSlot,
  type Issue,
  type ListingContent,
  type MealSlot,
} from '@/modules/listings';
import { createLocation } from '@/modules/locations';
import type { CurrentUser, OrgRole } from '@/modules/identity';
import { slugify } from '@/modules/orgs';
import { decide, openReviewItem } from '@/modules/trust';
import { buildListingContent, seedHostOrg, seedMedia } from '../../helpers/sp2';
import type { HostContext } from '@/server/guards';

export type WriteOpts = { drain?: boolean };

export type SeedHost = {
  orgId: string;
  slug: string;
  ctx: HostContext;
  locationId: string;
};

export type HostSeed = {
  name: string;
  city: string;
  state: string;
  point: { lat: number; lng: number };
  publicPrecision: 'city' | 'exact';
  timezone: string;
};

const DRAIN_DEADLINE_MS = 120_000;

const PLACEHOLDER_HOUSING: Record<HousingSlot, string> = {
  bedroom: '00000000-0000-4000-8000-000000000001',
  bathroom: '00000000-0000-4000-8000-000000000002',
  kitchen: '00000000-0000-4000-8000-000000000003',
  exterior: '00000000-0000-4000-8000-000000000004',
};

const PLACEHOLDER_MEALS: Record<MealSlot, string> = {
  kitchen: '00000000-0000-4000-8000-000000000011',
  meal_example: '00000000-0000-4000-8000-000000000012',
  dining_area: '00000000-0000-4000-8000-000000000013',
  other: '00000000-0000-4000-8000-000000000014',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type QueryClient = {
  unsafe: (
    query: string,
    params?: unknown[] | Record<string, unknown>,
    opts?: Record<string, unknown>,
  ) => Promise<unknown> & { values?: () => Promise<unknown>; raw?: () => Promise<unknown> };
  begin?: (...args: unknown[]) => Promise<unknown>;
};

const serializedClients = new WeakSet<object>();

/**
 * PGlite's wire server shares one unnamed prepared statement across connections. Overlapping
 * parameterized queries then fail, so this client runs them one at a time.
 */
function serializeQueries(db: Db): void {
  // Drizzle's public Db type hides the driver client. The `in` check is how db.ts reads it.
  if (!('$client' in db)) return;
  const client: unknown = db.$client;
  // postgres.js clients are callable functions with an `unsafe` method.
  if ((typeof client !== 'object' && typeof client !== 'function') || client === null) return;
  if (!('unsafe' in client) || typeof client.unsafe !== 'function') return;
  patchQueryClient(client as QueryClient);
}

function patchQueryClient(client: QueryClient): void {
  if (serializedClients.has(client)) return;
  serializedClients.add(client);
  const original = client.unsafe.bind(client);
  let tail: Promise<void> = Promise.resolve();
  client.unsafe = (query, params, opts) => {
    const prev = tail;
    let mode: 'rows' | 'values' | 'raw' = 'rows';
    const started = prev.then(() => {
      const pending = original(query, params, opts);
      if (mode === 'values' && pending.values) return pending.values();
      if (mode === 'raw' && pending.raw) return pending.raw();
      return pending;
    });
    tail = started.then(
      () => undefined,
      () => undefined,
    );
    return Object.assign(started, {
      values: () => {
        mode = 'values';
        return started;
      },
      raw: () => {
        mode = 'raw';
        return started;
      },
    });
  };
  if (typeof client.begin !== 'function') return;
  const originalBegin = client.begin.bind(client);
  client.begin = (...args) => {
    const last = args.at(-1);
    if (typeof last !== 'function') return originalBegin(...args);
    const wrapped = (tx: QueryClient) => {
      patchQueryClient(tx);
      return (last as (inner: QueryClient) => unknown)(tx);
    };
    return originalBegin(...args.slice(0, -1), wrapped);
  };
}

function redact(text: string): string {
  return text
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[database]')
    .replace(/sk_(?:test|live)_\S+/g, '[key]');
}

function accountTypeOf(value: string | null): CurrentUser['accountType'] {
  if (value === 'seeker' || value === 'host' || value === 'operator' || value === null) return value;
  throw new Error('e2e seed: the host owner has an unknown account type');
}

function hostRole(value: string): OrgRole {
  if (value === 'owner' || value === 'admin' || value === 'recruiter' || value === 'billing') {
    return value;
  }
  throw new Error('e2e seed: the host owner membership is not a host role');
}

/** Listing URL slug, matching discovery's projection for ASCII titles. */
export function slugFromTitle(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'job';
}

/**
 * Verification reads the process billing gateway, not a gateway we build and then discard.
 * The card has to be set on that shared stub.
 */
function isStubGateway(gw: BillingGateway): gw is FakeBillingGateway {
  const candidate = gw as FakeBillingGateway;
  return (
    typeof candidate.setSubscription === 'function' && typeof candidate.setCardChecks === 'function'
  );
}

function stubGateway(): FakeBillingGateway {
  const gw = billingGateway();
  if (isStubGateway(gw)) return gw;
  throw new Error('e2e seed: BILLING_PROVIDER must be stub so verification can see a card');
}

function drains(opts?: WriteOpts): boolean {
  return opts?.drain !== false;
}

type OutboxRow = {
  status: string;
  topic: string;
  last_error: string | null;
  available_ms: number | string;
  n: number | string;
};

/** Runs the worker until nothing is pending, processing, or dead. */
export async function drainUntilEmpty(db: Db): Promise<void> {
  serializeQueries(db);
  const deadline = Date.now() + DRAIN_DEADLINE_MS;
  for (;;) {
    const rows = await queryRows<OutboxRow>(
      db,
      sql`
        select status, topic, last_error,
          (extract(epoch from min(available_at)) * 1000)::float8 as available_ms,
          count(*)::int as n
        from app.outbox
        where status in ('pending', 'processing', 'dead')
        group by status, topic, last_error
      `,
    );
    const dead = rows.find((row) => row.status === 'dead');
    if (dead) {
      throw new Error(
        `e2e seed: outbox job died (${dead.topic}): ${redact(dead.last_error ?? 'no error recorded')}`,
      );
    }
    const open = rows.filter((row) => row.status === 'pending' || row.status === 'processing');
    if (open.length === 0) return;

    const now = Date.now();
    const soonest = open.reduce((min, row) => {
      const at = Number(row.available_ms);
      return Number.isFinite(at) ? Math.min(min, at) : min;
    }, Number.POSITIVE_INFINITY);
    if (soonest > now) {
      if (soonest > deadline) {
        throw new Error(
          `e2e seed: outbox still waiting (${open[0]?.topic ?? 'unknown'}) past the drain deadline`,
        );
      }
      await sleep(Math.min(soonest - now + 50, 5_000));
      continue;
    }

    const result = await runWorker(db);
    if (Date.now() > deadline) throw new Error('e2e seed: outbox did not drain before the deadline');
    if (result.processed === 0 && result.retried === 0 && result.dead === 0) await sleep(250);
  }
}

async function ownerContext(db: Db, orgId: string): Promise<HostContext> {
  const [row] = await queryRows<{
    user_id: string;
    clerk_user_id: string;
    email: string | null;
    account_type: string | null;
    role: string;
  }>(
    db,
    sql`
      select u.id as user_id, u.clerk_user_id, u.email, u.account_type, m.role
      from app.org_memberships m
      join app.users u on u.id = m.user_id
      where m.org_id = ${orgId}::uuid and m.role = 'owner'
      limit 1
    `,
  );
  if (!row) throw new Error('e2e seed: host organization has no owner');
  return {
    orgId,
    role: hostRole(row.role),
    user: {
      id: row.user_id,
      clerkUserId: row.clerk_user_id,
      accountType: accountTypeOf(row.account_type),
      email: row.email,
    },
  };
}

/** A card plus an active Professional plan. A second current subscription would grant nothing. */
async function entitle(db: Db, orgId: string): Promise<void> {
  const gw = stubGateway();
  const customerId = await ensureStripeCustomer(db, orgId, gw);
  gw.setCardChecks(customerId, { hasCard: true, cvcCheck: 'pass', postalCheck: 'pass' });
  if ((await getSubscriptionState(db, orgId)).canPublish) return;

  const now = new Date();
  const id = `sub_e2e_${orgId.replaceAll('-', '')}`;
  gw.setSubscription({
    id,
    customerId,
    status: 'active',
    items: [{ lookupKey: lookupKey('tier', 'professional', 'month'), quantity: 1 }],
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
    trialEnd: null,
    cancelAtPeriodEnd: false,
    endedAt: null,
    startDate: now,
    activatedAt: now,
    couponId: null,
    initialCouponId: null,
    metadata: { orgId },
    created: now,
  });
  await syncSubscription(db, id, gw);
  if (!(await getSubscriptionState(db, orgId)).canPublish) {
    throw new Error('e2e seed: the host cannot publish after the subscription sync');
  }
}

async function locationIdFor(db: Db, ctx: HostContext, i: HostSeed): Promise<string> {
  const [row] = await queryRows<{ id: string }>(
    db,
    sql`
      select id from app.locations
      where org_id = ${ctx.orgId}::uuid and archived_at is null
        and city = ${i.city} and state = ${i.state}
      limit 1
    `,
  );
  if (row) return row.id;
  const created = await createLocation(db, ctx, {
    name: `${i.city} site`,
    kind: 'business_site',
    address: { city: i.city, state: i.state },
    point: i.point,
    publicPrecision: i.publicPrecision,
    timezone: i.timezone,
  });
  return created.id;
}

async function ensureHostPage(db: Db, ctx: HostContext): Promise<void> {
  const [row] = await queryRows<{ n: number | string }>(
    db,
    sql`
      select count(*)::int as n from app.host_pages
      where org_id = ${ctx.orgId}::uuid and first_public_at is not null
    `,
  );
  if (Number(row?.n ?? 0) > 0) return;
  const logoMediaId = await seedMedia(db, ctx.orgId, 'logo');
  await saveHostPage(db, ctx, {
    logoMediaId,
    coverMediaId: null,
    about: { story: 'A small crew hiring for the season.', perks: [], social: [] },
    photos: [],
    team: [],
    teamConsent: false,
    faq: [],
  });
}

/**
 * An entitled host with a location and a public page. Reuses an organization that already
 * has this name or slug. Drains before returning so a following publish sees a public host.
 */
export async function seedHost(db: Db, i: HostSeed, opts?: WriteOpts): Promise<SeedHost> {
  serializeQueries(db);
  const wanted = slugify(i.name);
  const [existing] = await queryRows<{ id: string; slug: string }>(
    db,
    sql`
      select id, slug from app.organizations
      where deleted_at is null and (slug = ${wanted} or name = ${i.name})
      order by case when slug = ${wanted} then 0 else 1 end
      limit 1
    `,
  );
  let orgId: string;
  let slug: string;
  let ctx: HostContext;
  if (existing) {
    orgId = existing.id;
    slug = existing.slug;
    ctx = await ownerContext(db, orgId);
  } else {
    const seeded = await seedHostOrg(db, { name: i.name });
    orgId = seeded.orgId;
    ctx = seeded.owner.ctx;
    const [row] = await queryRows<{ slug: string }>(
      db,
      sql`select slug from app.organizations where id = ${orgId}::uuid`,
    );
    if (!row) throw new Error('e2e seed: the host organization was not created');
    slug = row.slug;
  }

  await entitle(db, orgId);
  const locationId = await locationIdFor(db, ctx, i);
  await ensureHostPage(db, ctx);
  if (drains(opts)) await drainUntilEmpty(db);
  return { orgId, slug, ctx, locationId };
}

export async function findListingByTitle(
  db: Db,
  orgId: string,
  title: string,
): Promise<{ id: string; state: string; locationId: string | null } | null> {
  serializeQueries(db);
  const [row] = await queryRows<{ id: string; state: string; location_id: string | null }>(
    db,
    sql`
      select id, state, location_id from app.listings
      where org_id = ${orgId}::uuid and title = ${title}
      order by case state
        when 'active' then 0
        when 'closed' then 1
        when 'in_review' then 2
        when 'draft' then 3
        else 4
      end, created_at desc
      limit 1
    `,
  );
  if (!row) return null;
  return { id: row.id, state: row.state, locationId: row.location_id };
}

/** The id, public slug, and location the discovery fixtures record. */
export async function listingFixture(
  db: Db,
  id: string,
  title: string,
): Promise<{ id: string; slug: string; locationId: string }> {
  serializeQueries(db);
  const [listing] = await queryRows<{ location_id: string | null }>(
    db,
    sql`select location_id from app.listings where id = ${id}::uuid`,
  );
  const [projected] = await queryRows<{ slug: string }>(
    db,
    sql`select slug from app.discovery_listings where listing_id = ${id}::uuid`,
  );
  if (!listing?.location_id) throw new Error(`e2e seed: ${title} has no location`);
  return { id, slug: projected?.slug ?? slugFromTitle(title), locationId: listing.location_id };
}

export async function discardDraft(db: Db, host: SeedHost, id: string): Promise<void> {
  serializeQueries(db);
  await deleteListing(db, host.ctx, id);
}

function warningKeys(details: unknown): string[] {
  if (typeof details !== 'object' || details === null || !('issues' in details)) return [];
  const issues = details.issues;
  if (!Array.isArray(issues)) return [];
  const keys: string[] = [];
  for (const issue of issues) {
    if (typeof issue !== 'object' || issue === null) continue;
    const code = 'code' in issue ? issue.code : undefined;
    const field = 'field' in issue ? issue.field : undefined;
    if (typeof code !== 'string' || typeof field !== 'string') continue;
    keys.push(ackKey({ code: code as Issue['code'], field }));
  }
  return keys;
}

async function publishAcknowledged(db: Db, host: SeedHost, id: string): Promise<void> {
  try {
    await requestPublish(db, host.ctx, id, []);
  } catch (err) {
    if (!isAppError(err) || err.message !== 'Check these before you publish.') throw err;
    const keys = warningKeys(err.details);
    if (keys.length === 0) throw err;
    await requestPublish(db, host.ctx, id, keys);
  }
}

async function assertActive(db: Db, id: string): Promise<void> {
  const state = (await getListingSummaries(db, [id])).get(id)?.state ?? 'missing';
  if (state !== 'active') throw new Error(`e2e seed: listing did not become active (state ${state})`);
}

async function photoSet<T extends string>(
  db: Db,
  orgId: string,
  slots: readonly T[],
  kind: 'housing_photo' | 'meal_photo',
): Promise<Record<T, string>> {
  const ids = await Promise.all(slots.map(() => seedMedia(db, orgId, kind)));
  const photos = {} as Record<T, string>;
  for (const [index, slot] of slots.entries()) {
    const id = ids[index];
    if (!id) throw new Error(`e2e seed: a ${kind} was not created`);
    photos[slot] = id;
  }
  return photos;
}

/**
 * Publishes one listing through screening. Cover photos are `listing_photo` (the kind the
 * publish checks require). With `drain: false`, returns right after `requestPublish`.
 */
export async function publishListing(
  db: Db,
  host: SeedHost,
  edit?: (content: ListingContent) => void,
  opts?: WriteOpts,
): Promise<{ id: string; slug: string }> {
  serializeQueries(db);
  const probe = buildListingContent(
    {
      locationId: host.locationId,
      coverMediaId: '00000000-0000-4000-8000-000000000021',
      housingPhotos: PLACEHOLDER_HOUSING,
    },
    edit,
  );
  const coverMediaId = await seedMedia(db, host.orgId, 'listing_photo');
  const housingPhotos = probe.housing.provided
    ? await photoSet(db, host.orgId, HOUSING_SLOTS, 'housing_photo')
    : PLACEHOLDER_HOUSING;
  const mealPhotos = probe.meals.provided
    ? await photoSet(db, host.orgId, MEAL_SLOTS, 'meal_photo')
    : PLACEHOLDER_MEALS;

  const content = buildListingContent(
    { locationId: host.locationId, coverMediaId, housingPhotos },
    edit,
  );
  content.photos.coverMediaId = coverMediaId;
  if (content.housing.provided) content.housing.photos = housingPhotos;
  if (content.meals.provided) content.meals.photos = mealPhotos;

  const created = await createListing(db, host.ctx, { start: 'blank' });
  for (const section of BUILDER_SECTIONS) {
    const data = Object.fromEntries(
      SECTION_CONTENT_KEYS[section].map((key) => [key, content[key]]),
    );
    await patchDraft(db, host.ctx, created.id, { section, baseVersion: 0, data });
  }
  await publishAcknowledged(db, host, created.id);
  if (drains(opts)) {
    await drainUntilEmpty(db);
    await assertActive(db, created.id);
  }
  return { id: created.id, slug: (await listingFixture(db, created.id, content.basics.title)).slug };
}

export async function editListing(
  db: Db,
  host: SeedHost,
  id: string,
  section: BuilderSection,
  data: unknown,
  opts?: WriteOpts,
): Promise<void> {
  serializeQueries(db);
  const editor = await getListingForEditor(db, host.ctx, id);
  await patchDraft(db, host.ctx, id, {
    section,
    baseVersion: editor.sectionVersions[section] ?? 0,
    data,
  });
  await publishAcknowledged(db, host, id);
  if (drains(opts)) await drainUntilEmpty(db);
}

export async function closeListingAs(
  db: Db,
  host: SeedHost,
  id: string,
  opts?: WriteOpts,
): Promise<void> {
  serializeQueries(db);
  await closeListing(db, host.ctx, id);
  if (drains(opts)) await drainUntilEmpty(db);
}

export async function removeListing(
  db: Db,
  id: string,
  operatorId: string,
  opts?: WriteOpts,
): Promise<void> {
  serializeQueries(db);
  const opened = await openReviewItem(db, {
    queue: 'moderation',
    subjectType: 'listing',
    subjectId: id,
    reason: 'e2e removal',
  });
  const result = await decide(db, opened.id, operatorId, 'remove', { note: 'e2e' });
  if (result.status !== 'applied') throw new Error('e2e seed: listing removal was not applied');
  if (drains(opts)) await drainUntilEmpty(db);
}
