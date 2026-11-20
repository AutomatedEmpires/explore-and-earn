// Retention for automatic safety checks (SP8 spec 8.3): 12 months, except a check an operator
// still has to decide on. Once its review item is resolved the next sweep removes it.
//
// A check about a person or organization under a legal hold of any scope is kept too (lead
// decision 2026-11-18): checks are the safety record an investigation reads. "About" means the
// check's subject, or the subject of a review item on the check, is them or something they own:
// a file, a listing revision, a message, a bulk message, an invite, an interview or an offer.
// The module that owns each of those says who owns it (#216), so this rule never reads their
// tables.
//
// Review items, with their notes and decisions, go 12 months after final resolution (SP8 spec
// 8.2; review pass 3 of #147, item 5). "Final" is the last resolution about the same subject,
// and of an appeal against the decision: while one of those is open or younger than 12 months,
// the earlier ones stay, which is the date the deletion record gives (privacy.ts). The same
// holds keep an item: its subject, or its check's subject, is the held person or organization
// or something they own, which for an item can also be a listing or a thread.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { RetentionRule } from '@/modules/privacy';

const KEEP_MONTHS = 12;

/** The same instant `months` calendar months earlier (UTC). */
function monthsBefore(now: Date, months: number): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  return cutoff;
}

type ForeignRef = { table_name: string; column_name: string };

/**
 * Other modules' columns with a foreign key to a check or to a review item (a verification
 * keeps the check and the item that decided it). A row such a column still points at is kept:
 * deleting it would fail the whole batch, and the owning module decides when its own row goes.
 * Read from the catalog, so a foreign key added later is honored without a change here. `own`
 * are this module's tables, which each rule handles itself.
 */
async function foreignRefs(
  db: DbOrTx,
  target: 'trust_checks' | 'review_items',
  own: readonly string[],
): Promise<ForeignRef[]> {
  return queryRows<ForeignRef>(
    db,
    sql`
      select cl.relname as table_name, a.attname as column_name
      from pg_constraint c
      join pg_class cl on cl.oid = c.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = ${`app.${target}`}::regclass
        and n.nspname = 'app'
        and cardinality(c.conkey) = 1
        and cl.relname not in (${list(own)})
    `,
  );
}

/** `and not exists (...)` for each foreign reference to the row whose id is `id`. */
function unreferencedBy(refs: readonly ForeignRef[], id: SQL): SQL {
  return sql.join(
    refs.map(
      (ref) => sql`and not exists (
        select 1 from ${sql.identifier('app')}.${sql.identifier(ref.table_name)} f
        where f.${sql.identifier(ref.column_name)} = ${id}
      )`,
    ),
    sql` `,
  );
}

type Privacy = typeof import('@/modules/privacy');
type Held = Awaited<ReturnType<Privacy['heldSubjects']>>;

/**
 * Subject types whose id is the person's own user id, and those whose id is the org's own id.
 * `billing_account` is the subject of billing's review items; no check has it.
 */
const PERSON_SUBJECTS = ['user', 'seeker_profile'];
const ORG_SUBJECTS = ['organization', 'host_page', 'business_verification', 'billing_account'];

const list = (values: readonly string[]) =>
  sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  );

/** The person and organization a check or review item (alias `a`) names directly. */
function namedBy(a: 'c' | 'r'): { users: SQL[]; orgs: SQL[] } {
  const row = sql.raw(a);
  return {
    users: [sql`case when ${row}.subject_type in (${list(PERSON_SUBJECTS)}) then ${row}.subject_id end`],
    orgs: [sql`case when ${row}.subject_type in (${list(ORG_SUBJECTS)}) then ${row}.subject_id end`],
  };
}

/**
 * True for a check (alias `c`) that names a held person or organization itself, or whose
 * review item does. Read in the same statement as the candidates.
 */
