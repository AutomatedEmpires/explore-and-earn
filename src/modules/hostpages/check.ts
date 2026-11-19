// hostpages.check_content: runs `text_safety` on the text a held change adds, then applies the
// change (approved), keeps it for an operator (needs_review) or discards it (rejected). The
// check runs outside any transaction; the decision is applied under the row lock, and only if
// the held change is still the one that was checked (a newer save has its own job).
import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { runCheck } from '@/modules/trust';
import {
  addedText,
  applyPending,
  canonicalJson,
  discardPending,
  loadPage,
  readContent,
  transact,
} from './editor';
import { CONTENT_HELD, notifyOwnerAdmins } from './notifications';
import { hostPages } from './schema';

/** The trust subject for a host page; its id is the org id. */
export const HOST_PAGE_SUBJECT = 'host_page';

export async function checkHostPageContent(db: Db, orgId: string): Promise<void> {
  const row = await loadPage(db, orgId);
  if (!row || row.pendingContent === null || row.pendingCheckId !== null) return;
  const checked = canonicalJson(row.pendingContent);
  const added = addedText(readContent(row.content), readContent(row.pendingContent));

  const result =
    added.length === 0
      ? null
      : await runCheck(db, {
          kind: 'text_safety',
          subjectType: HOST_PAGE_SUBJECT,
          subjectId: orgId,
          text: added.join('\n\n'),
        });

  await transact(db, async (tx) => {
    const current = await loadPage(tx, orgId, { lock: true });
    if (
      !current ||
      current.pendingContent === null ||
      current.pendingCheckId !== null ||
      canonicalJson(current.pendingContent) !== checked
    ) {
      return;
    }

    if (!result || result.decision === 'approved') {
      await applyPending(tx, current, 'check');
    } else if (result.decision === 'needs_review') {
      await tx
        .update(hostPages)
        .set({ pendingCheckId: result.checkId })
        .where(eq(hostPages.orgId, orgId));
      await notifyOwnerAdmins(tx, orgId, CONTENT_HELD, { rejected: false });
    } else {
      await discardPending(tx, orgId);
      await notifyOwnerAdmins(tx, orgId, CONTENT_HELD, { rejected: true, reason: result.reason });
    }
  });
}
