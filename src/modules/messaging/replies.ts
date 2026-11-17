// W0 stub. The owning workstream replaces the body and keeps the name.
import type { DbOrTx } from '@/lib/db';

export async function listSavedReplies(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: listSavedReplies (W4)');
}

export async function createSavedReply(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: createSavedReply (W4)');
}

export async function updateSavedReply(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: updateSavedReply (W4)');
}

export async function deleteSavedReply(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: deleteSavedReply (W4)');
}

export async function getNotSelectedMessage(
  _db: DbOrTx,
  _orgId: string,
): Promise<{ body: string; isDefault: boolean }> {
  throw new Error('not implemented: getNotSelectedMessage (W4)');
}

export async function setNotSelectedMessage(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: setNotSelectedMessage (W4)');
}
