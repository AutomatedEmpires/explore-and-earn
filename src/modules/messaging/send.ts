// W0 stub. The owning workstream replaces the body and keeps the name.
import type { Tx } from '@/lib/db';

export async function sendHostMessage(
  _tx: Tx,
  _i: { threadId: string; senderUserId: string; body: string; bulkId?: string },
): Promise<string | null> {
  throw new Error('not implemented: sendHostMessage (W4)');
}

export async function sendMessage(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: sendMessage (W4)');
}
