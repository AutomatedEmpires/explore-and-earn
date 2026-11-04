// Errors carry ids, not personal data (spec section 13). Drizzle wraps every failed query in an
// error whose message ends with the query's parameters, which are often an email or a name.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { users } from '@/db/schema';
import { createTestDb, type TestDb } from '../../tests/helpers/db';
import { newId } from './ids';
import { logger, scrubError } from './logger';
import { safeErrorMessage, stripQueryParams } from './scrub';
import { runWithRequestContext } from '@/server/request-context';

const EMAIL = 'maya.private@example.test';
const NAME = 'Maya Private-Rodriguez';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A real failed drizzle insert whose parameters carry an email and a name. */
async function failedInsert(): Promise<unknown> {
  try {
    await t.db.insert(users).values({
      id: newId(),
      clerkUserId: 'user_scrub',
      email: EMAIL,
      displayName: NAME,
      // Violates the account_type CHECK constraint.
      accountType: 'bogus' as 'seeker',
    });
  } catch (err) {
    return err;
  }
  throw new Error('the insert should have failed');
}

function captureLines(level: 'error' | 'warn' | 'log'): string[] {
  const lines: string[] = [];
  vi.spyOn(console, level).mockImplementation((line: unknown) => {
    lines.push(String(line));
  });
  return lines;
}

describe('scrubError', () => {
  it('drops the parameters of a failed query, keeping the SQL and the database error', async () => {
    const err = await failedInsert();
    // The precondition: drizzle's own message does carry the values.
    expect(String((err as Error).message)).toContain(EMAIL);

    const clean = scrubError(err);
    expect(clean).toBeInstanceOf(Error);
    const text = [(clean as Error).message, (clean as Error).stack, String((clean as Error).cause)].join(
      '\n',
    );
    expect(text).toContain('insert into "app"."users"');
    expect(text).toContain('account_type');
    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(NAME);
  });

  it('also strips the parameters quoted inside another error, or a stored message', async () => {
    const query = (await failedInsert()) as Error;
    const wrapper = new Error(`Could not save: ${query.message}`, { cause: query });
    const lines = captureLines('error');

    logger.error('wrapped', { err: wrapper });

    expect(lines[0]).toContain('Could not save: Failed query: insert into');
    expect(lines[0]).toContain('at failedInsert');
    expect(lines[0]).not.toContain(EMAIL);
    expect(lines[0]).not.toContain(NAME);
    for (const value of [query, wrapper, query.message]) {
      const stored = safeErrorMessage(value);
      expect(stored).toContain('Failed query: insert into');
      expect(stored).not.toContain(EMAIL);
    }
    expect(stripQueryParams('Failed query: select $1\nparams: a@b.test,\nsecond line')).toBe(
      'Failed query: select $1',
    );
  });

  it('leaves other values alone', () => {
    const plain = new Error('nothing personal');
    expect(scrubError(plain)).toBe(plain);
    expect(scrubError('text')).toBe('text');
  });
});

describe('logger', () => {
  it('never writes the parameters of a failed query', async () => {
    const err = await failedInsert();
    const lines = captureLines('error');

    logger.error('it failed', { err, nested: { error: err } });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Failed query');
    expect(lines[0]).not.toContain(EMAIL);
    expect(lines[0]).not.toContain(NAME);
  });

  it("adds the current request's id when the caller did not", () => {
    const lines = captureLines('log');
    runWithRequestContext({ requestId: 'req-from-context-1' }, () => {
      logger.info('inside a request');
      logger.info('explicit id wins', { requestId: 'req-explicit-1' });
    });
    logger.info('outside any request');

    const records = lines.map((l) => JSON.parse(l) as { requestId?: string });
    expect(records.map((r) => r.requestId)).toEqual([
      'req-from-context-1',
      'req-explicit-1',
      undefined,
    ]);
  });
});
