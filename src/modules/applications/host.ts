// Host reads and their authorization (SP4 spec 3.2 and 10): host* means owner, admin or
// recruiter, plus canAccessListing; anything else is 403 or 404. W0 stub: W4 implements it
// (Task 23).
import type { Db, DbOrTx } from '@/lib/db';
import type {
  ApplicationSnapshotV1,
  HostApplicationCard,
  HostApplicationDto,
  HostApplicationRef,
} from '@/lib/applications';
import type { HostContext } from '@/server/guards';

export async function authorizeHostApplication(
  _db: DbOrTx,
  _host: HostContext,
  _applicationId: string,
): Promise<HostApplicationRef> {
  throw new Error('not implemented: authorizeHostApplication');
}

/** Audited (`applications.snapshot_viewed`). */
export async function getHostApplication(
  _db: Db,
  _host: HostContext,
  _applicationId: string,
): Promise<HostApplicationDto> {
  throw new Error('not implemented: getHostApplication');
}

/** Org-scoped; the caller (SP5) enforces listing scope. */
export async function getHostCards(
  _db: DbOrTx,
  _i: { orgId: string; applicationIds: string[] },
): Promise<HostApplicationCard[]> {
  throw new Error('not implemented: getHostCards');
}

/** Org-scoped; the caller (SP5) enforces listing scope. */
export async function getSnapshot(
  _db: DbOrTx,
  _i: { orgId: string; applicationId: string },
): Promise<ApplicationSnapshotV1 | null> {
  throw new Error('not implemented: getSnapshot');
}
