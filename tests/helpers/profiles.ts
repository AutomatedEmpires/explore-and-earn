// A seeker who already meets every pool rule, for SP4 pool and profile tests.
import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import type { WorkAuthorization } from '@/lib/profiles';
import type { Category } from '@/lib/taxonomy';
import type { CurrentUser } from '@/modules/identity';
import { seedUser } from './sp4';

type Options = {
  categories?: Category[];
  occupations?: string[];
  workAuthorization?: WorkAuthorization;
  availDate?: string;
  confirmedAt?: Date;
  visible?: boolean;
};

function authColumns(auth: WorkAuthorization): {
  workAuthStatus: 'authorized' | 'needs_sponsorship' | 'has_visa';
  workAuthVisaTypes: string[];
  workAuthVisaEnd: string | null;
} {
  if (auth.status === 'authorized') {
    return { workAuthStatus: 'authorized', workAuthVisaTypes: [], workAuthVisaEnd: null };
  }
  if (auth.status === 'needs_sponsorship') {
    return {
      workAuthStatus: 'needs_sponsorship',
      workAuthVisaTypes: auth.visaTypes,
      workAuthVisaEnd: null,
    };
  }
  return {
    workAuthStatus: 'has_visa',
    workAuthVisaTypes: [auth.visaType],
    workAuthVisaEnd: auth.endsOn,
  };
}

function textArray(values: readonly string[]): SQL {
  if (values.length === 0) return sql`'{}'::text[]`;
  return sql`array[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

/** Maya Rodriguez in Juneau, ready for a maritime pool unless `o` turns a rule off. */
export async function seedPoolReadySeeker(db: Db, o: Options = {}): Promise<CurrentUser> {
  const user = await seedUser(db, { accountType: 'seeker' });
  const auth = authColumns(o.workAuthorization ?? { status: 'authorized' });
  const confirmed = (o.confirmedAt ?? new Date()).toISOString();
  await db.execute(sql`
    insert into app.seeker_profiles (
      user_id, first_name, last_name, city, region, country_code, phone,
      visible_to_hosts, pref_categories, pref_occupations,
      work_auth_status, work_auth_visa_types, work_auth_visa_end,
      avail_preset, avail_date, avail_confirmed_at
    ) values (
      ${user.id}, 'Maya', 'Rodriguez', 'Juneau', 'AK', 'US', '+19075550123',
      ${o.visible ?? true}, ${textArray(o.categories ?? ['maritime'])},
      ${textArray(o.occupations ?? [])},
      ${auth.workAuthStatus}, ${textArray(auth.workAuthVisaTypes)}, ${auth.workAuthVisaEnd},
      '1_month', ${o.availDate ?? '2026-12-17'}, ${confirmed}::timestamptz
    )
  `);
  return user;
}
