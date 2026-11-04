// Domain events (SP2 spec section 3): an event fans out into one outbox row per subscriber
// topic, in the emitter's transaction. The subscriber map and the payload types live in the
// shared touchpoint src/server/event-subscribers.ts.
import type { DbOrTx } from '@/lib/db';
import { eventSubscribers, type EventPayloads } from '@/server/event-subscribers';
import { enqueue } from './outbox';

/** What a subscriber's handler receives as its payload. */
export type EventEnvelope<E extends keyof EventPayloads> = {
  event: E;
  eventId: string;
  data: EventPayloads[E];
};

/**
 * Enqueues `event` for every subscriber topic, with the envelope as payload and the dedupe key
 * `<eventId>:<topic>`, so emitting the same event id twice changes nothing. Runs inside the
 * caller's transaction; call `kickWorker()` after it commits. Emitters pass `newId()` as the
 * event id unless their task says otherwise. `subscribers` replaces the shared map (tests).
 */
export async function emit<E extends keyof EventPayloads>(
  db: DbOrTx,
  event: E,
  payload: EventPayloads[E],
  eventId: string,
  subscribers: Record<string, string[]> = eventSubscribers,
): Promise<void> {
  if (!eventId) throw new Error('emit: eventId is required');
  const envelope: EventEnvelope<E> = { event, eventId, data: payload };
  for (const topic of subscribers[event] ?? []) {
    await enqueue(db, { topic, payload: envelope, dedupeKey: `${eventId}:${topic}` });
  }
}

/** Reads a handler's payload as an envelope of `event`, or throws `Expected event <event>`. */
export function readEnvelope<E extends keyof EventPayloads>(
  payload: unknown,
  event: E,
): EventEnvelope<E> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('event' in payload) ||
    payload.event !== event ||
    !('eventId' in payload) ||
    typeof payload.eventId !== 'string' ||
    !('data' in payload) ||
    typeof payload.data !== 'object' ||
    payload.data === null
  ) {
    throw new Error(`Expected event ${event}`);
  }
  return payload as EventEnvelope<E>;
}
