// GET/PUT /api/v1/host/not-selected-message. Billing gets 403 role_not_allowed (plan rule H).
import { unauthorized } from '@/lib/errors';
import { notSelectedSchema } from '@/lib/messaging';
import {
  getNotSelectedMessage,
  requireHiringCapability,
  setNotSelectedMessage,
} from '@/modules/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  openapi: {
    method: 'GET',
    path: '/api/v1/host/not-selected-message',
    summary: 'Read the not-selected message',
  },
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'messages.access');
    return getNotSelectedMessage(db, host.orgId);
  },
});

export const PUT = apiRoute({
  auth: 'host',
  input: notSelectedSchema,
  openapi: {
    method: 'PUT',
    path: '/api/v1/host/not-selected-message',
    summary: 'Set the not-selected message',
  },
  handler: async ({ db, host, input }) => {
    if (!host) throw unauthorized();
    requireHiringCapability(host, 'messages.access');
    return setNotSelectedMessage(db, host, input.body);
  },
});
