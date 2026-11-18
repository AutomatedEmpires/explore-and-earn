// The privacy module's own handler. Requests, their steps and the deletion ledger are the
// proof that a request was honored, so they are kept (ids only); the export archives a person
// asked for, and the links from consent records to them, are erased.
import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getStorage } from '@/modules/media';
import { CONSENT_TABLES, eraseConsentLinks, exportConsent } from './consent';
import { removeExportArchive, removeExportParts } from './export';
import { OPEN_STATUSES } from './requests';
import { privacyLegalHolds, privacyRequestSteps, privacyRequests } from './schema';
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
        const exportsWithFiles = await tx
          .select({
            id: privacyRequests.id,
            status: privacyRequests.status,
            exportPath: privacyRequests.exportPath,
          })
          .from(privacyRequests)
          .where(
            and(
              eq(privacyRequests.userId, s.userId),
              eq(privacyRequests.kind, 'export'),
              or(
                inArray(privacyRequests.status, OPEN_STATUSES),
                isNotNull(privacyRequests.exportPath),
              ),
            ),
          );
        const storage = getStorage();
        for (const request of exportsWithFiles) {
          const open = (OPEN_STATUSES as readonly string[]).includes(request.status);
          if (open) {
            const steps = await tx
              .select({ module: privacyRequestSteps.module })
              .from(privacyRequestSteps)
              .where(
                and(
                  eq(privacyRequestSteps.requestId, request.id),
                  eq(privacyRequestSteps.phase, 'export'),
                ),
              );
            await removeExportParts(
              storage,
              request.id,
              steps.map((step) => step.module),
            );
          }
          if (request.exportPath) await removeExportArchive(storage, request.exportPath);
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
      }
    }

    if (await hasHold(tx, s)) {
      retained.push({ table: 'privacy_legal_holds', reason: 'legal_hold', until: null });
    }
    return { erased, retained };
  },
};
