// GET · PUT /api/v1/me/notification-preferences (SP4 spec 5): the signed-in user's email and
// push switch for each category. Security and billing are locked on (400, reason `locked`).
import { unauthorized } from '@/lib/errors';
import {
  listPreferenceRows,
  notificationPreferenceSchema,
  updatePreference,
} from '@/modules/notifications';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'user',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/notification-preferences',
    summary: 'List your notification settings',
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    return { items: await listPreferenceRows(db, user.id) };
  },
});

export const PUT = apiRoute({
  auth: 'user',
  input: notificationPreferenceSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/me/notification-preferences',
    summary: 'Turn one notification setting on or off',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await updatePreference(db, user.id, input);
    return { items: await listPreferenceRows(db, user.id) };
  },
});
