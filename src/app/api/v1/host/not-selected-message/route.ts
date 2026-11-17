// GET/PUT /api/v1/host/not-selected-message. The owner replaces the handler.
import { notSelectedSchema } from '@/lib/messaging';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  openapi: { method: 'GET', path: '/api/v1/host/not-selected-message', summary: 'Read the not-selected message' },
  handler: async () => {
    throw new Error('not implemented');
  },
});

export const PUT = apiRoute({
  auth: 'host',
  input: notSelectedSchema,
  openapi: { method: 'PUT', path: '/api/v1/host/not-selected-message', summary: 'Set the not-selected message' },
  handler: async () => {
    throw new Error('not implemented');
  },
});
