// Collects every module's privacyHandler and retentionRules. Later sub-projects add their
// import here the same way job-handlers.ts collects job handlers.
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { privacyHandler as addons, retentionRules as addonsRules } from '@/modules/addons';
import { privacyHandler as analytics, retentionRules as analyticsRules } from '@/modules/analytics';
import {
  privacyHandler as announcements,
  retentionRules as announcementsRules,
} from '@/modules/announcements';
import {
  privacyHandler as applications,
  retentionRules as applicationsRules,
} from '@/modules/applications';
import { privacyHandler as audit, retentionRules as auditRules } from '@/modules/audit';
import { privacyHandler as billing, retentionRules as billingRules } from '@/modules/billing';
import { privacyHandler as boosts, retentionRules as boostsRules } from '@/modules/boosts';
import { privacyHandler as community, retentionRules as communityRules } from '@/modules/community';
import { privacyHandler as content, retentionRules as contentRules } from '@/modules/content';
import { privacyHandler as discovery, retentionRules as discoveryRules } from '@/modules/discovery';
import {
  privacyHandler as entitlements,
  retentionRules as entitlementsRules,
} from '@/modules/entitlements';
import { privacyHandler as hiring, retentionRules as hiringRules } from '@/modules/hiring';
import { privacyHandler as hostpages, retentionRules as hostpagesRules } from '@/modules/hostpages';
import { privacyHandler as identity, retentionRules as identityRules } from '@/modules/identity';
import { privacyHandler as jobs, retentionRules as jobsRules } from '@/modules/jobs';
import { privacyHandler as landing, retentionRules as landingRules } from '@/modules/landing';
import { privacyHandler as launch, retentionRules as launchRules } from '@/modules/launch';
import { privacyHandler as listings, retentionRules as listingsRules } from '@/modules/listings';
import { privacyHandler as locations, retentionRules as locationsRules } from '@/modules/locations';
import { privacyHandler as media, retentionRules as mediaRules } from '@/modules/media';
import { privacyHandler as messaging, retentionRules as messagingRules } from '@/modules/messaging';
import {
  privacyHandler as notifications,
  retentionRules as notificationsRules,
} from '@/modules/notifications';
import { privacyHandler as operator, retentionRules as operatorRules } from '@/modules/operator';
import { privacyHandler as orgs, retentionRules as orgsRules } from '@/modules/orgs';
import { privacyHandler as privacy, retentionRules as privacyRules } from '@/modules/privacy';
import { privacyHandler as profiles, retentionRules as profilesRules } from '@/modules/profiles';
import { privacyHandler as promote, retentionRules as promoteRules } from '@/modules/promote';
import { privacyHandler as safety, retentionRules as safetyRules } from '@/modules/safety';
import { privacyHandler as settings, retentionRules as settingsRules } from '@/modules/settings';
import { privacyHandler as support, retentionRules as supportRules } from '@/modules/support';
import { privacyHandler as trust, retentionRules as trustRules } from '@/modules/trust';
import {
  privacyHandler as verification,
  retentionRules as verificationRules,
} from '@/modules/verification';

const RULE_KEY = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export type PrivacyRegistry = {
  handlers: readonly PrivacyHandler[];
  rules: readonly RetentionRule[];
  handlerFor(module: string): PrivacyHandler;
  tableOwners: ReadonlyMap<string, string>;
};

export function buildPrivacyRegistry(
  entries: readonly { handler: PrivacyHandler; rules: readonly RetentionRule[] }[],
): PrivacyRegistry {
  const handlers: PrivacyHandler[] = [];
  const rules: RetentionRule[] = [];
  const tableOwners = new Map<string, string>();
  const seenModules = new Set<string>();
  const seenRules = new Set<string>();

  for (const entry of entries) {
    const name = entry.handler.module;
    if (seenModules.has(name)) {
      throw new Error(`Privacy module "${name}" is registered twice`);
    }
    seenModules.add(name);
    handlers.push(entry.handler);

    for (const table of entry.handler.tables) {
      const owner = tableOwners.get(table);
      if (owner) {
        throw new Error(`Table "${table}" is claimed by both ${owner} and ${name}`);
      }
      tableOwners.set(table, name);
    }

    for (const rule of entry.rules) {
      if (seenRules.has(rule.key)) {
        throw new Error(`Retention rule "${rule.key}" is registered twice`);
      }
      if (!RULE_KEY.test(rule.key)) {
        throw new Error(`Retention rule key "${rule.key}" must look like <module>.<what>`);
      }
      seenRules.add(rule.key);
      rules.push(rule);
    }
  }

  return {
    handlers,
    rules,
    handlerFor(name: string): PrivacyHandler {
      const found = handlers.find((handler) => handler.module === name);
      if (!found) throw new Error(`No privacy handler for module "${name}"`);
      return found;
    },
    tableOwners,
  };
}

function entry(
  handler: PrivacyHandler,
  rules: readonly RetentionRule[],
): { handler: PrivacyHandler; rules: readonly RetentionRule[] } {
  return { handler, rules };
}

/** Every module that owns personal data. */
export const privacyRegistry: PrivacyRegistry = buildPrivacyRegistry([
  entry(identity, identityRules),
  entry(orgs, orgsRules),
  entry(media, mediaRules),
  entry(notifications, notificationsRules),
  entry(trust, trustRules),
  entry(jobs, jobsRules),
  entry(audit, auditRules),
  entry(settings, settingsRules),
  entry(operator, operatorRules),
  entry(entitlements, entitlementsRules),
  entry(billing, billingRules),
  entry(locations, locationsRules),
  entry(listings, listingsRules),
  entry(hostpages, hostpagesRules),
  entry(verification, verificationRules),
  entry(discovery, discoveryRules),
  entry(landing, landingRules),
  entry(profiles, profilesRules),
  entry(applications, applicationsRules),
  entry(safety, safetyRules),
  entry(hiring, hiringRules),
  entry(messaging, messagingRules),
  entry(analytics, analyticsRules),
  entry(addons, addonsRules),
  entry(boosts, boostsRules),
  entry(announcements, announcementsRules),
  entry(promote, promoteRules),
  entry(community, communityRules),
  entry(privacy, privacyRules),
  entry(support, supportRules),
  entry(content, contentRules),
  entry(launch, launchRules),
]);
