// Every outbox topic's handler, collected from each module's public `jobHandlers`.
// Shared touchpoint: modules register handlers in their own index.ts, never here.
import { jobHandlers as audit } from '@/modules/audit';
import { jobHandlers as billing } from '@/modules/billing';
import { jobHandlers as entitlements } from '@/modules/entitlements';
import { jobHandlers as hostpages } from '@/modules/hostpages';
import { jobHandlers as identity } from '@/modules/identity';
import { jobHandlers as jobs, type HandlerMap } from '@/modules/jobs';
import { jobHandlers as listings } from '@/modules/listings';
import { jobHandlers as locations } from '@/modules/locations';
import { jobHandlers as media } from '@/modules/media';
import { jobHandlers as notifications } from '@/modules/notifications';
import { jobHandlers as operator } from '@/modules/operator';
import { jobHandlers as orgs } from '@/modules/orgs';
import { jobHandlers as settings } from '@/modules/settings';
import { jobHandlers as trust } from '@/modules/trust';
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
  settings,
  trust,
  // SP2
  billing,
  entitlements,
  hostpages,
  listings,
  locations,
  verification,
});
