// In-memory SP4 for SP5 tests.
import { canTransition, type Actor, type ApplicationStatus, type SetStatusInput } from '@/lib/applications';
import type { DbOrTx } from '@/lib/db';
import { conflict, forbidden, notFound } from '@/lib/errors';
import type { ApplicationSnapshotV1, HostApplicationCard } from '@/lib/applications';
import type { CandidateCard, CommunityIdentity, FitInputs, PoolCard } from '@/lib/profiles';
import type { Party, Relationship, ReportSubjectRegistration, ReportSubjectType } from '@/lib/safety';

type Applications = typeof import('@/modules/applications');
type Profiles = typeof import('@/modules/profiles');
type Safety = typeof import('@/modules/safety');
type Call = { name: string; args: unknown[] };

const WITHDRAWABLE: readonly ApplicationStatus[] = ['new', 'shortlisted', 'interviewing', 'offered'];

type AppRow = {
  id: string;
  orgId: string;
  seekerUserId: string;
  listingId: string;
  status: ApplicationStatus;
};

const apps = new Map<string, AppRow>();
const appCalls: Call[] = [];

export function resetApplications(): void {
  apps.clear();
  appCalls.length = 0;
}

export function seedApplication(i: {
  id: string;
  orgId: string;
  seekerUserId: string;
  listingId?: string;
  status?: ApplicationStatus;
}): void {
  apps.set(i.id, {
    id: i.id,
    orgId: i.orgId,
    seekerUserId: i.seekerUserId,
    listingId: i.listingId ?? i.id,
    status: i.status ?? 'new',
  });
}

function setStatus(
  _tx: DbOrTx,
  i: SetStatusInput,
): Promise<{ ok: true } | { ok: false; current: ApplicationStatus }> {
  appCalls.push({ name: 'setStatus', args: [i] });
  const row = apps.get(i.applicationId);
  if (!row) return Promise.reject(notFound('Application not found'));
  if (i.actor.type === 'host' && i.actor.orgId !== row.orgId) return Promise.reject(forbidden());
  if (i.actor.type === 'seeker' && i.actor.userId !== row.seekerUserId) return Promise.reject(forbidden());
  if (!i.from.includes(row.status)) return Promise.resolve({ ok: false, current: row.status });
  if (!canTransition(row.status, i.to, i.actor.type)) {
    return Promise.reject(forbidden('That change is not allowed.', { reason: 'transition_not_allowed' }));
  }
  row.status = i.to;
  return Promise.resolve({ ok: true });
}

function withdraw(
  _tx: DbOrTx,
  i: { applicationId: string; seekerUserId: string; reason?: string; note?: string },
): Promise<void> {
  appCalls.push({ name: 'withdraw', args: [i] });
  const row = apps.get(i.applicationId);
  if (!row || row.seekerUserId !== i.seekerUserId) return Promise.reject(notFound('Application not found'));
  if (row.status === 'withdrawn') return Promise.resolve();
  if (!WITHDRAWABLE.includes(row.status)) {
    return Promise.reject(conflict("This application can't be withdrawn.", { reason: 'not_withdrawable' }));
  }
  row.status = 'withdrawn';
  return Promise.resolve();
}

async function getHostCards(
  _db: DbOrTx,
  _i: { orgId: string; applicationIds: string[] },
): Promise<HostApplicationCard[]> {
  appCalls.push({ name: 'getHostCards', args: [_i] });
  return [];
}

async function getSnapshot(
  _db: DbOrTx,
  _i: { orgId: string; applicationId: string },
): Promise<ApplicationSnapshotV1 | null> {
  appCalls.push({ name: 'getSnapshot', args: [_i] });
  return null;
}

export const applicationsFake = {
  setStatus,
  withdraw,
  getHostCards,
  getSnapshot,
  seedApplication,
  reset: resetApplications,
  calls: appCalls,
} satisfies Partial<Applications> & {
  seedApplication: typeof seedApplication;
  reset: typeof resetApplications;
  calls: Call[];
};

type Seeker = { card: PoolCard; inputs: FitInputs };
const seekers = new Map<string, Seeker>();
const revealed = new Set<string>();
const profileCalls: Call[] = [];

export function resetProfiles(): void {
  seekers.clear();
  revealed.clear();
  profileCalls.length = 0;
}

export function setPoolSeeker(card: PoolCard, inputs: FitInputs): void {
  seekers.set(card.seekerUserId, { card, inputs });
}

export function setRevealed(orgId: string, userId: string): void {
  revealed.add(`${orgId}:${userId}`);
}

async function getFitInputs(_db: DbOrTx, seekerUserIds: string[]): Promise<FitInputs[]> {
  profileCalls.push({ name: 'getFitInputs', args: [seekerUserIds] });
  return seekerUserIds.flatMap((id) => {
    const row = seekers.get(id);
    return row ? [row.inputs] : [];
  });
}

