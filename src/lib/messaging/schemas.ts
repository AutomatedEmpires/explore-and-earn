// Messaging request schemas. `idParamSchema` is shared with hiring (Plan decision 25).
import { z } from 'zod';
import { APPLICATION_STATUSES } from '@/lib/applications';
import { MESSAGES, SAVED_REPLIES } from './constants';

const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;

function textMax(n: number) {
  return z
    .string()
    .trim()
    .refine((s) => [...s].length <= n, { message: `At most ${n} characters` })
    .refine((s) => !CONTROL.test(s), { message: 'Remove control characters' });
}

export const idParamSchema = z.object({ id: z.uuid() });
export const attachmentParamSchema = z.object({ id: z.uuid(), mediaId: z.uuid() });

export const sendMessageSchema = z
  .object({
    clientId: z.string().trim().min(1).max(64),
    body: textMax(MESSAGES.bodyMax).optional(),
    attachmentMediaIds: z.array(z.uuid()).max(MESSAGES.maxAttachments).optional(),
  })
  .refine(
    (value) =>
      (value.body !== undefined && [...value.body].length > 0) ||
      (value.attachmentMediaIds !== undefined && value.attachmentMediaIds.length > 0),
    { message: 'Write a message or attach a file' },
  );

export const threadQuerySchema = z.object({ before: z.string().optional() });

export const hostThreadsQuerySchema = z.object({
  listingId: z.uuid().optional(),
  unread: z.boolean().optional(),
  cursor: z.string().optional(),
});

export const bulkMessageSchema = z.object({
  statuses: z.array(z.enum(APPLICATION_STATUSES)).min(1).max(8),
  body: textMax(MESSAGES.bodyMax),
});

export const savedReplySchema = z.object({
  title: textMax(SAVED_REPLIES.titleMax),
  body: textMax(SAVED_REPLIES.bodyMax),
});

export const savedReplyPatchSchema = z.object({
  title: textMax(SAVED_REPLIES.titleMax).optional(),
  body: textMax(SAVED_REPLIES.bodyMax).optional(),
});

export const notSelectedSchema = z.object({ body: textMax(SAVED_REPLIES.bodyMax) });

export const attachmentQuerySchema = z.object({
  variant: z.union([z.literal(320), z.literal(640), z.literal(1280)]).optional(),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
