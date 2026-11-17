import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import type { NoteToScan } from '@/modules/hiring/notes';
import { messagingFake } from '@tests/fakes/sp5/messaging';
import { orgsFake } from '@tests/fakes/sp5/sp2';
import { createTestDb, type TestDb } from '@tests/helpers/db';

const { loadInviteNote, releaseInviteNote } = vi.hoisted(() => ({
  loadInviteNote: vi.fn<(db: Db, id: string) => Promise<NoteToScan | null>>(),
  releaseInviteNote: vi.fn(async () => {}),
}));

vi.mock('@/modules/hiring/invites/notes', () => ({ loadInviteNote, releaseInviteNote }));
vi.mock('@/modules/hiring/interviews/notes', () => ({
  loadInterviewNote: vi.fn(),
  releaseInterviewNote: vi.fn(),
}));
vi.mock('@/modules/hiring/offers/notes', () => ({
  loadOfferNote: vi.fn(),
  releaseOfferNote: vi.fn(),
}));
vi.mock('@/modules/messaging', async (orig) => ({
  ...(await orig<typeof import('@/modules/messaging')>()),
  ...(await import('@tests/fakes/sp5/messaging')).messagingFake,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp5/sp2')).orgsFake,
}));

import { getNoteForReview, runNoteScan } from '@/modules/hiring/notes';

let t: TestDb;
const db = () => t.db as Db;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  loadInviteNote.mockReset();
  releaseInviteNote.mockClear();
  messagingFake.reset();
  orgsFake.reset();
});

describe('note dispatch', () => {
  it('releases a held note and stops when the note is already gone', async () => {
    const subjectId = newId();
    const orgId = newId();
    loadInviteNote.mockResolvedValue({ orgId, text: '__block__', createdAt: new Date(0) });
    await runNoteScan(db(), { subjectType: 'invite', subjectId });
    expect(releaseInviteNote).toHaveBeenCalledWith(
      expect.anything(),
      subjectId,
      expect.objectContaining({ state: 'held' }),
    );

    loadInviteNote.mockResolvedValue(null);
    messagingFake.reset();
    await runNoteScan(db(), { subjectType: 'invite', subjectId });
    expect(messagingFake.calls.map((call) => call.name)).not.toContain('scanHostText');
  });

  it('returns the note text and the organization name', async () => {
    const subjectId = newId();
    const orgId = newId();
    const createdAt = new Date('2026-11-02T00:00:00.000Z');
    orgsFake.setOrgName(orgId, 'Kettle Ridge Lodge');
    loadInviteNote.mockResolvedValue({ orgId, text: 'See you at the lodge', createdAt });
    await expect(getNoteForReview(db(), { subjectType: 'invite', subjectId })).resolves.toEqual({
      text: 'See you at the lodge',
      orgName: 'Kettle Ridge Lodge',
      sentAt: createdAt,
    });
  });

  it('ignores an empty scan payload', async () => {
    await expect(runNoteScan(db(), {})).resolves.toBeUndefined();
    expect(loadInviteNote).not.toHaveBeenCalled();
  });
});