function namesHeld(underLegalHold: Privacy['underLegalHold']): SQL {
  return sql`(
    ${underLegalHold({ ...namedBy('c'), scope: 'any' })}
    or exists (
      select 1 from app.review_items r
      where r.check_id = c.id and ${underLegalHold({ ...namedBy('r'), scope: 'any' })}
    )
  )`;
}

type Candidate = { id: string; subject_type: string; subject_id: string; at: string };

/** A review item due to go, with the subject of the check it was opened on, if any. */
type ItemCandidate = Candidate & {
  check_subject_type: string | null;
  check_subject_id: string | null;
};

/** The organization a subject belongs to and the people on it, as its module says. */
type Owners = { orgId: string | null; userIds: readonly string[] };
type OwnerLookup = (db: DbOrTx, ids: string[]) => Promise<ReadonlyMap<string, Owners>>;

/**
 * The subject types another module owns, and how to ask it who owns a batch of them. Each
 * module is loaded on first use: its barrel loads this module's barrel.
 */
const OWNER_LOOKUPS = new Map<string, OwnerLookup>([
  [
    'media',
    async (db, ids) => {
      const { getMediaMeta } = await import('@/modules/media');
      const files = await getMediaMeta(db, ids);
      return new Map(
        [...files].map(([id, file]): [string, Owners] => [
          id,
          { orgId: file.ownerOrgId, userIds: [file.ownerUserId] },
        ]),
      );
    },
  ],
  [
    'listing_revision',
    async (db, ids) => (await import('@/modules/listings')).listingRevisionOwners(db, ids),
  ],
  [
    'message',
    async (db, ids) =>
      (await import('@/modules/messaging')).messagingItemOwners(db, 'message', ids),
  ],
  [
    'bulk_message',
    async (db, ids) =>
      (await import('@/modules/messaging')).messagingItemOwners(db, 'bulk_message', ids),
  ],
  [
    'invite',
    async (db, ids) => (await import('@/modules/hiring')).hiringItemOwners(db, 'invite', ids),
  ],
  [
    'interview',
    async (db, ids) => (await import('@/modules/hiring')).hiringItemOwners(db, 'interview', ids),
  ],
  [
    'offer',
    async (db, ids) => (await import('@/modules/hiring')).hiringItemOwners(db, 'offer', ids),
  ],
]);

/**
 * The same for a review item, which can also be about a listing or a thread (a report). A
 * listing names its organization and no person.
 */
const ITEM_OWNER_LOOKUPS = new Map<string, OwnerLookup>([
  ...OWNER_LOOKUPS,
  [
    'listing',
    async (db, ids) => {
      const { getListingSummaries } = await import('@/modules/listings');
      const listings = await getListingSummaries(db, ids);
      return new Map(
        [...listings].map(([id, listing]): [string, Owners] => [
          id,
          { orgId: listing.orgId, userIds: [] },
        ]),
      );
    },
  ],
  [
    'thread',
    async (db, ids) => (await import('@/modules/messaging')).messagingItemOwners(db, 'thread', ids),
  ],
]);

/** One subject a row (a check or a review item, named by `key`) is about. */
type About = { key: string; type: string; id: string };

/**
 * The keys of the rows about something a held person or organization owns, as the owning
 * module names its owners: one read per subject type present.
 */
async function ownedByHeldSubject(
  db: DbOrTx,
  about: readonly About[],
  held: Held,
  lookups: ReadonlyMap<string, OwnerLookup>,
): Promise<Set<string>> {
  const kept = new Set<string>();
  for (const [type, lookup] of lookups) {
    const ofType = about.filter((subject) => subject.type === type);
    if (ofType.length === 0) continue;
    const owners = await lookup(db, [...new Set(ofType.map((subject) => subject.id))]);
    for (const subject of ofType) {
      const owner = owners.get(subject.id);
      if (owner && ownedByHeld(owner, held)) kept.add(subject.key);
    }
  }
  return kept;
}

