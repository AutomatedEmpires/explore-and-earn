// The privacy module's own handler. Requests, their steps and the deletion ledger are the
// proof that a request was honored, so they are kept (ids only); the export archives a person
// asked for, and the links from consent records to them, are erased.
import { and, asc, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getStorage } from '@/modules/media';
import { CONSENT_TABLES, eraseConsentLinks, exportConsent } from './consent';
import { removeExportFiles } from './export';
import { OPEN_STATUSES } from './requests';
import { privacyLegalHolds, privacyRequests } from './schema';
import type { EraseResult, PrivacyHandler, PrivacySubject } from './types';

type Retained = EraseResult['retained'];

async function hasHold(db: DbOrTx, s: PrivacySubject): Promise<boolean> {
  const [row] = await db
    .select({ id: privacyLegalHolds.id })
    .from(privacyLegalHolds)
    .where(
      s.kind === 'user'
        ? eq(privacyLegalHolds.userId, s.userId)
        : eq(privacyLegalHolds.orgId, s.orgId),
    )
    .limit(1);
  return Boolean(row);
}

export const privacyHandler: PrivacyHandler = {
  module: 'privacy',
  tables: [
    'privacy_requests',
    'privacy_request_steps',
    'privacy_deletion_ledger',
    'privacy_legal_holds',
    'retention_runs',
    ...CONSENT_TABLES,
  ],

  /** The person's requests and consent choices. Holds are never exported. */
  async exportData(db, s) {
    if (s.kind !== 'user') return { records: { requests: [], consent: [] }, files: [] };
    const requests = await db
      .select({
        kind: privacyRequests.kind,
        status: privacyRequests.status,
        createdAt: privacyRequests.createdAt,
        completedAt: privacyRequests.completedAt,
      })
      .from(privacyRequests)
      .where(eq(privacyRequests.userId, s.userId))
      .orderBy(desc(privacyRequests.id));
    return { records: { requests, consent: await exportConsent(db, s.userId) }, files: [] };
  },

  async erase(tx, s, ctx) {
    const retained: Retained = [];
    const heldAll = ctx.holds.includes('all');
    let erased = 0;

    if (s.kind === 'user') {
      retained.push(
        { table: 'privacy_requests', reason: 'legal_obligation', until: null },
        { table: 'privacy_request_steps', reason: 'legal_obligation', until: null },
        { table: 'privacy_deletion_ledger', reason: 'legal_obligation', until: null },
      );
      if (heldAll) {
        if ((await exportConsent(tx, s.userId)).length > 0) {
          for (const table of CONSENT_TABLES) {
            retained.push({ table, reason: 'legal_hold', until: null });
          }
        }
      } else {
        erased += await eraseConsentLinks(tx, s.userId);

        // The archives of earlier exports, and the parts of one still being built, hold
        // everything about the person. The request rows stay; the files go.
        //
        // Each request row is locked first. An export step or finalize step that is writing
        // holds the same lock (export.ts), so this waits for it and then removes what it wrote;
        // one that starts afterwards finds the request stopped and writes nothing. The files
        // are found by the request id, not through a part or `export_path`: a step may have
        // copied files before writing its part, and finalize may have written the archive
        // before storing its path.
        const exports = await tx
          .select({
            id: privacyRequests.id,
            status: privacyRequests.status,
            exportPath: privacyRequests.exportPath,
          })
          .from(privacyRequests)
          .where(and(eq(privacyRequests.userId, s.userId), eq(privacyRequests.kind, 'export')))
          .orderBy(asc(privacyRequests.id))
          .for('update');
        const storage = getStorage();
        for (const request of exports) {
          const open = (OPEN_STATUSES as readonly string[]).includes(request.status);
          if (open || request.exportPath !== null) {
            await tx
              .update(privacyRequests)
              .set({
                exportPath: null,
                exportSizeBytes: null,
                ...(open ? { status: 'failed' as const, blockedReason: null } : {}),
              })
              .where(eq(privacyRequests.id, request.id));
            erased += 1;
          }
          await removeExportFiles(storage, request.id);
        }
      }
    }

    if (await hasHold(tx, s)) {
      retained.push({ table: 'privacy_legal_holds', reason: 'legal_hold', until: null });
    }
    return { erased, retained };
  },
};
