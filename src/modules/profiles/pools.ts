// Candidate pools, staged cards, fit inputs and reveals (SP4 spec 3.2 and 8.3).
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type {
  CandidateCard,
  FitInputs,
  PoolCard,
  PoolListing,
  VisaType,
  WorkAuthorization,
} from '@/lib/profiles';
import type { Category } from '@/lib/taxonomy';
import { record } from '@/modules/audit';
import { getUserContacts } from '@/modules/identity';
import { blockedUserIdsForOrg, getRelationships } from '@/modules/safety';
import { buildProfileSnapshot } from './profile';
import { seekerReveals } from './schema';

const POOL_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SkillJson = { label: string; highlighted: boolean };

type PoolRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  city: string;
  region: string | null;
  country_code: string;
  avail_date: string;
  avatar_media_id: string | null;
  cover_media_id: string | null;
  pref_categories: string[] | string;
  skills: SkillJson[] | string | null;
};

function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

function uuidArray(values: readonly string[]): SQL {
  const ids = values.filter((value) => UUID.test(value));
  if (ids.length === 0) return sql`'{}'::uuid[]`;
  return sql`array[${sql.join(
    ids.map((value) => sql`${value}::uuid`),
    sql`, `,
  )}]::uuid[]`;
}

function asStrings(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (!value || value === '{}') return [];
  const body = value.startsWith('{') ? value.slice(1, -1) : value;
  return body === '' ? [] : body.split(',');
}

function asSkills(value: SkillJson[] | string | null): SkillJson[] {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((skill) => {
    const row = skill as SkillJson;
    return { label: String(row.label), highlighted: Boolean(row.highlighted) };
  });
}

function day(value: string): string {
  return String(value).slice(0, 10);
}

function toCard(row: PoolRow): PoolCard {
  const last = row.last_name.trim();
  return {
    seekerUserId: row.user_id,
    firstName: row.first_name.trim(),
    lastInitial: last.slice(0, 1),
    city: row.city.trim(),
    region: row.region,
    countryCode: row.country_code.trim(),
    availabilityDate: day(row.avail_date),
    skills: asSkills(row.skills),
    avatarMediaId: row.avatar_media_id,
    coverMediaId: row.cover_media_id,
    categories: asStrings(row.pref_categories) as Category[],
  };
}

const SKILLS_SQL = sql`
  coalesce((
    select json_agg(
      json_build_object('label', s.label, 'highlighted', s.highlight_rank is not null)
      order by s.highlight_rank asc nulls last, s.sort_order
    )
    from app.seeker_skills s
    where s.user_id = p.user_id
  ), '[]'::json)
`;

/** Seekers who can be in a pool at all, before a listing's relevance and visa rules. */
function eligibleSql(): SQL {
  return sql`
    p.visible_to_hosts
    and p.work_auth_status is not null
    and p.avail_date is not null
    and p.avail_confirmed_at is not null
    and p.removed_by_moderation_at is null
    and p.avail_confirmed_at > now() - interval '90 days'
    and btrim(p.first_name) <> ''
    and btrim(p.city) <> ''
    and (cardinality(p.pref_categories) > 0 or cardinality(p.pref_occupations) > 0)
  `;
}

function decodeCursor(after: string): { date: string; id: string } {
  const text = Buffer.from(after, 'base64url').toString('utf8');
  const split = text.indexOf('|');
  const date = split === -1 ? '' : text.slice(0, split);
  const id = split === -1 ? '' : text.slice(split + 1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !UUID.test(id)) {
    throw badRequest('That page is not valid', { reason: 'cursor' });
  }
  return { date, id };
}

function encodeCursor(date: string, id: string): string {
  return Buffer.from(`${day(date)}|${id}`).toString('base64url');
}

