// W0 stub. The owning workstream replaces the body and keeps the name.
export async function getReplyStats(..._args: unknown[]) {
  return { conversations: 0, medianFirstReplyMinutes: null, usuallyRepliesWithinDay: false };
}

export async function runMessagingDaily(..._args: unknown[]): Promise<void> {}
