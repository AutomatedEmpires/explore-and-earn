// Keyset cursors (SP3 spec 8.4, plan Task 18 and Plan decision 4): base64url JSON of the last
// item's sort values and id, the query hash, the day the first page was read (`asOf`), the
// placement hook's opaque state (`ps`) and the page index (`pi`). A cursor minted for another
// query or sort, or one that doesn't decode, is a 400.
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalQuery, type DiscoveryQuery, type DiscoverySort } from '@/lib/discovery';
import { badRequest } from '@/lib/errors';

export type Cursor = {
  v: 1;
  h: string;
  s: (string | number | null)[];
  id: string;
  asOf: string;
  ps: string | null;
  pi: number;
};

const STALE = 'This page link is out of date. Search again.';

const CursorSchema = z
  .object({
    v: z.literal(1),
    h: z.string().regex(/^[0-9a-f]{64}$/),
    s: z.array(z.union([z.string().max(64), z.number().finite(), z.null()])).max(8),
    id: z.uuid(),
    asOf: z.iso.date(),
    ps: z.string().max(1024).nullable(),
    pi: z.number().int().min(0).max(100_000),
  })
  .strict();

/** sha256(canonicalQuery + '|' + sort), hex. */
export function cursorHash(q: DiscoveryQuery, sort: DiscoverySort): string {
  return createHash('sha256')
    .update(`${canonicalQuery(q)}|${sort}`)
    .digest('hex');
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

/** The cursor, or a 400 when it is malformed or belongs to another query. */
export function decodeCursor(raw: string, expectHash: string): Cursor {
  let json: unknown;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error('not base64url');
    json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw badRequest(STALE);
  }
  const parsed = CursorSchema.safeParse(json);
  if (!parsed.success || parsed.data.h !== expectHash) throw badRequest(STALE);
  return parsed.data;
}

/** The 400 for a cursor whose sort values don't fit the sort they claim. */
export function staleCursor(): Error {
  return badRequest(STALE);
}
