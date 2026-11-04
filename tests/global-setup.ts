import { ensureTemplate } from './helpers/db';

/** Builds the migrated PGlite template once, before the unit test workers start. */
export default async function setup(): Promise<void> {
  await ensureTemplate();
}
