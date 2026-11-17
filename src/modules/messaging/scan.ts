// W0 stub. The owning workstream replaces the body and keeps the name.
import type { Db } from '@/lib/db';

export async function scanHostText(
  _db: Db,
  _i: {
    subjectType: 'message' | 'invite' | 'interview' | 'offer' | 'bulk_message';
    subjectId: string;
    text: string;
    orgId: string;
  },
): Promise<{ state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] }> {
  throw new Error('not implemented: scanHostText (W4)');
}

export async function runMessageScan(..._args: unknown[]): Promise<void> {}
