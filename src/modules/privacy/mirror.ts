// The deletion ledger's copy outside the main database (SP8 spec 8.11). After a restore from a
// backup taken before someone was erased, the ledger says who must be erased again; the mirror
// is the copy of the ledger that the restore cannot roll back. It holds ids and a time, nothing
// else.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@/lib/db';
import { getEnv, type Env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { privacyDeletionLedger } from './schema';

export type LedgerEntry = { ledgerId: string; userId: string; requestId: string; erasedAt: string };

export interface LedgerMirror {
  put(e: LedgerEntry): Promise<void>;
  listSince(since: Date): Promise<LedgerEntry[]>;
}

const LEDGER_BUCKET = 'ledger';
const LOCAL_DIR = '.data/backup/ledger';
const DAY_MS = 24 * 60 * 60 * 1000;

const storedEntry = z.object({
  userId: z.uuid(),
  requestId: z.uuid(),
  erasedAt: z.iso.datetime({ offset: true }),
});

const dayOf = (iso: string) => iso.slice(0, 10);
const body = (e: LedgerEntry) =>
  JSON.stringify({ userId: e.userId, requestId: e.requestId, erasedAt: e.erasedAt });

/** Every UTC day from `since` to `until`, as `YYYY-MM-DD`. */
function daysBetween(since: Date, until: Date): string[] {
  const days: string[] = [];
  const end = dayOf(until.toISOString());
  for (let t = Date.parse(`${dayOf(since.toISOString())}T00:00:00Z`); ; t += DAY_MS) {
    const day = dayOf(new Date(t).toISOString());
    if (day > end) break;
    days.push(day);
  }
  return days;
}

function parseEntry(ledgerId: string, text: string, since: Date): LedgerEntry | null {
  const parsed = storedEntry.safeParse(JSON.parse(text));
  if (!parsed.success || Date.parse(parsed.data.erasedAt) < since.getTime()) return null;
  return { ledgerId, ...parsed.data };
}

/** The mirror used when no backup project is configured outside dev. It stores nothing. */
export const NOOP_LEDGER_MIRROR: LedgerMirror = {
  async put() {
    logger.warn('ledger mirror not configured');
  },
  async listSince() {
    logger.warn('ledger mirror not configured');
    return [];
  },
};

/** Dev: one JSON file per entry under `.data/backup/ledger/<day>/`. */
export function localLedgerMirror(dir: string = LOCAL_DIR): LedgerMirror {
  return {
    async put(e) {
      const folder = path.join(dir, dayOf(e.erasedAt));
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, `${e.ledgerId}.json`), body(e), 'utf8');
    },
    async listSince(since) {
      const entries: LedgerEntry[] = [];
      for (const day of daysBetween(since, new Date())) {
        let names: string[];
        try {
          names = await readdir(path.join(dir, day));
        } catch {
          continue;
        }
        for (const name of names.filter((n) => n.endsWith('.json')).sort()) {
          const text = await readFile(path.join(dir, day, name), 'utf8');
          const entry = parseEntry(name.slice(0, -'.json'.length), text, since);
          if (entry) entries.push(entry);
        }
      }
      return entries;
    },
  };
}

/** The backup project's `ledger` bucket: `<day of erasedAt>/<ledgerId>.json`. */
export function supabaseLedgerMirror(url: string, serviceRoleKey: string): LedgerMirror {
  let client: ReturnType<typeof createClient> | undefined;
  const bucket = () => {
    client ??= createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return client.storage.from(LEDGER_BUCKET);
  };
  return {
    async put(e) {
      const { error } = await bucket().upload(`${dayOf(e.erasedAt)}/${e.ledgerId}.json`, body(e), {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) throw new Error(`ledger mirror: write failed (${error.name})`);
    },
    async listSince(since) {
      const entries: LedgerEntry[] = [];
      for (const day of daysBetween(since, new Date())) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await bucket().list(day, {
            limit: 1000,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          });
          if (error) throw new Error(`ledger mirror: list failed (${error.name})`);
          for (const object of data) {
            if (!object.name.endsWith('.json')) continue;
            const file = await bucket().download(`${day}/${object.name}`);
            if (file.error) throw new Error(`ledger mirror: read failed (${file.error.name})`);
            const entry = parseEntry(
              object.name.slice(0, -'.json'.length),
              await file.data.text(),
              since,
            );
            if (entry) entries.push(entry);
          }
          if (data.length < 1000) break;
        }
      }
      return entries;
    },
  };
}

/**
 * The backup project when its keys are set; a local folder in dev; otherwise a mirror that
 * stores nothing and logs `ledger mirror not configured`.
 */
export function getLedgerMirror(
  env: Pick<
    Env,
    'APP_ENV' | 'BACKUP_SUPABASE_URL' | 'BACKUP_SUPABASE_SERVICE_ROLE_KEY'
  > = getEnv(),
): LedgerMirror {
  if (env.BACKUP_SUPABASE_URL && env.BACKUP_SUPABASE_SERVICE_ROLE_KEY) {
    return supabaseLedgerMirror(env.BACKUP_SUPABASE_URL, env.BACKUP_SUPABASE_SERVICE_ROLE_KEY);
  }
  return env.APP_ENV === 'dev' ? localLedgerMirror() : NOOP_LEDGER_MIRROR;
}

/**
 * The `privacy.ledger_mirror` job: copies one ledger row to the mirror and stamps it. With no
 * mirror configured the row stays unstamped, so a later run can still copy it.
 */
export async function mirrorLedgerEntry(
  db: Db,
  ledgerId: string,
  deps: { mirror?: LedgerMirror; now?: Date } = {},
): Promise<void> {
  const [row] = await db
    .select()
    .from(privacyDeletionLedger)
    .where(eq(privacyDeletionLedger.id, ledgerId));
  if (!row || row.mirroredAt) return;
  const mirror = deps.mirror ?? getLedgerMirror();
  await mirror.put({
    ledgerId: row.id,
    userId: row.userId,
    requestId: row.requestId,
    erasedAt: row.erasedAt.toISOString(),
  });
  if (mirror === NOOP_LEDGER_MIRROR) return;
  await db
    .update(privacyDeletionLedger)
    .set({ mirroredAt: deps.now ?? new Date() })
    .where(eq(privacyDeletionLedger.id, row.id));
}
