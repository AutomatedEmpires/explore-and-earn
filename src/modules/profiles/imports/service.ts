// The resume import lifecycle: create, read, cancel and consent (SP4 spec 8.6). W0 stub: W3
// implements it (Task 15).
import type { Db, DbOrTx } from '@/lib/db';
import type { ImportStatus, ImportView } from '@/lib/profiles';

/** Stores the consent, creates the profile row if needed and queues the extraction. */
export async function createImport(
  _db: Db,
  _userId: string,
  _i: { mediaId: string; consentVersion: 'resume_import@1' },
): Promise<{ importId: string; status: ImportStatus }> {
  throw new Error('not implemented: createImport');
}

export async function getImport(
  _db: DbOrTx,
  _userId: string,
  _importId: string,
): Promise<ImportView> {
  throw new Error('not implemented: getImport');
}

export async function cancelImport(_db: Db, _userId: string, _importId: string): Promise<void> {
  throw new Error('not implemented: cancelImport');
}

/** Revokes AI consent and cancels an active import. */
export async function revokeAiConsent(_db: Db, _userId: string): Promise<void> {
  throw new Error('not implemented: revokeAiConsent');
}