/**
 * The candidates about something a held person or organization owns: the check's subject, or
 * the subject of a review item on it, is a type another module owns, and that module names a
 * held person or organization as its owner. One read for the review items and one per subject
 * type in the page; nothing is read when no hold is open.
 */
async function heldThroughOwner(db: DbOrTx, page: Candidate[], held: Held): Promise<Set<string>> {
  if (held.users.size + held.orgs.size === 0 || page.length === 0) return new Set();
  const about: About[] = page
    .filter((row) => OWNER_LOOKUPS.has(row.subject_type))
    .map((row) => ({ key: row.id, type: row.subject_type, id: row.subject_id }));
  const items = await queryRows<{ check_id: string; subject_type: string; subject_id: string }>(
    db,
    sql`
      select r.check_id::text as check_id, r.subject_type, r.subject_id
      from app.review_items r
      where r.check_id in (${sql.join(
        page.map((row) => sql`${row.id}::uuid`),
        sql`, `,
      )})
        and r.subject_type in (${list([...OWNER_LOOKUPS.keys()])})
    `,
  );
  for (const item of items) {
    about.push({ key: item.check_id, type: item.subject_type, id: item.subject_id });
  }
  return ownedByHeldSubject(db, about, held, OWNER_LOOKUPS);
}

/**
 * The due review items about something a held person or organization owns: the item's own
 * subject, or the subject of the check it was opened on. Nothing is read when no hold is open.
 */
async function itemsHeldThroughOwner(
  db: DbOrTx,
  page: readonly ItemCandidate[],
  held: Held,
): Promise<Set<string>> {
  if (held.users.size + held.orgs.size === 0 || page.length === 0) return new Set();
  const about: About[] = [];
  for (const row of page) {
    about.push({ key: row.id, type: row.subject_type, id: row.subject_id });
    if (row.check_subject_type !== null && row.check_subject_id !== null) {
      about.push({ key: row.id, type: row.check_subject_type, id: row.check_subject_id });
    }
  }
  return ownedByHeldSubject(db, about, held, ITEM_OWNER_LOOKUPS);
}

