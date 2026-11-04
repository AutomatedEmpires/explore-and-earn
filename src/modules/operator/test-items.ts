// Test items: the console's dev-only "Create test item" button sends a piece of text through the
// real text check (trust.runCheck), so the whole review flow can be tried without real content.
// The trust module registers the `test_item` subject; its decisions change nothing.
//
// A test item has no table of its own: its text is kept in the audit event that created it,
// which the item page reads back for the subject preview.
import { sql } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx } from '@/lib/db';
import { badRequest, forbidden } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record, searchAudit } from '@/modules/audit';
import { getOperator } from '@/modules/identity';
import { runCheck, TEST_ITEM_SUBJECT, type CheckDecision } from '@/modules/trust';
import { isUuid } from './rows';

/** `__flag__` makes the stub classifier score the text between the thresholds (needs_review). */
export const DEFAULT_TEST_ITEM_TEXT =
  'Test item from the operator console. __flag__ Sent to a person for review.';

const MAX_TEXT_LENGTH = 2000;
const CREATED = 'operator.test_item_created';

export type TestItem = {
  subjectId: string;
  decision: CheckDecision;
  /** The moderation item it opened, when the check sent it to review. */
  itemId: string | null;
};

/**
 * Runs `text` through the text check as a `test_item` subject and records
 * `operator.test_item_created`. The caller allows this outside prod only.
 */
export async function createTestItem(
  db: Db,
  actorId: string,
  text: string = DEFAULT_TEST_ITEM_TEXT,
): Promise<TestItem> {
  const body = text.trim();
  if (!body) throw badRequest('A test item needs some text');
  if (body.length > MAX_TEXT_LENGTH) {
    throw badRequest(`A test item must be at most ${MAX_TEXT_LENGTH} characters`);
  }
  if (!isUuid(actorId) || !(await getOperator(db, actorId))) {
    throw forbidden('Only operators can do this');
  }

  const subjectId = newId();
  // Recorded first, so the item page can show the text as soon as the item exists.
  await record(db, {
    actorType: 'operator',
    actorId,
    action: CREATED,
    subjectType: TEST_ITEM_SUBJECT,
    subjectId,
    data: { text: body },
  });
  const result = await runCheck(db, {
    kind: 'text_safety',
    subjectType: TEST_ITEM_SUBJECT,
    subjectId,
    text: body,
  });

  const [item] = await queryRows<{ id: string }>(
    db,
    sql`select id from app.review_items where check_id = ${result.checkId}::uuid limit 1`,
  );
  return { subjectId, decision: result.decision, itemId: item?.id ?? null };
}

/** The text a test item was created with, or null. */
export async function testItemText(db: DbOrTx, subjectId: string): Promise<string | null> {
  if (!isUuid(subjectId)) return null;
  const { items } = await searchAudit(db, {
    action: CREATED,
    subjectType: TEST_ITEM_SUBJECT,
    subjectId,
    limit: 1,
  });
  const text = items[0]?.data?.text;
  return typeof text === 'string' ? text : null;
}
