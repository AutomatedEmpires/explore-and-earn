// The notification settings screen's rows (SP4 spec 7, `/profile/notifications`): one switch per
// user-facing category and channel. Security and billing are locked on (product spec 14), and
// the operator category never shows to users. Preferences are stored by notify.ts's
// setPreference; this file adds the row view and the locked check the API needs.
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { getPreferences, setPreference } from './notify';
import { CHANNELS, MANDATORY_CATEGORIES, type Category, type Channel } from './types';

/** The categories a user sees in their settings, in display order. */
export const USER_PREFERENCE_CATEGORIES = [
  'messages',
  'applications',
  'jobs',
  'alerts',
  'community',
  'account',
  'security',
  'billing',
] as const satisfies readonly Category[];

export type UserPreferenceCategory = (typeof USER_PREFERENCE_CATEGORIES)[number];

export type PreferenceRow = {
  category: UserPreferenceCategory;
  channel: Channel;
  enabled: boolean;
  /** Locked rows are always on and can't be changed. */
  locked: boolean;
};

/** PUT /api/v1/me/notification-preferences. */
export const notificationPreferenceSchema = z.object({
  category: z.enum(USER_PREFERENCE_CATEGORIES),
  channel: z.enum(CHANNELS),
  enabled: z.boolean(),
});

export type PreferenceInput = z.infer<typeof notificationPreferenceSchema>;

/** Every category's email and push switch (16 rows); anything never set is on. */
export async function listPreferenceRows(db: DbOrTx, userId: string): Promise<PreferenceRow[]> {
  const prefs = await getPreferences(db, userId);
  return USER_PREFERENCE_CATEGORIES.flatMap((category) => {
    const locked = MANDATORY_CATEGORIES.has(category);
    return CHANNELS.map((channel) => ({
      category,
      channel,
      enabled: locked ? true : prefs[category][channel],
      locked,
    }));
  });
}

/** Turns one switch on or off. A locked category is `bad_request` with reason `locked`. */
export async function updatePreference(
  db: DbOrTx,
  userId: string,
  i: PreferenceInput,
): Promise<void> {
  if (MANDATORY_CATEGORIES.has(i.category)) {
    throw badRequest('Security and billing messages are always on', { reason: 'locked' });
  }
  await setPreference(db, userId, i.category, i.channel, i.enabled);
}
