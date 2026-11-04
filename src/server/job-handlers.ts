// Every outbox topic's handler, collected from each module's public `jobHandlers`.
// Shared touchpoint: modules register handlers in their own index.ts, never here.
// Also the alert the worker raises when an event goes dead (onDeadEvent).
import type { Db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { jobHandlers as audit } from '@/modules/audit';
import { jobHandlers as billing } from '@/modules/billing';
import { jobHandlers as discovery } from '@/modules/discovery';
import { jobHandlers as entitlements } from '@/modules/entitlements';
import { jobHandlers as hostpages } from '@/modules/hostpages';
import { jobHandlers as identity } from '@/modules/identity';
import { jobHandlers as jobs, type DeadEvent, type HandlerMap } from '@/modules/jobs';
import { jobHandlers as landing } from '@/modules/landing';
import { jobHandlers as listings } from '@/modules/listings';
import { jobHandlers as locations } from '@/modules/locations';
import { jobHandlers as media } from '@/modules/media';
import {
  EMAIL_TOPIC,
  PUSH_TOPIC,
  jobHandlers as notifications,
} from '@/modules/notifications';
import { jobHandlers as operator } from '@/modules/operator';
import { jobHandlers as orgs } from '@/modules/orgs';
import { jobHandlers as ratelimit } from '@/modules/ratelimit';
import { jobHandlers as settings } from '@/modules/settings';
import { raiseAlert, jobHandlers as trust } from '@/modules/trust';
import { jobHandlers as verification } from '@/modules/verification';

function merge(maps: Record<string, HandlerMap>): HandlerMap {
  const out: HandlerMap = {};
  const owner: Record<string, string> = {};
  for (const [module, map] of Object.entries(maps)) {
    for (const [topic, handler] of Object.entries(map)) {
      if (owner[topic]) {
        throw new Error(`Job topic "${topic}" is registered by both ${owner[topic]} and ${module}`);
      }
      owner[topic] = module;
      out[topic] = handler;
    }
  }
  return out;
}

export const handlers: HandlerMap = merge({
  audit,
  identity,
  jobs,
  media,
  notifications,
  operator,
  orgs,
  ratelimit,
  settings,
  trust,
  // SP2
  billing,
  entitlements,
  hostpages,
  listings,
  locations,
  verification,
  // SP3
  discovery,
  landing,
});

/**
 * The worker's dead-letter alarm (runWorker's default `onDead`). The worker has already
 * reported the event to Sentry; this tells the Owners in the console (an operator alert, in its
 * own transaction), so a stuck upload or a dropped side effect is never silent.
 *
 * Except for the topics that deliver notifications: an alert about one of them would be
 * delivered the same way (email and push to every Owner), could die the same way and raise
 * another alert, so those go to Sentry only; the notification's in-app copy already exists.
 */
export async function onDeadEvent(db: Db, dead: DeadEvent): Promise<void> {
  if (dead.topic === EMAIL_TOPIC || dead.topic === PUSH_TOPIC) {
    logger.error('outbox: a notification could not be delivered; reported to Sentry only', {
      eventId: dead.eventId,
      topic: dead.topic,
      attempts: dead.attempts,
    });
    return;
  }
  await db.transaction(async (tx) => {
    await raiseAlert(tx, {
      severity: 'critical',
      kind: 'job_dead',
      message: `A background job (${dead.topic}) failed ${dead.attempts} times and stopped retrying.`,
      data: { eventId: dead.eventId, topic: dead.topic, attempts: dead.attempts },
    });
  });
}
