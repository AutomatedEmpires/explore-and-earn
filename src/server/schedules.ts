// Recurring outbox topics. The scheduler enqueues each topic when its cron expression is due
// (UTC). Shared touchpoint: each workstream appends its own line(s) to the list.
export const schedules: { topic: string; cron: string }[] = [
  // W5 trust: move overdue review items on, and alert the Owner when nobody can take one.
  { topic: 'review.sla_sweep', cron: '*/5 * * * *' },
  // W5 trust: copy a random share of last week's automatic decisions into audit_sample.
  { topic: 'trust.audit_sample', cron: '0 9 * * 1' },
  // W6 notifications: close due batches and queue one digest per batch.
  { topic: 'notifications.flush_batches', cron: '* * * * *' },
];
