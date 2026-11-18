// Identity's privacy handler. The users row is never deleted: other people's records point at
// it (a host's pipeline, an audit trail), so it is pseudonymized instead. It runs only in the
// finalize step, after every other module has erased what hangs off the account.
import { eq } from 'drizzle-orm';
import type { EraseResult, ExportPart, PrivacyHandler } from '@/modules/privacy';
import { operators, users } from './schema';
import { clerkIdHash } from './sync';

const DELETED_NAME = 'Deleted user';
const DELETED_PREFIX = 'deleted:';

export const privacyHandler: PrivacyHandler = {
  module: 'identity',
  tables: ['users', 'operators', 'webhook_events'],

  async exportData(db, s): Promise<ExportPart> {
    if (s.kind !== 'user') return { records: { account: [] }, files: [] };
    const account = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        accountType: users.accountType,
        adultAttestedAt: users.adultAttestedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, s.userId));
    return { records: { account }, files: [] };
  },

  async erase(tx, s, ctx): Promise<EraseResult> {
    if (s.kind !== 'user') return { erased: 0, retained: [] };
    const [user] = await tx.select().from(users).where(eq(users.id, s.userId)).for('update');
    if (!user) return { erased: 0, retained: [] };

    const [operator] = await tx
      .select({ userId: operators.userId })
      .from(operators)
      .where(eq(operators.userId, s.userId));
    const heldAll = ctx.holds.includes('all');
    const retained: EraseResult['retained'] = [
      { table: 'users', reason: heldAll ? 'legal_hold' : 'shared_record', until: null },
      ...(operator
        ? [{ table: 'operators', reason: 'shared_record' as const, until: null }]
        : []),
    ];

    // The tombstone is the hash of the real Clerk id, so it is taken once: a later run sees
    // `deleted:<id>` and must not hash that (Plan decision 33).
    const tombstone =
      user.erasedClerkIdSha256 ??
      (user.clerkUserId.startsWith(DELETED_PREFIX) ? null : clerkIdHash(user.clerkUserId));
    const deletedAt = user.deletedAt ?? ctx.now;

    if (heldAll) {
      // Sign-in ends and Clerk's late events are ignored, but the record itself is held.
      await tx
        .update(users)
        .set({ erasedClerkIdSha256: tombstone, deletedAt })
        .where(eq(users.id, user.id));
      return { erased: 0, retained };
    }

    const pseudonym = `${DELETED_PREFIX}${user.id}`;
    const done =
      user.clerkUserId === pseudonym &&
      user.email === null &&
      user.displayName === DELETED_NAME &&
      user.deletedAt !== null;
    if (done) return { erased: 0, retained };

    await tx
      .update(users)
      .set({
        erasedClerkIdSha256: tombstone,
        email: null,
        displayName: DELETED_NAME,
        clerkUserId: pseudonym,
        deletedAt,
      })
      .where(eq(users.id, user.id));
    return { erased: 1, retained };
  },
};