function ownedByHeld(owner: Owners, held: Held): boolean {
  return (
    (owner.orgId !== null && held.orgs.has(owner.orgId)) ||
    owner.userIds.some((userId) => held.users.has(userId))
  );
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'trust.checks_12m',
    description: 'Records of automatic safety checks are deleted after 12 months.',
    async run(db, now, limit) {
      if (limit <= 0) return { deleted: 0 };
      const cutoff = monthsBefore(now, KEEP_MONTHS).toISOString();
      const refs = await foreignRefs(db, 'trust_checks', ['review_items']);
      // Loaded on first use: the privacy barrel loads this module's barrel.
      const { heldSubjects, underLegalHold } = await import('@/modules/privacy');
      const held = await heldSubjects(db, 'any');
      const unreferenced = unreferencedBy(refs, sql`c.id`);

      return db.transaction(async (tx) => {
        // Pages through the candidates oldest first until `limit` may go, so held checks at the
        // front never stop the ones behind them. With no hold open, one page is enough.
        const due: string[] = [];
        let after: { at: string; id: string } | null = null;
        for (;;) {
          const page: Candidate[] = await queryRows<Candidate>(
            tx,
            sql`
              select c.id, c.subject_type, c.subject_id, c.created_at::text as at
              from app.trust_checks c
              where c.created_at < ${cutoff}::timestamptz
                and not exists (
                  select 1 from app.review_items r
                  where r.check_id = c.id and r.status <> 'resolved'
                )
                ${unreferenced}
                and not ${namesHeld(underLegalHold)}
                ${after ? sql`and (c.created_at, c.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
              order by c.created_at, c.id
              limit ${limit}
              for update of c skip locked
            `,
          );
          const kept = await heldThroughOwner(tx, page, held);
          for (const row of page) {
            if (due.length < limit && !kept.has(row.id)) due.push(row.id);
          }
          const last = page.at(-1);
          if (due.length >= limit || page.length < limit || !last) break;
          after = { at: last.at, id: last.id };
        }
        if (due.length === 0) return { deleted: 0 };
        const ids = sql.join(
          due.map((id) => sql`${id}::uuid`),
          sql`, `,
        );
        // A resolved item keeps its own reason and confidence; only the link to the check goes.
        await tx.execute(sql`
          update app.review_items set check_id = null
          where check_id in (${ids}) and status = 'resolved'
        `);
        const deleted = await queryRows(
          tx,
          sql`delete from app.trust_checks where id in (${ids}) returning id`,
        );
        return { deleted: deleted.length };
      });
    },
  },
  {
    key: 'trust.review_items_12m',
    description:
      'Review items, with their notes and decisions, are deleted 12 months after their final resolution.',
    async run(db, now, limit) {
      if (limit <= 0) return { deleted: 0 };
      const cutoff = monthsBefore(now, KEEP_MONTHS).toISOString();
      const refs = await foreignRefs(db, 'review_items', [
        'review_items',
        'review_notes',
        'review_actions',
      ]);
      // Loaded on first use: the privacy barrel loads this module's barrel.
      const { heldSubjects, underLegalHold } = await import('@/modules/privacy');
      const held = await heldSubjects(db, 'any');

      return db.transaction(async (tx) => {
        // Pages through the candidates, oldest resolution first, until `limit` may go, so held
        // items at the front never stop the ones behind them. `limit` counts items; an item's
        // notes and decisions go with it.
        const due: string[] = [];
        let after: { at: string; id: string } | null = null;
        for (;;) {
          const page: ItemCandidate[] = await queryRows<ItemCandidate>(
            tx,
            sql`
              select r.id, r.subject_type, r.subject_id, r.resolved_at::text as at,
                c.subject_type as check_subject_type, c.subject_id as check_subject_id
              from app.review_items r
              left join app.trust_checks c on c.id = r.check_id
              where r.status = 'resolved'
                and r.resolved_at < ${cutoff}::timestamptz
                and not exists (
                  select 1 from app.review_items o
                  where o.id <> r.id
                    and (
                      (o.subject_type = r.subject_type and o.subject_id = r.subject_id)
                      or o.original_item_id = r.id
                      or o.id = r.original_item_id
                    )
                    and (o.status <> 'resolved' or o.resolved_at >= ${cutoff}::timestamptz)
                )
                ${unreferencedBy(refs, sql`r.id`)}
                and not ${underLegalHold({ ...namedBy('r'), scope: 'any' })}
                and not (
                  c.id is not null and ${underLegalHold({ ...namedBy('c'), scope: 'any' })}
                )
                ${after ? sql`and (r.resolved_at, r.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
              order by r.resolved_at, r.id
              limit ${limit}
              for update of r skip locked
            `,
          );
          const kept = await itemsHeldThroughOwner(tx, page, held);
          for (const row of page) {
            if (due.length < limit && !kept.has(row.id)) due.push(row.id);
          }
          const last = page.at(-1);
          if (due.length >= limit || page.length < limit || !last) break;
          after = { at: last.at, id: last.id };
        }
        if (due.length === 0) return { deleted: 0 };
        const ids = sql.join(
          due.map((id) => sql`${id}::uuid`),
          sql`, `,
        );
        await tx.execute(sql`delete from app.review_notes where item_id in (${ids})`);
        await tx.execute(sql`delete from app.review_actions where item_id in (${ids})`);
        // An item that stays (beyond this batch, or held) keeps its own record; only its link
        // to a deleted original goes.
        await tx.execute(sql`
          update app.review_items set original_item_id = null
          where original_item_id in (${ids}) and id not in (${ids})
        `);
        const deleted = await queryRows(
          tx,
          sql`delete from app.review_items where id in (${ids}) returning id`,
        );
        return { deleted: deleted.length };
      });
    },
  },
];
