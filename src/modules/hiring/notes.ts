// Note scan: enqueue a check, run it, and hand a held note to review.
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { withTx } from '@/lib/db';
// The jobs index loads the worker, which loads every handler, including this module.
// eslint-disable-next-line no-restricted-imports
import { enqueue } from '@/modules/jobs/outbox';
import { getOrgSummaries } from '@/modules/orgs';
import { scanHostText } from '@/modules/messaging';
import { loadInterviewNote, releaseInterviewNote } from './interviews/notes';
import { loadInviteNote, releaseInviteNote } from './invites/notes';
import { loadOfferNote, releaseOfferNote } from './offers/notes';

export type NoteToScan = { orgId: string; text: string; createdAt: Date };
export type ScanOutcome = { state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] };

type SubjectType = 'invite' | 'interview' | 'offer';

type NoteLoader = (db: DbOrTx, id: string) => Promise<NoteToScan | null>;
type NoteReleaser = (tx: Tx, id: string, outcome: ScanOutcome) => Promise<void>;

const loaders: Record<SubjectType, NoteLoader> = {
  invite: loadInviteNote as NoteLoader,
  interview: loadInterviewNote as NoteLoader,
  offer: loadOfferNote as NoteLoader,
};

const releasers: Record<SubjectType, NoteReleaser> = {
  invite: releaseInviteNote as NoteReleaser,
  interview: releaseInterviewNote as NoteReleaser,
  offer: releaseOfferNote as NoteReleaser,
};

function subjectOf(payload: unknown): { subjectType: SubjectType; subjectId: string } | null {
  if (!payload || typeof payload !== 'object') return null;
  const row = payload as { subjectType?: unknown; subjectId?: unknown };
  if (row.subjectType !== 'invite' && row.subjectType !== 'interview' && row.subjectType !== 'offer') return null;
  if (typeof row.subjectId !== 'string' || row.subjectId.length === 0) return null;
  return { subjectType: row.subjectType, subjectId: row.subjectId };
}

export async function enqueueNoteScan(tx: Tx, subjectType: SubjectType, subjectId: string): Promise<void> {
  await enqueue(tx, {
    topic: 'hiring.scan_note',
    dedupeKey: `note:${subjectType}:${subjectId}`,
    payload: { subjectType, subjectId },
  });
}

export async function runNoteScan(db: Db, payload: unknown): Promise<void> {
  const subject = subjectOf(payload);
  if (!subject) return;
  const note = await loaders[subject.subjectType](db, subject.subjectId);
  if (!note) return;
  const outcome = await scanHostText(db, {
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    text: note.text,
    orgId: note.orgId,
  });
  await withTx(db, async (tx) => {
    await releasers[subject.subjectType](tx, subject.subjectId, outcome);
  });
}

export async function getNoteForReview(
  db: DbOrTx,
  i: { subjectType: SubjectType; subjectId: string },
): Promise<{ text: string; orgName: string; sentAt: Date } | null> {
  const note = await loaders[i.subjectType](db, i.subjectId);
  if (!note) return null;
  const orgs = await getOrgSummaries(db, [note.orgId]);
  return { text: note.text, orgName: orgs.get(note.orgId)?.name ?? 'Org', sentAt: note.createdAt };
}
