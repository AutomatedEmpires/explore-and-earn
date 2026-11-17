// Messaging outbox topics.
import type { HandlerMap } from '@/modules/jobs';
import { runBulkSend } from './bulk';
import { runMessageScan } from './scan';
import { runMessagingDaily } from './stats';

export const jobHandlers: HandlerMap = {
  'messaging.scan': async (payload, ctx) => {
    if (!ctx) return;
    await runMessageScan(ctx.db, payload);
  },
  'messaging.bulk_send': async (payload, ctx) => {
    if (!ctx) return;
    await runBulkSend(ctx.db, payload);
  },
  'messaging.daily': async (_payload, ctx) => {
    if (!ctx) return;
    await runMessagingDaily(ctx.db, ctx.now);
  },
};
