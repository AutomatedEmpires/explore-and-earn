
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { pathToFileURL } from 'node:url';
const ROOT = "C:\\Users\\Cole0\\AutomatedEmpires\\Projects\\explore-and-earn\\.worktrees\\claude-208-ec62";
const at = (p) => pathToFileURL(path.join(ROOT, p)).href;
for (const name of ['.env.local', '.env.local.example']) {
  const file = path.join(ROOT, name);
  if (!existsSync(file)) continue;
  for (const [key, value] of Object.entries(parseEnv(readFileSync(file, 'utf8')))) {
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}
Object.assign(process.env, {"AI_PROVIDER":"stub","CHILD_SAFETY_PROVIDER":"stub","MALWARE_PROVIDER":"stub","BILLING_PROVIDER":"stub","GEOCODER_PROVIDER":"stub","WEATHER_PROVIDER":"stub","LINK_SAFETY_PROVIDER":"stub","EMAIL_PROVIDER":"stub","STORAGE_PROVIDER":"local"});
const dbHost = new URL(process.env.DATABASE_URL ?? 'postgres://invalid').hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(dbHost)) {
  throw new Error('h2b e2e: refusing to seed a database that is not on localhost');
}
const { resetEnvCache } = await import(at('src/lib/env.ts'));
resetEnvCache();
const { getDb, closeDb, queryRows } = await import(at('src/lib/db.ts'));
const { sql } = await import('drizzle-orm');
const writes = await import(at('tests/e2e/fixtures/sp2-writes.ts'));
const lodgeHousekeeper = function lodgeHousekeeper(c) {
  c.basics = {
    ...c.basics,
    title: 'Lodge housekeeper',
    occupationCode: 'housekeeper'
  };
  c.when = {
    dates: {
      mode: 'fixed',
      start: '2027-05-15',
      end: '2027-10-02'
    },
    weeklyHours: 40,
    minCommitment: 'Stay through Sep 15 at least'
  };
  c.pay = {
    kind: 'fixed',
    minCents: 2200,
    maxCents: 2200,
    unit: 'hour',
    crewShareEstimate: null,
    overtime: false,
    tips: true,
    bonuses: '$500 if you stay to Oct 2',
    frequency: 'biweekly',
    deductions: null
  };
  if (c.housing.provided) {
    c.housing = {
      ...c.housing,
      type: 'cabin',
      cost: {
        free: false,
        cents: 1200,
        period: 'day',
        paidBy: 'deducted'
      },
      note: 'Two staff per cabin',
      finePrint: {
        roommates: 1,
        pets: false,
        couples: true,
        wifi: true,
        utilitiesIncluded: true,
        notes: null
      }
    };
  }
  c.meals = {
    provided: true,
    perDay: 3,
    days: 'every_day',
    cost: {
      free: true
    },
    photos: {
      kitchen: '00000000-0000-4000-8000-000000000011',
      meal_example: '00000000-0000-4000-8000-000000000012',
      dining_area: '00000000-0000-4000-8000-000000000013',
      other: '00000000-0000-4000-8000-000000000014'
    },
    note: 'Staff dining hall, vegetarian every day',
    dietary: null
  };
  c.genreDetails = {
    category: 'seasonal',
    destinationSlug: null,
    staffPerks: ['Staff events and trips']
  };
  c.job = {
    ...c.job,
    description: 'Keep 14 guest cabins clean and ready, with a team of four. Restock linens, report repairs, and help the front desk on busy Saturdays.',
    responsibilities: [],
    typicalDay: 'Team list at 8 AM, cabins from 9 to 3, laundry and restock after.',
    requiredQualifications: ['One season of housekeeping or hotel work'],
    preferredQualifications: ['Laundry or guest service experience'],
    skills: [],
    certifications: [],
    physicalDemands: 'On your feet most of the day, lifting up to 25 lb',
    perks: ['park_pass', 'shuttle']
  };
};
const TERMS = {"transportation":"We repay your fare here and meals on the way once you finish half the season. We pay your trip home when you finish or if we end the job early.","tools":"Uniforms, cleaning supplies and carts, at no charge.","threeFourthsGuarantee":"We offer at least three-fourths of the job order hours in each 12-week period. If we offer fewer, we pay what you would have earned.","swaContact":"Kalispell Job Service · (406) 555-0187","jobOrderNumber":"MT 4419025"};
const db = getDb();

async function ensure(host, title, edit) {
  const existing = await writes.findListingByTitle(db, host.orgId, title);
  if (existing?.state === 'in_review') await writes.drainUntilEmpty(db);
  const again = existing ? await writes.findListingByTitle(db, host.orgId, title) : null;
  if (again?.state === 'active') return writes.listingFixture(db, again.id, title);
  if (again?.state === 'draft') await writes.discardDraft(db, host, again.id);
  const published = await writes.publishListing(db, host, edit);
  return writes.listingFixture(db, published.id, title);
}

const kettle = await writes.seedHost(db, {
  name: 'Kettle Ridge Lodge',
  city: 'Whitefish',
  state: 'MT',
  point: { lat: 48.4106, lng: -114.3528 },
  publicPrecision: 'city',
  timezone: 'America/Denver',
});
const terms = await ensure(kettle, 'Lodge housekeeper', (c) => {
  lodgeHousekeeper(c);
  c.job.visaSponsorship = 'h2b';
  c.job.h2b = TERMS;
});
const none = await ensure(kettle, 'Lodge laundry lead', (c) => {
  lodgeHousekeeper(c);
  c.basics.title = 'Lodge laundry lead';
  c.job.visaSponsorship = 'h2b';
  c.job.h2b = null;
});
await writes.drainUntilEmpty(db);
const rows = await queryRows(db, sql`
  select l.id, r.content from app.listings l
  join app.listing_revisions r on r.id = l.published_revision_id
  where l.id in (${terms.id}::uuid, ${none.id}::uuid)
`);
const photos = rows.map((r) => ({
  cover: r.content.photos.coverMediaId,
  housing: r.content.housing.provided ? Object.values(r.content.housing.photos) : [],
  meals: r.content.meals.provided ? Object.values(r.content.meals.photos) : [],
}));
console.log('H2B_SEED ' + JSON.stringify({ terms, none, photos }));
await Promise.race([closeDb(), new Promise((resolve) => setTimeout(resolve, 5000))]);
process.exit(0);