/** Seekers who meet every pool rule for the listing, by availability date then user id. */
export async function queryPoolCandidates(
  db: DbOrTx,
  i: { listing: PoolListing; limit: number; after?: string },
): Promise<{ items: PoolCard[]; next: string | null }> {
  if (!Number.isInteger(i.limit) || i.limit > POOL_LIMIT) {
    throw badRequest('Ask for at most 500', { reason: 'limit' });
  }
  const cursor = i.after ? decodeCursor(i.after) : null;
  const blocked = await blockedUserIdsForOrg(db, i.listing.orgId);
  const rows = await queryRows<PoolRow>(
    db,
    sql`
      select
        p.user_id, p.first_name, p.last_name, p.city, p.region, p.country_code,
        p.avail_date::text as avail_date, p.avatar_media_id, p.cover_media_id,
        p.pref_categories, ${SKILLS_SQL} as skills
      from app.seeker_profiles p
      where ${eligibleSql()}
        and (
          p.pref_categories && ${textArray(i.listing.categories)}
          or ${i.listing.occupationCode} = any(p.pref_occupations)
        )
        and (
          ${i.listing.sponsorsVisa}::boolean
          or p.work_auth_status is distinct from 'needs_sponsorship'
        )
        and not (p.user_id = any(${uuidArray(blocked)}))
        and (
          ${cursor !== null}::boolean = false
          or (p.avail_date, p.user_id) > (${cursor?.date ?? '1970-01-01'}::date, ${cursor?.id ?? '00000000-0000-0000-0000-000000000000'}::uuid)
        )
      order by p.avail_date, p.user_id
      limit ${i.limit}
    `,
  );
  const contacts = await getUserContacts(
    db,
    rows.map((row) => row.user_id),
  );
  const items = rows
    .filter((row) => contacts.get(row.user_id)?.deleted === false)
    .map(toCard);
  const last = rows[rows.length - 1];
  const next = rows.length < i.limit || !last ? null : encodeCursor(last.avail_date, last.user_id);
  return { items, next };
}

/** Cards for the org at a stage; drops ineligible, unrevealed and blocked seekers. */
export async function getCandidateCards(
  db: DbOrTx,
  i: { orgId: string; seekerUserIds: string[]; stage: 'pool' | 'interested' },
): Promise<CandidateCard[]> {
  if (i.seekerUserIds.length === 0) return [];
  const [rows, relationships, revealed] = await Promise.all([
    queryRows<PoolRow>(
      db,
      sql`
        select
          p.user_id, p.first_name, p.last_name, p.city, p.region, p.country_code,
          p.avail_date::text as avail_date, p.avatar_media_id, p.cover_media_id,
          p.pref_categories, ${SKILLS_SQL} as skills
        from app.seeker_profiles p
        where ${eligibleSql()}
          and p.user_id = any(${uuidArray(i.seekerUserIds)})
      `,
    ),
    getRelationships(db, { orgId: i.orgId, seekerUserIds: i.seekerUserIds }),
    i.stage === 'interested'
      ? queryRows<{ seeker_user_id: string }>(
          db,
          sql`
            select seeker_user_id from app.seeker_reveals
            where org_id = ${i.orgId}::uuid
              and seeker_user_id = any(${uuidArray(i.seekerUserIds)})
          `,
        )
      : Promise.resolve([]),
  ]);
  const blocked = new Set(
    relationships.filter((row) => row.blocked).map((row) => row.seekerUserId),
  );
  const byId = new Map(rows.map((row) => [row.user_id, row]));
  const revealedIds = new Set(revealed.map((row) => row.seeker_user_id));
  const cards: CandidateCard[] = [];
  for (const seekerUserId of i.seekerUserIds) {
    if (blocked.has(seekerUserId)) continue;
    const row = byId.get(seekerUserId);
    if (!row) continue;
    const card = toCard(row);
    if (i.stage === 'pool') {
      cards.push({ stage: 'pool', card });
      continue;
    }
    if (!revealedIds.has(seekerUserId)) continue;
    cards.push({
      stage: 'interested',
      card,
      profile: await buildProfileSnapshot(db, seekerUserId, { includeWorkAuthorization: false }),
    });
  }
  return cards;
}

type FitRow = {
  user_id: string;
  pref_categories: string[] | string;
  pref_occupations: string[] | string;
  avail_date: string | null;
  work_auth_status: WorkAuthorization['status'] | null;
  work_auth_visa_types: string[] | string;
  work_auth_visa_end: string | null;
  pref_min_pay_cents: number | null;
  pref_min_pay_unit: 'hour' | 'day' | 'year' | null;
  willing_to_relocate: boolean;
  pref_states: string[] | string;
  region: string | null;
  country_code: string;
};

