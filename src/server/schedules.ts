// Recurring outbox topics. The scheduler enqueues each topic when its cron expression is due
// (UTC). Shared touchpoint: each workstream appends its own line(s) to the list.
export const schedules: { topic: string; cron: string }[] = [
  // W5 trust: move overdue review items on, and alert the Owner when nobody can take one.
  { topic: 'review.sla_sweep', cron: '*/5 * * * *' },
  // W5 trust: copy a random share of last week's automatic decisions into audit_sample.
  { topic: 'trust.audit_sample', cron: '0 9 * * 1' },
  // W6 notifications: close due batches and queue one digest per batch.
  { topic: 'notifications.flush_batches', cron: '* * * * *' },
  // SP2 W5 listings: "Still hiring?" reminders, fixed-end-date closes and repost reminders.
  { topic: 'listings.still_hiring_sweep', cron: '0 * * * *' },
  { topic: 'listings.auto_close', cron: '5 * * * *' },
  { topic: 'listings.repost_reminders', cron: '0 15 * * *' },
  // SP2 W4 locations: NWS weather for entitled orgs' locations.
  { topic: 'locations.refresh_weather', cron: '*/30 * * * *' },
  // SP2 W2 billing: monthly invite credits, founding trial ends after launch, Stripe drift.
  { topic: 'billing.grant_monthly_credits', cron: '10 0 * * *' },
  { topic: 'billing.apply_launch_date', cron: '20 * * * *' },
  { topic: 'billing.reconcile', cron: '0 7 * * *' },
  // SP3 discovery: the nightly drift repair, saved-search matching, the daily and weekly alert
  // emails, and the listing event rollup and retention.
  { topic: 'discovery.drift_check', cron: '30 3 * * *' },
  { topic: 'discovery.alerts_match', cron: '*/15 * * * *' },
  { topic: 'discovery.alerts_daily', cron: '0 14 * * *' },
  { topic: 'discovery.alerts_weekly', cron: '0 14 * * 1' },
  { topic: 'discovery.maintenance', cron: '15 4 * * *' },
  // SP4 profiles: expire unmerged resume imports (hourly) and the availability reminders and
  // stale step (daily).
  { topic: 'profiles.import_expire', cron: '15 * * * *' },
  { topic: 'profiles.availability_sweep', cron: '0 15 * * *' },
];
