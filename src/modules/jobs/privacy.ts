// The outbox keeps finished and dead events until the retention sweep removes them. Their
// payloads can name a person (an id, the address of a direct email), so erasure removes the
// settled ones now. Events still waiting to run are left to run.
import { sql, type SQL } from 'drizzle-orm';
import { queryRows, type DbOrTx } from '@/lib/db';
import type { PrivacyHandler, PrivacySubject } from '@/modules/privacy';

/**
 * Settled outbox rows whose payload names the subject or, for a person, their email. The
 * comparison is literal (strpos), so no character in an address acts as a wildcard.
 */
function settledAbout(id: string, email: string | null): SQL {
  const named = email
    ? sql`(strpos(o.payload::text, ${id}) > 0
          or strpos(lower(o.payload::text), ${email.toLowerCase()}) > 0)`
    : sql`strpos(o.payload::text, ${id}) > 0`;
  return sql`o.status in ('done', 'dead') and ${named}`;
}

/** The person's current address. Loaded lazily: identity imports this module. */
async function emailOf(db: DbOrTx, s: PrivacySubject): Promise<string | null> {
  if (s.kind !== 'user') return null;
  const { getUserContact } = await import('@/modules/identity');
  return (await getUserContact(db, s.userId))?.email?.trim() || null;
}

export const privacyHandler: PrivacyHandler = {
  module: 'jobs',
  tables: ['outbox', 'schedule_runs'],
  async exportData() {
    return { records: {}, files: [] };
  },
  async erase(tx, s, ctx) {
    const about = settledAbout(s.kind === 'user' ? s.userId : s.orgId, await emailOf(tx, s));
    if (ctx.holds.includes('all')) {
      const held = await queryRows(
        tx,
        sql`select 1 as one from app.outbox o where ${about} limit 1`,
      );
      return {
        erased: 0,
        retained: held.length > 0 ? [{ table: 'outbox', reason: 'legal_hold', until: null }] : [],
      };
    }
    const deleted = await queryRows(
      tx,
      sql`delete from app.outbox o where ${about} returning o.id`,
    );
    return { erased: deleted.length, retained: [] };
  },
};
