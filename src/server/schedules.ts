// Recurring outbox topics. The scheduler enqueues each topic when its cron expression is due
// (UTC). Shared touchpoint: each workstream appends its own line(s) to the list.
export const schedules: { topic: string; cron: string }[] = [
  { topic: 'notifications.flush_batches', cron: '* * * * *' },
];
