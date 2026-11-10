// Search box suggestions: jobs, places and employers (SP3 spec section 5, plan Task 21), up to
// 5 in each group. Jobs and employers come from active listings only, so a suggestion always
// leads to at least one job. `q` is matched as text: LIKE and regex characters are escaped.
import { sql } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import { US_STATES } from '@/lib/discovery';
import { listDestinations } from '@/modules/locations';

export const SUGGEST_PER_GROUP = 5;
const Q_MIN = 2;
const Q_MAX = 100;

export type Suggestions = {
  jobs: { label: string; q: string }[];
  places: { label: string; kind: 'state' | 'destination'; value: string }[];
  employers: { label: string; orgId: string; slug: string }[];
};

/** `q` as a POSIX regex literal. */
const regexLiteral = (q: string) => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `q` as a LIKE literal (escape character `\`). */
const likeLiteral = (q: string) => q.replace(/[\\%_]/g, '\\$&');

const startsWith = (name: string, q: string) => name.toLowerCase().startsWith(q.toLowerCase());

export async function suggest(db: DbOrTx, raw: string): Promise<Suggestions> {
  const q = raw.trim();
  if (q.length < Q_MIN || q.length > Q_MAX) return { jobs: [], places: [], employers: [] };
  // A word starts with q: at the start, or after anything that isn't a letter or digit.
  const word = `(^|[^[:alnum:]])${regexLiteral(q)}`;

  const jobRows = await queryRows<{ label: string; kind: number }>(
    db,
    sql`select label, kind from (
        select dl.occupation_label as label, 0 as kind, count(*)::int as n
        from app.discovery_listings dl
        where dl.is_active and dl.occupation_label ~* ${word}
        group by dl.occupation_label
        union all
        select dl.title as label, 1 as kind, count(*)::int as n
        from app.discovery_listings dl
        where dl.is_active and dl.title ~* ${word}
        group by dl.title
      ) j
      order by kind, n desc, lower(label), label
      limit ${SUGGEST_PER_GROUP * 4}::int`,
  );
  const jobs: Suggestions['jobs'] = [];
  const seenJobs = new Set<string>();
  for (const r of jobRows) {
    const key = r.label.toLowerCase();
    if (seenJobs.has(key)) continue;
    seenJobs.add(key);
    jobs.push({ label: r.label, q: r.label });
    if (jobs.length === SUGGEST_PER_GROUP) break;
  }

  const states = US_STATES.filter((s) => startsWith(s.name, q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ label: s.name, kind: 'state' as const, value: s.code }));
  const destinations = (await listDestinations(db))
    .filter((d) => startsWith(d.name, q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ label: d.name, kind: 'destination' as const, value: d.slug }));
  const places = [...states, ...destinations].slice(0, SUGGEST_PER_GROUP);

  const employers = await queryRows<Suggestions['employers'][number]>(
    db,
    sql`select distinct on (lower(dl.host_name), dl.org_id)
        dl.host_name as label, dl.org_id::text as "orgId", dl.host_slug as slug
      from app.discovery_listings dl
      where dl.is_active and lower(dl.host_name) like lower(${likeLiteral(q)}) || '%' escape '\\'
      order by lower(dl.host_name), dl.org_id, dl.indexed_at desc
      limit ${SUGGEST_PER_GROUP}::int`,
  );
  return { jobs, places, employers };
}
