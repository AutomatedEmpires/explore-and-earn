// Note-scan types. runNoteScan stays a no-op until Task 8.
export type NoteToScan = { orgId: string; text: string; createdAt: Date };
export type ScanOutcome = { state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] };

export async function enqueueNoteScan(..._args: unknown[]): Promise<void> {
  throw new Error('not implemented: enqueueNoteScan (W0)');
}

export async function runNoteScan(..._args: unknown[]): Promise<void> {}

export async function getNoteForReview(
  ..._args: unknown[]
): Promise<{ text: string; orgName: string; sentAt: Date } | null> {
  throw new Error('not implemented: getNoteForReview (W0)');
}
