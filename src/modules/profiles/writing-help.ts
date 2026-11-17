// Writing help for the headline, bio and experience descriptions (SP4 spec 8.6). W0 stub: W3
// implements it (Task 18). Nothing it returns is saved automatically.
import type { DbOrTx } from '@/lib/db';
import type { WritingHelpInput } from '@/lib/profiles';

/** Up to 3 suggestions. */
export async function writingHelp(
  _db: DbOrTx,
  _userId: string,
  _i: WritingHelpInput,
): Promise<{ suggestions: string[] }> {
  throw new Error('not implemented: writingHelp');
}
