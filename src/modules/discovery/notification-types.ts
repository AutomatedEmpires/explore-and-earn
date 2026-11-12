// The discovery notification types (SP3 spec section 6 and 8.10, plan Task 29). The index
// imports this file for its defineType() side effects; alerts.ts sends them.
//
// | Type                     | Channels                     | Title                                   |
// |--------------------------|------------------------------|-----------------------------------------|
// | discovery.alert_match    | in-app, push                 | "3 new jobs for Ski resorts · CO", or   |
// |                          |                              | "5 new jobs for your alerts"            |
// | discovery.alert_daily    | in-app, email JobAlertDaily  | "New jobs for your alerts"              |
// | discovery.alert_weekly   | in-app, email JobAlertWeekly | "Your weekly job digest"                |
//
// All three are in the `alerts` category, so turning it off stops them. They name the search,
// never the seeker. A push for one search opens that search's newest jobs; a push for several
// opens /profile/alerts (Plan decision 10).
import {
  defineType,
  getType,
  type NotificationData,
  type NotificationTypeDef,
} from '@/modules/notifications';

export const ALERT_MATCH = 'discovery.alert_match';
export const ALERT_DAILY = 'discovery.alert_daily';
export const ALERT_WEEKLY = 'discovery.alert_weekly';

export const ALERTS_PAGE = '/profile/alerts';

/** "1 new job" or "N new jobs". */
export function newJobs(n: number): string {
  return `${n} new job${n === 1 ? '' : 's'}`;
}

function countOf(d: NotificationData): number {
  return typeof d.count === 'number' && Number.isFinite(d.count)
    ? Math.max(0, Math.trunc(d.count))
    : 0;
}

function textOf(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** A path on the app, or the alerts page. */
function pathOf(d: NotificationData): string {
  const url = textOf(d.url);
  return url && url.startsWith('/') && !url.startsWith('//') ? url : ALERTS_PAGE;
}

/** Defines a type once, so a module that loads twice (dev reloads) never throws. */
function define(def: NotificationTypeDef): void {
  if (!getType(def.type)) defineType(def);
}

define({
  type: ALERT_MATCH,
  category: 'alerts',
  title: (d) => {
    const name = textOf(d.name);
    return `${newJobs(countOf(d))} for ${name ?? 'your alerts'}`;
  },
  body: () => 'Open Explore&Earn to see them.',
  url: pathOf,
  push: true,
});

define({
  type: ALERT_DAILY,
  category: 'alerts',
  title: () => 'New jobs for your alerts',
  body: (d) => `${newJobs(countOf(d))} across your saved searches.`,
  url: () => ALERTS_PAGE,
  email: { template: 'JobAlertDaily' },
});

define({
  type: ALERT_WEEKLY,
  category: 'alerts',
  title: () => 'Your weekly job digest',
  body: (d) => `${newJobs(countOf(d))} this week.`,
  url: () => ALERTS_PAGE,
  email: { template: 'JobAlertWeekly' },
});