async function queryPoolCandidates(
  _db: DbOrTx,
  i: { listing: unknown; limit: number; after?: string },
): Promise<{ items: PoolCard[]; next: string | null }> {
  profileCalls.push({ name: 'queryPoolCandidates', args: [i] });
  const items = [...seekers.values()].map((row) => row.card).slice(0, i.limit);
  return { items, next: null };
}

async function getCandidateCards(
  _db: DbOrTx,
  i: { orgId: string; seekerUserIds: string[]; stage: 'pool' | 'interested' },
): Promise<CandidateCard[]> {
  profileCalls.push({ name: 'getCandidateCards', args: [i] });
  if (i.stage === 'interested') return [];
  return i.seekerUserIds.flatMap((id) => {
    const row = seekers.get(id);
    return row ? [{ stage: 'pool' as const, card: row.card }] : [];
  });
}

async function grantReveal(
  _db: DbOrTx,
  i: { seekerUserId: string; orgId: string; reason: 'applied' | 'invite_interested'; sourceId: string },
): Promise<{ created: boolean }> {
  profileCalls.push({ name: 'grantReveal', args: [i] });
  const key = `${i.orgId}:${i.seekerUserId}`;
  const created = !revealed.has(key);
  revealed.add(key);
  return { created };
}

async function getCommunityIdentities(
  _db: DbOrTx,
  _userIds: string[],
): Promise<Map<string, CommunityIdentity>> {
  profileCalls.push({ name: 'getCommunityIdentities', args: [_userIds] });
  return new Map();
}

export const profilesFake = {
  getFitInputs,
  queryPoolCandidates,
  getCandidateCards,
  grantReveal,
  getCommunityIdentities,
  setPoolSeeker,
  setRevealed,
  reset: resetProfiles,
  calls: profileCalls,
} satisfies Partial<Profiles> & {
  setPoolSeeker: typeof setPoolSeeker;
  setRevealed: typeof setRevealed;
  reset: typeof resetProfiles;
  calls: Call[];
};

const blocked = new Set<string>();
const muted = new Set<string>();
const subjects: { type: ReportSubjectType; registration: ReportSubjectRegistration }[] = [];
const safetyCalls: Call[] = [];

function pairKey(orgId: string, userId: string): string {
  return `${orgId}:${userId}`;
}

export function resetSafety(): void {
  blocked.clear();
  muted.clear();
  subjects.length = 0;
  safetyCalls.length = 0;
}

export function setBlocked(orgId: string, userId: string): void {
  blocked.add(pairKey(orgId, userId));
}

export function setMuted(orgId: string, userId: string): void {
  muted.add(pairKey(orgId, userId));
}

function parties(a: Party, b: Party): { orgId: string; userId: string } | null {
  const org = a.type === 'org' ? a : b.type === 'org' ? b : null;
  const user = a.type === 'user' ? a : b.type === 'user' ? b : null;
  if (!org || !user) return null;
  return { orgId: org.id, userId: user.id };
}

async function getRelationships(
  _db: DbOrTx,
  i: { orgId: string; seekerUserIds: string[] },
): Promise<Relationship[]> {
  safetyCalls.push({ name: 'getRelationships', args: [i] });
  return i.seekerUserIds.map((seekerUserId) => ({
    seekerUserId,
    blocked: blocked.has(pairKey(i.orgId, seekerUserId)),
    muted: muted.has(pairKey(i.orgId, seekerUserId)),
  }));
}

async function isBlockedBetween(
  _db: DbOrTx,
  a: Party,
  b: Party,
): Promise<{ blocked: boolean; byA: boolean; byB: boolean }> {
  safetyCalls.push({ name: 'isBlockedBetween', args: [a, b] });
  const ids = parties(a, b);
  const hit = ids !== null && blocked.has(pairKey(ids.orgId, ids.userId));
  return { blocked: hit, byA: hit && a.type === 'org', byB: hit && b.type === 'org' };
}

async function mute(_db: DbOrTx, i: { userId: string; orgId: string }): Promise<void> {
  safetyCalls.push({ name: 'mute', args: [i] });
  muted.add(pairKey(i.orgId, i.userId));
}

function registerReportSubject(type: ReportSubjectType, registration: ReportSubjectRegistration): void {
  safetyCalls.push({ name: 'registerReportSubject', args: [type] });
  subjects.push({ type, registration });
}

export const safetyFake = {
  getRelationships,
  isBlockedBetween,
  mute,
  registerReportSubject,
  setBlocked,
  setMuted,
  reset: resetSafety,
  calls: safetyCalls,
  subjects,
} satisfies Partial<Safety> & {
  setBlocked: typeof setBlocked;
  setMuted: typeof setMuted;
  reset: typeof resetSafety;
  calls: Call[];
  subjects: typeof subjects;
};
