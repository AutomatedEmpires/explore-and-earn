export function runPlaceholderJob(jobName: string) {
  // TODO: Add real job runners after queueing, SLA, and retry policies are
  // approved for implementation.
  return `placeholder-job:${jobName}`;
}