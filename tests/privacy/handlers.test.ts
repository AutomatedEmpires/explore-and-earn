// Every registered privacy handler obeys the eraser rules (SP8 spec section 3, plan Task 13):
// a second run erases nothing and reports the same records kept, a hold on everything erases
// nothing, and an export for someone with no data resolves. The list comes from the registry,
// so a module that registers a handler is tested here without anyone adding it. No handler is
// excused: one that throws, `not implemented` included, fails.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withTx, type Tx } from '@/lib/db';
import { newId } from '@/lib/ids';
import {
  RETAIN_REASONS,
  type EraseResult,
  type HoldScope,
  type PrivacyHandler,
  type PrivacySubject,
} from '@/modules/privacy';
import { privacyRegistry } from '@/server/privacy-registry';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { seedHostOrg, seedSeeker } from '@tests/helpers/sp8';

const NOW = new Date('2026-11-18T12:00:00Z');

const withTables = privacyRegistry.handlers.filter((handler) => handler.tables.length > 0);

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

/** One eraser run as the engine runs it: its own transaction, with the erase guard open. */
function erase(
  handler: PrivacyHandler,
  subject: PrivacySubject,
  holds: HoldScope[] = [],
): Promise<EraseResult> {
  return withTx(t.db, async (tx: Tx) => {
    await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
    return handler.erase(tx, subject, { requestId: newId(), now: NOW, holds });
  });
}

async function subjects(): Promise<PrivacySubject[]> {
  const seeker = await seedSeeker(t.db);
  const org = await seedHostOrg(t.db);
  return [
    { kind: 'user', userId: seeker.userId },
    { kind: 'user', userId: org.owner.userId },
    { kind: 'org', orgId: org.orgId },
  ];
}

describe('every registered privacy handler', () => {
  it('covers the modules that own tables, safety included', () => {
    expect(withTables.length).toBeGreaterThan(0);
    // Safety's handler was a stub this file excused until SP4 W5 landed its tables (issue 209).
    expect(withTables.map((h) => h.module)).toContain('safety');
  });

  describe.each(withTables.map((handler) => [handler.module, handler] as const))(
    '%s',
    (_module, handler) => {
      it('erases nothing under a hold on everything', async () => {
        for (const subject of await subjects()) {
          const held = await erase(handler, subject, ['all']);
          expect(held.erased, `${handler.module} ${subject.kind}`).toBe(0);
        }
      });

      it('is idempotent: a second run erases 0 and keeps the same records', async () => {
        for (const subject of await subjects()) {
          const first = await erase(handler, subject);
          const second = await erase(handler, subject);
          expect(second.erased, `${handler.module} ${subject.kind}`).toBe(0);
          expect(second.retained, `${handler.module} ${subject.kind}`).toEqual(first.retained);
          for (const kept of first.retained) {
            expect(RETAIN_REASONS).toContain(kept.reason);
            expect(handler.tables, `${handler.module} keeps ${kept.table}`).toContain(kept.table);
            expect(kept.until === null || /^\d{4}-\d{2}-\d{2}/.test(kept.until)).toBe(true);
          }
        }
      });

      it('exports for someone with no data', async () => {
        for (const subject of await subjects()) {
          const part = await handler.exportData(t.db, subject);
          expect(Array.isArray(part.files)).toBe(true);
          for (const rows of Object.values(part.records)) expect(Array.isArray(rows)).toBe(true);
        }
      });
    },
  );
});
