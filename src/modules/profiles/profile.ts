// The seeker's own profile, its snapshot, community identities and preference targets (SP4 spec
// 3.2). W0 stub: W1 implements it (Task 8). Read stubs return neutral values.
import type { Db, DbOrTx } from '@/lib/db';
import type {
  CommunityIdentity,
  OwnProfileDto,
  PreferenceTargets,
  ProfilePatch,
  ProfileSnapshotV1,
} from '@/lib/profiles';

/** The owner's view, with defaults before the first write (version 0). */
export async function getOwnProfile(_db: DbOrTx, _userId: string): Promise<OwnProfileDto> {
  throw new Error('not implemented: getOwnProfile');
}

export async function updateProfile(
  _db: Db,
  _userId: string,
  _patch: ProfilePatch,
): Promise<OwnProfileDto> {
  throw new Error('not implemented: updateProfile');
}

/** The live profile as a snapshot; workAuthorization only for applications. */
export async function buildProfileSnapshot(
  _db: DbOrTx,
  _userId: string,
  _o: { includeWorkAuthorization: boolean },
): Promise<ProfileSnapshotV1> {
  throw new Error('not implemented: buildProfileSnapshot');
}

/** SP7's community names (the full profile name) and avatars, by user id. */
export async function getCommunityIdentities(
  _db: DbOrTx,
  _userIds: string[],
): Promise<Map<string, CommunityIdentity>> {
  return new Map();
}

/** For SP6 feed targeting only. */
export async function getPreferenceTargets(
  _db: DbOrTx,
  _userId: string,
): Promise<PreferenceTargets> {
  return { categories: [], states: [] };
}

/** Whether the Profile tab shows its dot (a missing item while visible to hosts). */
export async function needsAttention(_db: DbOrTx, _userId: string): Promise<boolean> {
  return false;
}
