// Builder drafts (spec failure mode 5): per-section autosave with conflicts, recruiter scopes,
// copy, paste import, AI description and deletion.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { orgsFake } from '../../../tests/fakes/sp2/orgs';
import {
  buildListingContent,
  seedHostOrg,
  seedMember,
  type SeededOrg,
} from '../../../tests/helpers/sp2';
import {
  createListing,
  deleteListing,
  generateDescription,
  getListingForEditor,
  patchDraft,
} from './index';

vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));

let t: TestDb;
let db: Db;
let org: SeededOrg;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  orgsFake.reset();
  org = await seedHostOrg(db);
});

/** Resolves to the AppError a call rejects with. */
async function appError(p: Promise<unknown>): Promise<AppError> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

const reasonOf = (e: AppError) => (e.details as { reason?: string } | undefined)?.reason;

async function listingRow(id: string) {
  const [row] = await queryRows<{
    title: string | null;
    draft_version: number;
    provenance: string;
    ai_filled_fields: string[];
    copied_from_id: string | null;
    draft: Record<string, unknown>;
  }>(db, sql`select * from app.listings where id = ${id}`);
  return row;
}

const actions = async (subjectId: string) =>
  (
    await queryRows<{ action: string }>(
      db,
      sql`select action from app.audit_events where subject_id = ${subjectId} order by created_at`,
    )
  ).map((r) => r.action);

const PASTE =
  'Deckhand wanted for the summer salmon season in Kodiak. Good pay, long days on deck, and a crew that looks out for each other.';
const STUB = 'STUB_JSON: {"basics":{"title":"Deckhand"},"housing":{"provided":true}}';

describe('patchDraft', () => {
  it('versions each section on its own and conflicts only on the same section', async () => {
    const { id, openSection } = await createListing(db, org.owner.ctx, { start: 'blank' });
    expect(openSection).toBe('basics');

    const first = await patchDraft(db, org.owner.ctx, id, {
      section: 'basics',
      baseVersion: 0,
      data: { basics: { title: 'Lift Operator' } },
    });
    expect(first.sectionVersions.basics).toBe(1);
    expect(first.draftVersion).toBe(1);
    expect((await listingRow(id))?.title).toBe('Lift Operator');

    const err = await appError(
      patchDraft(db, org.owner.ctx, id, {
        section: 'basics',
        baseVersion: 0,
        data: { basics: { title: 'Something else' } },
      }),
    );
    expect(err.code).toBe('conflict');
    expect(err.details).toEqual({
      reason: 'section_conflict',
      section: 'basics',
      version: 1,
      data: { basics: { title: 'Lift Operator' } },
    });

    const pay = await patchDraft(db, org.owner.ctx, id, {
      section: 'pay',
      baseVersion: 0,
      data: { pay: { minCents: 1900, unit: 'hour' } },
    });
    expect(pay.sectionVersions).toEqual({ basics: 1, pay: 1 });
    expect(pay.draftVersion).toBe(2);
    expect(pay.checklist.find((s) => s.section === 'pay')?.complete).toBe(false);

    await patchDraft(db, org.owner.ctx, id, {
      section: 'basics',
      baseVersion: 1,
      data: { basics: { title: 'Chairlift Operator' } },
    });
    const row = await listingRow(id);
    expect(row?.draft_version).toBe(3);
    expect(row?.title).toBe('Chairlift Operator');
  });

  it('rejects data outside the section', async () => {
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    const err = await appError(
      patchDraft(db, org.owner.ctx, id, {
        section: 'basics',
        baseVersion: 0,
        data: { pay: { minCents: 1 } },
      }),
    );
    expect(err.code).toBe('bad_request');
  });

  it('enqueues one photo-slot check for a newly set housing photo', async () => {
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    const mediaId = newId();
    const housing = { provided: true, photos: { bathroom: mediaId } };
    await patchDraft(db, org.owner.ctx, id, {
      section: 'housing',
      baseVersion: 0,
      data: { housing },
    });
    await patchDraft(db, org.owner.ctx, id, {
      section: 'housing',
      baseVersion: 1,
      data: { housing: { ...housing, note: 'Shared bathroom' } },
    });
    const rows = await queryRows<{ dedupe_key: string; payload: unknown }>(
      db,
      sql`select dedupe_key, payload from app.outbox where topic = 'listings.photo_slot_check'
        and payload->>'listingId' = ${id}`,
    );
    expect(rows.map((r) => r.dedupe_key)).toEqual([`slot:${mediaId}:bathroom`]);
    expect(rows[0]?.payload).toEqual({ mediaId, slot: 'bathroom', listingId: id });
  });

  it('refuses a removed listing', async () => {
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    await db.execute(sql`update app.listings set state = 'removed' where id = ${id}`);
    const err = await appError(
      patchDraft(db, org.owner.ctx, id, { section: 'basics', baseVersion: 0, data: {} }),
    );
    expect(err.code).toBe('conflict');
  });
});

