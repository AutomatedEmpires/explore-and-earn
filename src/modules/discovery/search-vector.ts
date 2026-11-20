// The projection's full-text document (SP3 spec section 4), in the `english` config:
//   A: title, occupation label
//   B: host name
//   C: genre label, category label, destination name
//   D: city, state name, the first 2,000 characters of the description
import { sql, type SQL } from 'drizzle-orm';

export type SearchVectorFields = {
  title: string | null;
  occupationLabel: string | null;
  hostName: string | null;
  genreLabel: string | null;
  categoryLabel: string | null;
  destinationName: string | null;
  city: string | null;
  stateName: string | null;
  description: string | null;
};

const DESCRIPTION_CHARS = 2000;

/** One weighted part: the non-null values joined with spaces. */
function part(values: (string | null)[], weight: 'A' | 'B' | 'C' | 'D'): SQL {
  const text = values.filter((v): v is string => typeof v === 'string' && v !== '').join(' ');
  return sql`setweight(to_tsvector('english'::regconfig, ${text}::text), ${weight}::"char")`;
}

/** The tsvector expression for a projection row's `search` column. */
export function searchVectorSql(f: SearchVectorFields): SQL {
  return sql`(${part([f.title, f.occupationLabel], 'A')}
    || ${part([f.hostName], 'B')}
    || ${part([f.genreLabel, f.categoryLabel, f.destinationName], 'C')}
    || ${part([f.city, f.stateName, f.description?.slice(0, DESCRIPTION_CHARS) ?? null], 'D')})`;
}
