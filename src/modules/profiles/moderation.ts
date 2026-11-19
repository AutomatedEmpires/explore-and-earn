// Module-load registrations: the `seeker_profile` trust subject and report subject (SP4 spec 6).
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notify } from '@/modules/notifications';
import { registerReportSubject } from '@/modules/safety';
import { registerSubjectHandlers } from '@/modules/trust';
import { seekerProfiles } from './schema';

async function remove(db: DbOrTx, userId: string): Promise<void> {
  const [row] = await db
    .update(seekerProfiles)
    .set({
      headline: '',
      bio: '',
      avatarMediaId: null,
      coverMediaId: null,
      removedByModerationAt: new Date(),
    })
    .where(eq(seekerProfiles.userId, userId))
    .returning({ userId: seekerProfiles.userId });
  if (!row) return;
  await notify(db, userId, 'profiles.content_removed', { url: '/profile' });
}

async function approve(db: DbOrTx, userId: string): Promise<void> {
  await db
    .update(seekerProfiles)
    .set({ removedByModerationAt: null })
    .where(eq(seekerProfiles.userId, userId));
}

registerSubjectHandlers('seeker_profile', { remove, approve });

registerReportSubject('seeker_profile', {
  trustSubjectType: 'seeker_profile',
  exists: async (db, id) => {
    const [row] = await db
      .select({ userId: seekerProfiles.userId })
      .from(seekerProfiles)
      .where(eq(seekerProfiles.userId, id))
      .limit(1);
    return row != null;
  },
});