describe('recruiter scopes', () => {
  it("assigns an assigned Recruiter's new listing and keeps them to their locations", async () => {
    const recruiter = await seedMember(db, org.orgId, 'recruiter', { scope: 'assigned' });
    const l1 = newId();
    const l2 = newId();
    await db.execute(sql`
      insert into app.member_assignments (id, membership_id, location_id)
      values (${newId()}, ${recruiter.membershipId}, ${l1})
    `);

    const { id } = await createListing(db, recruiter.ctx, { start: 'blank' });
    const access = await orgsFake.getListingAccess(db, recruiter.ctx);
    expect(access.all ? [] : access.listingIds).toContain(id);

    await patchDraft(db, recruiter.ctx, id, {
      section: 'where_when',
      baseVersion: 0,
      data: { where: { mode: 'onsite', locationId: l1 } },
    });
    const err = await appError(
      patchDraft(db, recruiter.ctx, id, {
        section: 'where_when',
        baseVersion: 1,
        data: { where: { mode: 'onsite', locationId: l2 } },
      }),
    );
    expect(err.code).toBe('forbidden');
    expect(reasonOf(err)).toBe('location_not_in_scope');
  });

  it("hides another org's listing", async () => {
    const other = await seedHostOrg(db, { name: 'Salt and Pine' });
    const { id } = await createListing(db, other.owner.ctx, { start: 'blank' });
    expect((await appError(getListingForEditor(db, org.owner.ctx, id))).code).toBe('not_found');
    expect(
      (
        await appError(
          patchDraft(db, org.owner.ctx, id, { section: 'basics', baseVersion: 0, data: {} }),
        )
      ).code,
    ).toBe('not_found');
    expect((await appError(deleteListing(db, org.owner.ctx, id))).code).toBe('not_found');
  });

  it('hides a listing outside an assigned Recruiter scope', async () => {
    const recruiter = await seedMember(db, org.orgId, 'recruiter', { scope: 'assigned' });
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    expect((await appError(getListingForEditor(db, recruiter.ctx, id))).code).toBe('not_found');
  });
});

