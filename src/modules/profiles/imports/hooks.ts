// Other modules declare the media ids they reference, so import expiry never deletes a file
// still in use (applications/register.ts registers one, Task 21). W0 stub: W3 implements it
// (Task 18). Registration is a no-op until then.
import type { DbOrTx } from '@/lib/db';

/** `fn` returns the subset of `mediaIds` it references. */
export function registerResumeMediaReferences(
  _fn: (db: DbOrTx, mediaIds: string[]) => Promise<string[]>,
): void {}

/** Internal (not exported from the index): marks an import's source file as the seeker's resume. */
export async function markImportSourceInUse(
  _db: DbOrTx,
  _userId: string,
  _mediaId: string,
): Promise<void> {}
