// @vitest-environment jsdom
// Queue assignment is the console's access boundary (spec section 12): the queue list shows,
// and the item page opens, only what the signed-in operator's queues cover (Owners cover every
// queue), plus a decision waiting for a second sign-off they could give. On PGlite, with the
// session and the list's client controls mocked.
import { render, screen, within } from '@testing-library/react';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { claim, decide, openReviewItem, type Queue } from '@/modules/trust';
import type { OperatorContext } from '@/server/guards';
import { createTestDb, type TestDb } from '../../../../tests/helpers/db';

const dbHolder = vi.hoisted(() => ({ current: undefined as Db | undefined }));
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    getDb: () => {
      if (!dbHolder.current) throw new Error('test db not ready');
      return dbHolder.current;
    },
  };
});

const session = vi.hoisted(() => ({ operator: null as OperatorContext | null }));
vi.mock('../_lib/session', () => ({
  requireConsoleOperator: async () => {
    if (!session.operator) throw new Error('no operator');
    return session.operator;
  },
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// The list's client controls: the queue filter shows which queues it offers.
vi.mock('../_components/QueueFilters', () => ({
  QueueFilters: ({ queues }: { queues: readonly { value: string; label: string }[] }) => (
    <ul aria-label="Queue filter">
      {queues.map((q) => (
        <li key={q.value}>{q.value}</li>
      ))}
    </ul>
  ),
}));
vi.mock('../_components/ItemButtons', () => ({
  ClaimButton: () => null,
  CreateTestItemButton: () => null,
}));

const { default: QueuesPage } = await import('./page');
const { default: ReviewItemPage } = await import('./[id]/page');

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  dbHolder.current = t.db;
});

afterAll(async () => {
  dbHolder.current = undefined;
  await t.close();
});

beforeEach(async () => {
  await t.db.execute(sql`delete from app.review_actions`);
  await t.db.execute(sql`delete from app.review_notes`);
  await t.db.execute(sql`delete from app.review_items`);
  await t.db.execute(sql`delete from app.operators`);
  await t.db.execute(sql`delete from app.users`);
  session.operator = null;
});

async function addOperator(
  name: string,
  role: 'owner' | 'operator',
  queues: Queue[] = [],
): Promise<OperatorContext> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${name.toLowerCase()}@ops.test`}, ${name}, 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${id}, ${role}, ${`{${queues.join(',')}}`}::text[], 'away')
  `);
  return {
    user: { id, clerkUserId: `user_${id}`, accountType: 'operator', email: null },
    role,
    queues,
  };
}

const open = async (queue: Queue, reason: string) =>
  (
    await openReviewItem(t.db, {
      queue,
      subjectType: 'test_item',
      subjectId: newId(),
      reason,
    })
  ).id;

const itemPage = (id: string) => ReviewItemPage({ params: Promise.resolve({ id }) });
const queuesPage = (query: Record<string, string> = {}) =>
  QueuesPage({ searchParams: Promise.resolve(query) });

describe('review item page', () => {
  it('is not found for a moderation operator opening a child_safety item', async () => {
    const owner = await addOperator('Avery', 'owner');
    const bo = await addOperator('Bo', 'operator', ['moderation']);
    const childSafety = await open('child_safety', 'match');
    const moderation = await open('moderation', 'flagged');

    session.operator = bo;
    await expect(itemPage(childSafety)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(itemPage(moderation)).resolves.toBeTruthy();

    session.operator = owner;
    await expect(itemPage(childSafety)).resolves.toBeTruthy();
  });

  it('opens for an operator outside the queue who could give a waiting second sign-off', async () => {
    const owner = await addOperator('Avery', 'owner');
    const bo = await addOperator('Bo', 'operator', ['moderation']);
    const item = await open('child_safety', 'match');
    await claim(t.db, item, owner.user.id);
    await decide(t.db, item, owner.user.id, 'ban');

    session.operator = bo;
    await expect(itemPage(item)).resolves.toBeTruthy();
  });
});

describe('review queues page', () => {
  it('lists only the queues an operator covers, and offers only those', async () => {
    const bo = await addOperator('Bo', 'operator', ['moderation']);
    await open('child_safety', 'child safety item');
    await open('fraud', 'fraud item');
    await open('moderation', 'moderation item');

    session.operator = bo;
    render(await queuesPage());
    const table = screen.getByRole('table');
    expect(within(table).getByText(/moderation item/)).toBeInTheDocument();
    expect(within(table).queryByText(/child safety item/)).not.toBeInTheDocument();
    expect(within(table).queryByText(/fraud item/)).not.toBeInTheDocument();
    const filter = screen.getByRole('list', { name: 'Queue filter' });
    expect(
      within(filter)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['all', 'moderation']);
  });

  it('is not found for a queue the operator does not cover', async () => {
    session.operator = await addOperator('Bo', 'operator', ['moderation']);
    await expect(queuesPage({ queue: 'child_safety' })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(queuesPage({ queue: 'moderation' })).resolves.toBeTruthy();
  });

  it('shows an Owner every queue', async () => {
    session.operator = await addOperator('Avery', 'owner');
    await open('child_safety', 'child safety item');
    await open('fraud', 'fraud item');

    render(await queuesPage());
    const table = screen.getByRole('table');
    expect(within(table).getByText(/child safety item/)).toBeInTheDocument();
    expect(within(table).getByText(/fraud item/)).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Queue filter' })).getAllByRole('listitem'),
    ).toHaveLength(9);
  });
});
