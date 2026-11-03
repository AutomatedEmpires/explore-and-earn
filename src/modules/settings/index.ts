// Public API of the settings module (typed operator settings). Owned by W3 (Task 10).
import { sql } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { record } from '@/modules/audit';
import type { HandlerMap } from '@/modules/jobs';
import {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_SCHEMAS,
  type SettingKey,
  type SettingValue,
  type SettingValues,
} from './registry';
import { settings } from './schema';

export {
  SETTING_DEFAULTS,
  SETTING_KEYS,
  type SettingKey,
  type SettingValue,
  type SettingValues,
} from './registry';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTING_SCHEMAS, key);
}

/** The stored value if it is present and valid, else a copy of the default. */
function resolve<K extends SettingKey>(key: K, storedJson: string | undefined): SettingValue<K> {
  if (storedJson === undefined) return structuredClone(SETTING_DEFAULTS[key]);
  const parsed = SETTING_SCHEMAS[key].safeParse(JSON.parse(storedJson));
  if (parsed.success) return parsed.data;
  logger.warn('stored setting is invalid; using its default', {
    key,
    issues: parsed.error.issues,
  });
  return structuredClone(SETTING_DEFAULTS[key]);
}

async function readStored(
  db: DbOrTx,
  key: SettingKey,
  opts: { forUpdate?: boolean } = {},
): Promise<string | undefined> {
  const lock = opts.forUpdate ? sql` for update` : sql``;
  const rows = await queryRows<{ value: string }>(
    db,
    sql`select value::text as value from app.settings where key = ${key}${lock}`,
  );
  return rows[0]?.value;
}

/** Reads a setting, falling back to its default when nothing (valid) is stored. */
export async function getSetting<K extends SettingKey>(
  db: DbOrTx,
  key: K,
): Promise<SettingValue<K>> {
  return resolve(key, await readStored(db, key));
}

/** Every setting's current value, for the operator console. */
export async function getAllSettings(db: DbOrTx): Promise<SettingValues> {
  const rows = await queryRows<{ key: string; value: string }>(
    db,
    sql`select key, value::text as value from app.settings`,
  );
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const out = structuredClone(SETTING_DEFAULTS) as SettingValues;
  const assign = <K extends SettingKey>(key: K) => {
    out[key] = resolve(key, stored.get(key));
  };
  for (const key of SETTING_KEYS) assign(key);
  return out;
}

/**
 * Validates and stores a setting, and records `settings.updated` (with the previous and new
 * values) in the same transaction. Throws `bad_request` for an unknown key or invalid value.
 */
export async function setSetting<K extends SettingKey>(
  db: Db,
  key: K,
  value: SettingValue<K>,
  actor: { operatorId: string },
): Promise<void> {
  if (!isSettingKey(key)) throw badRequest(`Unknown setting: ${String(key)}`);
  if (!UUID.test(actor.operatorId)) throw badRequest('operatorId must be a UUID');

  const parsed = SETTING_SCHEMAS[key].safeParse(value);
  if (!parsed.success) throw badRequest(`Invalid value for ${key}`, parsed.error.issues);
  const next = parsed.data;

  await withTx(db, async (tx) => {
    const previous = resolve(key, await readStored(tx, key, { forUpdate: true }));
    await tx
      .insert(settings)
      .values({ key, value: sql`${JSON.stringify(next)}::jsonb`, updatedBy: actor.operatorId })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`excluded.value`, updatedBy: sql`excluded.updated_by` },
      });
    await record(tx, {
      actorType: 'operator',
      actorId: actor.operatorId,
      action: 'settings.updated',
      subjectType: 'setting',
      subjectId: key,
      data: { key, previous, value: next },
    });
  });
}

export const jobHandlers: HandlerMap = {};
