// Recurring outbox topics. The scheduler enqueues each topic when its cron expression is due
// (UTC). Shared touchpoint: each workstream appends its own line(s) to the list.
export const schedules: { topic: string; cron: string }[] = [
  // W5 trust: move overdue review items on, and alert the Owner when nobody can take one.
  { topic: 'review.sla_sweep', cron: '*/5 * * * *' },
];
