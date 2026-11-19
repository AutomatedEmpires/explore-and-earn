// The content module's privacy handler (SP8 plan Task 24). Legal documents hold no one's personal
// data (their created_by and updated_by are operator ids). A person's legal acceptances are the
// proof of what they agreed to, so deleting the account keeps them for 7 years
// (legal_obligation). Help articles join `tables` through HELP_TABLES once W4's table exists.
import { asc, eq } from 'drizzle-orm';
import type { ExportPart, PrivacyHandler } from '@/modules/privacy';
import { HELP_TABLES } from './help-exports';
import { legalAcceptances } from './schema-legal';

/** How long acceptances outlive a deleted account. */
const ACCEPTANCE_KEEP_YEARS = 7;

export const privacyHandler: PrivacyHandler = {
  module: 'content',
  tables: [...HELP_TABLES, 'legal_documents', 'legal_acceptances'],

  /** The person's acceptances: which document, which version, when. */
  async exportData(db, s): Promise<ExportPart> {
    if (s.kind !== 'user') return { records: {}, files: [] };
    const acceptances = await db
      .select({
        slug: legalAcceptances.slug,
        version: legalAcceptances.version,
        acceptedAt: legalAcceptances.acceptedAt,
      })
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, s.userId))
      .orderBy(asc(legalAcceptances.slug), asc(legalAcceptances.version));
    return { records: { acceptances }, files: [] };
  },

  /** Erases nothing: acceptances are kept, and reported, while the person has any. */
  async erase(tx, s, ctx) {
    if (s.kind !== 'user') return { erased: 0, retained: [] };
    const [any] = await tx
      .select({ id: legalAcceptances.id })
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, s.userId))
      .limit(1);
    if (!any) return { erased: 0, retained: [] };
    const until = new Date(ctx.now);
    until.setUTCFullYear(until.getUTCFullYear() + ACCEPTANCE_KEEP_YEARS);
    return {
      erased: 0,
      retained: [
        {
          table: 'legal_acceptances',
          reason: 'legal_obligation',
          until: until.toISOString().slice(0, 10),
        },
      ],
    };
  },
};
