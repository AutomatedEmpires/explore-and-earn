// W0 stub. The owning workstream replaces the body and keeps the name.
export async function unreadThreadCount(..._args: unknown[]): Promise<number> {
  return 0;
}

export async function markThreadRead(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: markThreadRead (W4)');
}