describe('createListing', () => {
  it('copies the latest content without dates or deadline and opens basics', async () => {
    const content = buildListingContent(
      {
        locationId: newId(),
        coverMediaId: newId(),
        housingPhotos: { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() },
      },
      (c) => {
        c.applying.deadline = '2027-05-01';
        c.applying.questions = [
          { id: 'q_boat', prompt: 'Have you worked on a boat?', required: true, type: 'yes_no' },
        ];
      },
    );
    const source = await createListing(db, org.owner.ctx, { start: 'blank' });
    await db.execute(
      sql`update app.listings set draft = ${JSON.stringify(content)}::jsonb where id = ${source.id}`,
    );

    const copy = await createListing(db, org.owner.ctx, { start: 'copy', listingId: source.id });
    expect(copy.openSection).toBe('basics');
    const row = await listingRow(copy.id);
    const draft = row?.draft as typeof content;
    expect(row?.copied_from_id).toBe(source.id);
    expect(draft.when.dates).toBeUndefined();
    expect(draft.when.weeklyHours).toBe(40);
    expect(draft.applying.deadline).toBeNull();
    expect(draft.applying.questions.map((q) => q.id)).toEqual(['q_boat']);
    expect(draft.photos.coverMediaId).toBe(content.photos.coverMediaId);
    expect(row?.title).toBe('Lift Operator');
    expect(await actions(copy.id)).toEqual(['listings.created']);
  });

  it('imports a pasted post, keeping housing only when the text mentions it', async () => {
    const { id, openSection } = await createListing(db, org.owner.ctx, {
      start: 'paste',
      text: `${PASTE}\n${STUB}`,
    });
    expect(openSection).toBe('basics');
    const row = await listingRow(id);
    expect(row?.draft).toEqual({ basics: { title: 'Deckhand' } });
    expect(row?.ai_filled_fields).toContain('basics.title');
    expect(row?.ai_filled_fields).not.toContain('housing.provided');
    expect(row?.provenance).toBe('imported');
    expect(row?.title).toBe('Deckhand');
    expect(await actions(id)).toEqual(['listings.created', 'listings.imported']);

    const withBunk = await createListing(db, org.owner.ctx, {
      start: 'paste',
      text: `${PASTE} Bunk on the boat is free.\n${STUB}`,
    });
    const kept = await listingRow(withBunk.id);
    expect(kept?.draft).toEqual({ basics: { title: 'Deckhand' }, housing: { provided: true } });
    expect(kept?.ai_filled_fields).toEqual(
      expect.arrayContaining(['basics.title', 'housing.provided']),
    );
  });

  it('fails a paste the AI cannot read, and a short one', async () => {
    const err = await appError(
      createListing(db, org.owner.ctx, { start: 'paste', text: `${PASTE} __fail__` }),
    );
    expect(err.code).toBe('internal');
    expect(err.message).toBe("We couldn't read that post. Start blank instead.");
    expect(reasonOf(err)).toBe('ai_unavailable');

    const short = await appError(
      createListing(db, org.owner.ctx, { start: 'paste', text: 'x'.repeat(49) }),
    );
    expect(short.code).toBe('bad_request');
  });

  it('drops a confirmed AI-filled field from the list', async () => {
    const { id } = await createListing(db, org.owner.ctx, {
      start: 'paste',
      text: `${PASTE}\nSTUB_JSON: {"basics":{"title":"Deckhand","openings":3}}`,
    });
    await patchDraft(db, org.owner.ctx, id, {
      section: 'basics',
      baseVersion: 0,
      data: { basics: { title: 'Deckhand', openings: 3 } },
      confirmedFields: ['basics.title'],
    });
    const editor = await getListingForEditor(db, org.owner.ctx, id);
    expect(editor.aiFilledFields).toEqual(['basics.openings']);

    // Editing a field drops it too.
    await patchDraft(db, org.owner.ctx, id, {
      section: 'basics',
      baseVersion: 1,
      data: { basics: { title: 'Deckhand', openings: 4 } },
    });
    expect((await getListingForEditor(db, org.owner.ctx, id)).aiFilledFields).toEqual([]);
  });
});

describe('getListingForEditor', () => {
  it('returns the draft, versions and checklist', async () => {
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    await patchDraft(db, org.owner.ctx, id, {
      section: 'basics',
      baseVersion: 0,
      data: { basics: { title: 'Lift Operator' } },
    });
    const editor = await getListingForEditor(db, org.owner.ctx, id);
    expect(editor).toMatchObject({
      listing: { id, state: 'draft', title: 'Lift Operator', firstPublishedAt: null },
      draft: { basics: { title: 'Lift Operator' } },
      draftVersion: 1,
      sectionVersions: { basics: 1 },
      live: null,
      pending: null,
      aiFilledFields: [],
    });
    expect(editor.checklist.map((s) => s.section)).toEqual([
      'basics',
      'where_when',
      'pay',
      'housing',
      'meals',
      'genre_details',
      'job',
      'photos',
      'applying',
    ]);
    const basics = editor.checklist[0];
    expect(basics?.complete).toBe(false);
    expect(basics?.missing).toContain('basics.primaryCategory');
    expect(basics?.missing).not.toContain('basics.title');
  });
});

describe('deleteListing', () => {
  it('deletes a never-published draft and refuses a published one', async () => {
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    await deleteListing(db, org.owner.ctx, id);
    expect(await listingRow(id)).toBeUndefined();
    expect(await actions(id)).toEqual(['listings.created', 'listings.deleted']);

    const published = await createListing(db, org.owner.ctx, { start: 'blank' });
    await db.execute(
      sql`update app.listings set first_published_at = now() where id = ${published.id}`,
    );
    expect((await appError(deleteListing(db, org.owner.ctx, published.id))).code).toBe('conflict');
  });
});

describe('generateDescription', () => {
  it('drafts a description from bullets, and fails softly', async () => {
    const { id } = await createListing(db, org.owner.ctx, { start: 'blank' });
    const { description } = await generateDescription(db, org.owner.ctx, id, [
      'Run the chairlift',
      'Help riders on and off',
    ]);
    expect(description).toContain('Run the chairlift');
    expect(description.length).toBeLessThanOrEqual(10_000);

    const err = await appError(generateDescription(db, org.owner.ctx, id, ['__fail__']));
    expect(err.code).toBe('internal');
    expect(reasonOf(err)).toBe('ai_unavailable');
    expect((await appError(generateDescription(db, org.owner.ctx, id, []))).code).toBe(
      'bad_request',
    );
  });
});