function workAuthorization(row: FitRow): WorkAuthorization | null {
  const visas = asStrings(row.work_auth_visa_types) as VisaType[];
  if (row.work_auth_status === 'authorized') return { status: 'authorized' };
  if (row.work_auth_status === 'needs_sponsorship') {
    return { status: 'needs_sponsorship', visaTypes: visas };
  }
  if (row.work_auth_status === 'has_visa') {
    const visaType = visas[0];
    const endsOn = row.work_auth_visa_end ? day(row.work_auth_visa_end) : null;
    if (!visaType || !endsOn) return null;
    return { status: 'has_visa', visaType, endsOn };
  }
  return null;
}

/** Server only, never serialized. */
export async function getFitInputs(db: DbOrTx, seekerUserIds: string[]): Promise<FitInputs[]> {
  if (seekerUserIds.length === 0) return [];
  const ids = uuidArray(seekerUserIds);
  const [rows, skills, certifications] = await Promise.all([
    queryRows<FitRow>(
      db,
      sql`
        select user_id, pref_categories, pref_occupations, avail_date::text as avail_date,
          work_auth_status, work_auth_visa_types, work_auth_visa_end::text as work_auth_visa_end,
          pref_min_pay_cents, pref_min_pay_unit, willing_to_relocate, pref_states, region,
          country_code
        from app.seeker_profiles
        where user_id = any(${ids})
      `,
    ),
    queryRows<{ user_id: string; skill_key: string }>(
      db,
      sql`
        select user_id, skill_key from app.seeker_skills
        where user_id = any(${ids})
        order by highlight_rank asc nulls last, sort_order
      `,
    ),
    queryRows<{ user_id: string; cert_key: string; expires_on: string | null }>(
      db,
      sql`
        select user_id, cert_key, expires_on::text as expires_on
        from app.seeker_certifications
        where user_id = any(${ids})
        order by sort_order
      `,
    ),
  ]);
  const byId = new Map(rows.map((row) => [row.user_id, row]));
  return seekerUserIds.flatMap((seekerUserId) => {
    const row = byId.get(seekerUserId);
    if (!row) return [];
    const fit: FitInputs = {
      seekerUserId,
      categories: asStrings(row.pref_categories) as Category[],
      occupationCodes: asStrings(row.pref_occupations),
      availabilityDate: row.avail_date ? day(row.avail_date) : null,
      skillKeys: skills.filter((skill) => skill.user_id === seekerUserId).map((skill) => skill.skill_key),
      certifications: certifications
        .filter((cert) => cert.user_id === seekerUserId)
        .map((cert) => ({
          key: cert.cert_key,
          expiresOn: cert.expires_on ? day(cert.expires_on) : null,
        })),
      workAuthorization: workAuthorization(row),
      minPay:
        row.pref_min_pay_cents != null && row.pref_min_pay_unit
          ? { cents: row.pref_min_pay_cents, unit: row.pref_min_pay_unit }
          : null,
      willingToRelocate: row.willing_to_relocate,
      preferredStates: asStrings(row.pref_states),
      region: row.region,
      countryCode: row.country_code.trim(),
    };
    return [fit];
  });
}

/** Idempotent. Records `profiles.reveal_granted` only when the row is new. */
export async function grantReveal(
  db: DbOrTx,
  i: {
    seekerUserId: string;
    orgId: string;
    reason: 'applied' | 'invite_interested';
    sourceId: string;
  },
): Promise<{ created: boolean }> {
  const inserted = await db
    .insert(seekerReveals)
    .values({
      id: newId(),
      seekerUserId: i.seekerUserId,
      orgId: i.orgId,
      reason: i.reason,
      sourceId: i.sourceId,
    })
    .onConflictDoNothing()
    .returning({ id: seekerReveals.id });
  if (inserted.length === 0) return { created: false };
  await record(db, {
    actorType: 'system',
    actorId: null,
    orgId: i.orgId,
    action: 'profiles.reveal_granted',
    subjectType: 'seeker_profile',
    subjectId: i.seekerUserId,
    data: { orgId: i.orgId },
  });
  return { created: true };
}
