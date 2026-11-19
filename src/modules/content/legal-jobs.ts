// The legal jobs (SP8 spec section 6): `content.legal_effective` publishes scheduled versions on
// their date (cron every 15 minutes), and `content.legal_notify_chunk` tells the people who must
// accept a material change that it is coming, 500 per job.
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { queryRows, withTx } from '@/lib/db';
import { enqueue, type Handler, type HandlerMap } from '@/modules/jobs';
import { notify } from '@/modules/notifications';
import {
  LEGAL_EFFECTIVE_TOPIC,
  LEGAL_NOTIFY_TOPIC,
  publishDueLegal,
  type LegalSlug,
} from './legal';
import { legalDocuments } from './schema-legal';
// The handler sends legal.updated, so the type is registered wherever the handler is loaded.
import './notification-types';

export { LEGAL_EFFECTIVE_TOPIC, LEGAL_NOTIFY_TOPIC } from './legal';

/** People notified per job. A full chunk queues the next one. */
export const LEGAL_NOTIFY_CHUNK = 500;

/** Who is told of a change: those who accept the document. Other documents notify no one. */
const AUDIENCE: Partial<Record<LegalSlug, readonly ('seeker' | 'host')[]>> = {
  terms: ['seeker', 'host'],
  privacy: ['seeker', 'host'],
  'host-terms': ['host'],
  community: ['seeker'],
};

const notifyPayload = z.object({ documentId: z.uuid(), afterUserId: z.uuid().nullable() });

const effectiveDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

const notifyChunk: Handler = async (payload, { db }) => {
  const p = notifyPayload.parse(payload);
  const [doc] = await db
    .select({
      slug: legalDocuments.slug,
      title: legalDocuments.title,
      status: legalDocuments.status,
      effectiveAt: legalDocuments.effectiveAt,
      summaryOfChanges: legalDocuments.summaryOfChanges,
    })
    .from(legalDocuments)
    .where(eq(legalDocuments.id, p.documentId));
  // A version that was never scheduled, or has no date, has nothing to announce.
  if (!doc?.effectiveAt || (doc.status !== 'scheduled' && doc.status !== 'published')) return;
  const audience = AUDIENCE[doc.slug as LegalSlug];
  if (!audience) return;

  // The people who accept this document, in id order: identity's table, read only.
  const people = await queryRows<{ id: string }>(
    db,
    sql`
      select id from app.users
      where account_type in (${sql.join(
        audience.map((type) => sql`${type}`),
        sql`, `,
      )})
        and deleted_at is null
        ${p.afterUserId ? sql`and id > ${p.afterUserId}::uuid` : sql``}
      order by id
      limit ${LEGAL_NOTIFY_CHUNK}
    `,
  );
  const data = {
    slug: doc.slug,
    title: doc.title,
    effectiveDate: effectiveDate.format(doc.effectiveAt),
    summaryOfChanges: doc.summaryOfChanges,
  };
  // One transaction per chunk: a retried job sends its chunk once.
  await withTx(db, async (tx) => {
    for (const person of people) await notify(tx, person.id, 'legal.updated', data);
    const last = people.at(-1);
    if (people.length === LEGAL_NOTIFY_CHUNK && last) {
      await enqueue(tx, {
        topic: LEGAL_NOTIFY_TOPIC,
        payload: { documentId: p.documentId, afterUserId: last.id },
        dedupeKey: `legal_notify:${p.documentId}:${last.id}`,
      });
    }
  });
};

export const legalJobHandlers: HandlerMap = {
  [LEGAL_EFFECTIVE_TOPIC]: async (_payload, { db, now }) => {
    await publishDueLegal(db, now);
  },
  [LEGAL_NOTIFY_TOPIC]: notifyChunk,
};
